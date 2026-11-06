#!/usr/bin/env node
// Convierte el Excel personal en los JSON que lee importar-historico-excel.mjs:
//   scripts/datos-importacion/datos-excel.json         (movimientos 2026 + totales de patrimonio)
//   scripts/datos-importacion/patrimonio-detalle.json  (patrimonio por cuenta/inversión/deuda)
//
// Uso:
//   node scripts/extraer-datos-excel.mjs "ruta/al/Excel.xlsx" [--escribir]
//
// Sin --escribir solo compara con los JSON actuales y lista qué cambiaría;
// con --escribir además los sobrescribe. Después se importa con
// importar-historico-excel.mjs, que actualiza lo que ya existía.
//
// La estructura de categorías (qué fila es padre y cuáles sus hijas) se
// toma del datos-excel.json existente y no del Excel: la hoja no marca la
// jerarquía de forma que se pueda leer sin ambigüedad. Las filas del Excel
// que no estén en esa estructura se avisan, no se importan en silencio.
// Este archivo no contiene ningún dato personal a propósito: el repositorio
// es público y los nombres e importes viven solo en datos-importacion/
// (ignorada por git).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARPETA_DATOS = path.join(__dirname, 'datos-importacion');
const RUTA_DATOS = path.join(CARPETA_DATOS, 'datos-excel.json');
const RUTA_DETALLE = path.join(CARPETA_DATOS, 'patrimonio-detalle.json');

const ANIO_MOVIMIENTOS = 2026;

// Bloques de la hoja Resumen: título de la sección -> bloque de patrimonio_historico_item.
const SECCIONES_PATRIMONIO = [
  { titulo: 'Dinero en cuenta', bloque: 'cuenta', total: 'total_cuentas' },
  { titulo: 'Inversiones líquidas', bloque: 'inversion_liquida', total: 'total_inversiones_liquidas' },
  { titulo: 'Inversiones líquidas pero intocables', bloque: 'inversion_intocable', total: 'total_inversiones_intocables' },
  { titulo: 'Inversiones ilíquidas', bloque: 'inversion_iliquida', total: 'total_inversiones_iliquidas' },
  { titulo: 'Deuda', bloque: 'deuda', total: 'total_deuda' },
];
// Fila que marca hasta qué mes hay datos reales en Resumen: las columnas
// posteriores son previsiones (cuotas futuras de deuda, saldos a 1 €).
const FILA_MESES_REALES = 'Total líquido';

function normalizar(texto) {
  return String(texto ?? '').trim().replace(/\s+/g, ' ');
}

function redondear(n) {
  return Math.round(n * 100) / 100;
}

function filasDeHoja(libro, nombre) {
  const hoja = libro.Sheets[nombre];
  if (!hoja) throw new Error(`El Excel no tiene la hoja "${nombre}"`);
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null });
}

/** Columna de la etiqueta de cada fila: la primera columna de texto antes de los meses. */
function etiquetaFila(fila, columnaEne) {
  for (let c = 0; c < columnaEne; c++) {
    if (typeof fila[c] === 'string' && fila[c].trim()) return normalizar(fila[c]);
  }
  return '';
}

function doceMeses(fila, columnaEne) {
  return Array.from({ length: 12 }, (_, i) => {
    const v = fila[columnaEne + i];
    return typeof v === 'number' && Number.isFinite(v) ? redondear(v) : 0;
  });
}

/** Localiza el bloque de un año: la columna "ENE" que hay debajo de la celda con el año. */
function columnaEneDelAnio(filas, anio) {
  for (let r = 0; r < filas.length - 1; r++) {
    const c = filas[r].indexOf(anio);
    if (c >= 0 && filas[r + 1][c] === 'ENE') return { filaCabecera: r + 1, columnaEne: c };
  }
  throw new Error(`No encuentro el bloque del año ${anio} (celda ${anio} con "ENE" debajo)`);
}

// ---------------------------------------------------------------------
// Movimientos (hojas Casa def y Piso Carabanchel)
// ---------------------------------------------------------------------

function extraerMovimientos(libro, plantilla, avisos) {
  const casa = filasDeHoja(libro, 'Casa def');
  const { filaCabecera, columnaEne } = columnaEneDelAnio(casa, ANIO_MOVIMIENTOS);

  // Filas con etiqueta hasta el primer bloque de cálculos (CF - Ingresos).
  const filas = [];
  for (let r = filaCabecera + 1; r < casa.length; r++) {
    const etiqueta = etiquetaFila(casa[r], columnaEne);
    if (!etiqueta) continue;
    if (etiqueta.startsWith('CF ')) break;
    filas.push({ etiqueta, valores: doceMeses(casa[r], columnaEne) });
  }
  const usadas = new Set();
  const tomar = (etiqueta, desde = 0) => {
    const i = filas.findIndex((f, j) => j >= desde && !usadas.has(j) && f.etiqueta === normalizar(etiqueta));
    if (i < 0) throw new Error(`No encuentro la fila "${etiqueta}" en Casa def`);
    usadas.add(i);
    return { ...filas[i], indice: i };
  };

  const ingresos = plantilla.casa_def.ingresos.map((ing) => ({ nombre: ing.nombre, valores: tomar(ing.nombre).valores }));

  // Los hijos se buscan a partir de la fila de su padre, porque hay
  // nombres repetidos en grupos distintos (p. ej. "Otros").
  const gastos_raiz = plantilla.casa_def.gastos_raiz.map((grupo) => {
    const padre = tomar(grupo.nombre);
    return {
      nombre: grupo.nombre,
      valores: padre.valores,
      hijos: grupo.hijos.map((hijo) => ({ nombre: hijo.nombre, valores: tomar(hijo.nombre, padre.indice + 1).valores })),
    };
  });

  const ingAlicante = plantilla.piso_alicante.ingresos[0];
  const piso_alicante = {
    ingresos: [{ nombre: ingAlicante.nombre, valores: tomar(ingAlicante.nombre).valores }],
    gastos: { nombre: plantilla.piso_alicante.gastos.nombre, valores: tomar(plantilla.piso_alicante.gastos.nombre).valores, hijos: [] },
  };

  // El alquiler de Carabanchel viene de su propia hoja; en Casa def aparece
  // también (con otro nombre) y con su fila total de gastos: se marcan como
  // usadas para que no salgan como "no importadas".
  const carab = filasDeHoja(libro, 'Piso Carabanchel');
  const bloqueCarab = columnaEneDelAnio(carab, ANIO_MOVIMIENTOS);
  const filasCarab = carab
    .slice(bloqueCarab.filaCabecera + 1)
    .map((f) => ({ etiqueta: normalizar(f[0]), valores: doceMeses(f, bloqueCarab.columnaEne) }))
    .filter((f) => f.etiqueta);
  const filaCarab = (etiqueta, desde = 0) => {
    const i = filasCarab.findIndex((f, j) => j >= desde && f.etiqueta === normalizar(etiqueta));
    if (i < 0) throw new Error(`No encuentro la fila "${etiqueta}" en Piso Carabanchel`);
    return { ...filasCarab[i], indice: i };
  };
  const inicioGastosCarab = filaCarab('Gastos mensuales piso').indice;
  const piso_carabanchel = {
    ingresos: [{ nombre: plantilla.piso_carabanchel.ingresos[0].nombre, valores: filaCarab('Alquiler').valores }],
    gastos: {
      nombre: plantilla.piso_carabanchel.gastos.nombre,
      hijos: plantilla.piso_carabanchel.gastos.hijos.map((h) => ({
        nombre: h.nombre,
        valores: filaCarab(h.nombre, inicioGastosCarab + 1).valores,
      })),
    },
  };
  // Las filas de Casa def que duplican lo que se importa desde la hoja del
  // piso: el alquiler (con otro nombre) y el total de sus gastos.
  for (let i = 0; i < filas.length; i++) {
    if (usadas.has(i)) continue;
    const coincideAlquiler = filas[i].valores.join() === piso_carabanchel.ingresos[0].valores.join();
    if (coincideAlquiler || filas[i].etiqueta === normalizar(plantilla.piso_carabanchel.gastos.nombre)) usadas.add(i);
  }

  for (let i = 0; i < filas.length; i++) {
    if (!usadas.has(i) && filas[i].valores.some((v) => v !== 0)) {
      avisos.push(`Casa def: la fila "${filas[i].etiqueta}" tiene importes en ${ANIO_MOVIMIENTOS} pero no está en la estructura de categorías; NO se importa`);
    }
  }

  return { casa_def: { ingresos, gastos_raiz }, piso_carabanchel, piso_alicante };
}

// ---------------------------------------------------------------------
// Patrimonio (hoja Resumen)
// ---------------------------------------------------------------------

function mesDeCabecera(valor) {
  if (typeof valor !== 'number') return null;
  const d = XLSX.SSF.parse_date_code(valor);
  // Algunas cabeceras son fechas a mitad de mes (p. ej. 2026-04-02): se
  // normalizan al día 1, que es como se guarda el patrimonio mensual.
  return `${d.y}-${String(d.m).padStart(2, '0')}-01`;
}

function extraerPatrimonio(libro, avisos) {
  const filas = filasDeHoja(libro, 'Resumen');
  const filaLimite = filas.find((f) => normalizar(f[0]) === FILA_MESES_REALES);
  if (!filaLimite) throw new Error(`No encuentro la fila "${FILA_MESES_REALES}" en Resumen`);
  let ultimaColumnaReal = 0;
  filaLimite.forEach((v, c) => {
    if (c > 0 && typeof v === 'number') ultimaColumnaReal = c;
  });

  const totales = {};
  const items = [];
  for (const seccion of SECCIONES_PATRIMONIO) {
    const r = filas.findIndex((f) => normalizar(f[0]) === seccion.titulo);
    if (r < 0) throw new Error(`No encuentro la sección "${seccion.titulo}" en Resumen`);
    const meses = filas[r].map((v, c) => (c > 0 && c <= ultimaColumnaReal ? mesDeCabecera(v) : null));

    const suma = {};
    for (let i = r + 1; i < filas.length; i++) {
      const concepto = normalizar(filas[i][0]);
      if (!concepto || concepto === 'null') continue;
      if (concepto.startsWith('Total')) break;
      const valores = {};
      meses.forEach((mes, c) => {
        const v = filas[i][c];
        if (!mes || typeof v !== 'number' || !Number.isFinite(v)) return;
        // La deuda se guarda en positivo: el bloque ya dice que resta.
        const valor = redondear(seccion.bloque === 'deuda' ? Math.abs(v) : v);
        valores[mes] = valor;
        suma[mes] = redondear((suma[mes] ?? 0) + valor);
      });
      if (Object.keys(valores).length > 0) items.push({ bloque: seccion.bloque, concepto, valores });
    }

    totales[seccion.total] = Object.fromEntries(
      meses.filter(Boolean).map((mes) => [mes, suma[mes] ?? 0])
    );
  }

  const nMeses = Object.keys(totales.total_cuentas).length;
  if (nMeses === 0) avisos.push('Resumen: no se ha encontrado ningún mes con datos reales');
  return { patrimonio_historico: totales, detalle: { items } };
}

// ---------------------------------------------------------------------
// Comparación con lo que ya hay
// ---------------------------------------------------------------------

function compararSeries(nombre, antes, despues, cambios) {
  const claves = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  for (const k of [...claves].sort()) {
    const a = antes?.[k] ?? 0;
    const d = despues?.[k] ?? 0;
    if (Math.abs(a - d) > 0.005) cambios.push(`${nombre} [${k}]: ${a} -> ${d}`);
  }
}

function aMapaMeses(valores) {
  return Object.fromEntries(valores.map((v, i) => [`${ANIO_MOVIMIENTOS}-${String(i + 1).padStart(2, '0')}`, v]));
}

function compararMovimientos(antes, despues, cambios) {
  const recorrer = (grupoA, grupoD, prefijo) => {
    grupoD.forEach((d, i) => {
      const a = grupoA[i];
      if (d.valores) compararSeries(`${prefijo}${d.nombre}`, aMapaMeses(a.valores ?? []), aMapaMeses(d.valores), cambios);
      if (d.hijos) recorrer(a.hijos, d.hijos, `${prefijo}${d.nombre} > `);
    });
  };
  recorrer(antes.casa_def.ingresos, despues.casa_def.ingresos, 'Ingreso: ');
  recorrer(antes.casa_def.gastos_raiz, despues.casa_def.gastos_raiz, 'Gasto: ');
  recorrer(antes.piso_alicante.ingresos, despues.piso_alicante.ingresos, 'Ingreso: ');
  recorrer([antes.piso_alicante.gastos], [despues.piso_alicante.gastos], 'Gasto: ');
  recorrer(antes.piso_carabanchel.ingresos, despues.piso_carabanchel.ingresos, 'Ingreso: ');
  recorrer([antes.piso_carabanchel.gastos], [despues.piso_carabanchel.gastos], 'Gasto: ');
}

function main() {
  const args = process.argv.slice(2);
  const escribir = args.includes('--escribir');
  const rutaExcel = args.find((a) => !a.startsWith('--'));
  if (!rutaExcel) {
    console.error('Uso: node scripts/extraer-datos-excel.mjs "ruta/al/Excel.xlsx" [--escribir]');
    process.exitCode = 1;
    return;
  }
  if (!existsSync(RUTA_DATOS)) {
    console.error(`Falta ${RUTA_DATOS}: es la estructura de categorías de la que parte la extracción.`);
    process.exitCode = 1;
    return;
  }

  const plantilla = JSON.parse(readFileSync(RUTA_DATOS, 'utf-8'));
  // XLSX.read sobre el buffer: la versión ESM de SheetJS no trae acceso a
  // disco por sí sola (XLSX.readFile falla sin XLSX.set_fs).
  const libro = XLSX.read(readFileSync(rutaExcel));
  const avisos = [];

  const movimientos = extraerMovimientos(libro, plantilla, avisos);
  const { patrimonio_historico, detalle } = extraerPatrimonio(libro, avisos);
  const datos = { ...movimientos, patrimonio_historico };

  const cambios = [];
  compararMovimientos(plantilla, datos, cambios);
  for (const k of Object.keys(patrimonio_historico)) {
    compararSeries(`Patrimonio ${k}`, plantilla.patrimonio_historico[k], patrimonio_historico[k], cambios);
  }
  if (existsSync(RUTA_DETALLE)) {
    const detalleAntes = JSON.parse(readFileSync(RUTA_DETALLE, 'utf-8'));
    const porClave = new Map(detalleAntes.items.map((it) => [`${it.bloque}|${it.concepto}`, it.valores]));
    for (const it of detalle.items) {
      compararSeries(`Detalle ${it.bloque} ${it.concepto}`, porClave.get(`${it.bloque}|${it.concepto}`), it.valores, cambios);
    }
  }

  const meses = Object.keys(patrimonio_historico.total_cuentas);
  console.log(`Movimientos ${ANIO_MOVIMIENTOS}: ${datos.casa_def.ingresos.length} ingresos, ${datos.casa_def.gastos_raiz.length} grupos de gasto + pisos.`);
  console.log(`Patrimonio: ${meses.length} meses (${meses[0]} a ${meses.at(-1)}), ${detalle.items.length} conceptos de detalle.`);
  if (!existsSync(RUTA_DETALLE)) console.log('Detalle de patrimonio: no había patrimonio-detalle.json, se generaría nuevo.');

  console.log(`\nCambios respecto a los JSON actuales: ${cambios.length}`);
  for (const c of cambios) console.log('  ' + c);
  if (avisos.length) {
    console.log('\nAvisos:');
    for (const a of avisos) console.log('  ! ' + a);
  }

  if (escribir) {
    writeFileSync(RUTA_DATOS, JSON.stringify(datos, null, 2) + '\n');
    writeFileSync(RUTA_DETALLE, JSON.stringify(detalle, null, 2) + '\n');
    console.log(`\nEscritos ${path.relative(process.cwd(), RUTA_DATOS)} y ${path.relative(process.cwd(), RUTA_DETALLE)}.`);
  } else {
    console.log('\n(Solo comparación. Añade --escribir para guardar los JSON.)');
  }
}

main();
