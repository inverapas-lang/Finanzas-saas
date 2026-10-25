#!/usr/bin/env node
// Importa de una sola vez el histórico de "Casa def" + "Piso Carabanchel"
// + "Piso Alicante" + "Resumen" de un Excel personal a un espacio
// financiero de la plataforma: crea las categorías (con jerarquía
// padre/hijo), carga los movimientos mes a mes de 2026 como ya
// confirmados, y rellena el histórico de patrimonio neto mes a mes.
//
// Usa el propio login del usuario (igual que la app: nunca la service
// role), así que respeta las mismas reglas de RLS/permisos que usar la
// interfaz a mano — solo que en bloque.
//
// Uso:
//   SUPABASE_EMAIL=tu@email.com SUPABASE_PASSWORD=tu-contraseña \
//     node scripts/importar-historico-excel.mjs
//
// Es idempotente y "autocorregible": las categorías no se duplican
// (reutiliza la existente con el mismo nombre/tipo/padre), y tanto los
// movimientos como patrimonio_historico y su detalle por concepto
// ACTUALIZAN la fila existente si ya había una para esa categoría/mes
// (o mes/bloque/concepto) en vez de limitarse a saltarla — así que si
// corriges un dato en datos-excel.json y vuelves a lanzar el script, la
// corrección se aplica de verdad, no se queda ignorada en silencio.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');

function leerEnvLocal() {
  const ruta = path.join(RAIZ, 'apps/web/.env.local');
  if (!existsSync(ruta)) {
    console.log(`(aviso: no se encuentra ${ruta})`);
    return {};
  }
  // .replace del BOM: algunos editores de Windows guardan el archivo con
  // marca de orden de bytes UTF-8 al principio, que si no se quita rompe
  // el match de la primera línea del archivo.
  const contenido = readFileSync(ruta, 'utf-8').replace(/^﻿/, '');
  const vars = {};
  for (const lineaCruda of contenido.split(/\r?\n/)) {
    const linea = lineaCruda.trim();
    const m = linea.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      let valor = m[2].trim();
      // quita comillas si el valor viene entre comillas simples o dobles
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      vars[m[1]] = valor;
    }
  }
  console.log(`(leídas ${Object.keys(vars).length} variables de ${ruta})`);
  return vars;
}

async function preguntar(texto, oculto = false) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(texto);
  rl.close();
  return respuesta.trim();
}

async function main() {
  const env = leerEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (o _PUBLISHABLE_KEY) (ni en el entorno ni en apps/web/.env.local).');
    process.exitCode = 1;
    return;
  }

  const email = process.env.SUPABASE_EMAIL ?? (await preguntar('Email de tu cuenta: '));
  const password = process.env.SUPABASE_PASSWORD ?? (await preguntar('Contraseña: '));

  const supabase = createClient(url, anonKey);
  const { data: sesion, error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin || !sesion.session) {
    console.error('No se ha podido iniciar sesión:', errorLogin?.message ?? 'sin sesión');
    process.exitCode = 1;
    return;
  }
  console.log('Sesión iniciada como', sesion.user.email);

  const { data: espacios, error: errorEspacios } = await supabase
    .from('espacios_financieros')
    .select('id, nombre')
    .order('created_at', { ascending: true });
  if (errorEspacios || !espacios || espacios.length === 0) {
    console.error('No se han podido listar los espacios:', errorEspacios?.message ?? 'ninguno encontrado');
    process.exitCode = 1;
    return;
  }

  let espacio = espacios[0];
  if (espacios.length > 1) {
    console.log('Perteneces a varios espacios:');
    espacios.forEach((e, i) => console.log(`  ${i + 1}) ${e.nombre} (${e.id})`));
    const eleccion = await preguntar(`¿A cuál importamos? [1-${espacios.length}, por defecto 1]: `);
    const indice = Number(eleccion) - 1;
    if (Number.isInteger(indice) && espacios[indice]) espacio = espacios[indice];
  }
  console.log('Importando a:', espacio.nombre, `(${espacio.id})`);

  const datosPath = path.join(RAIZ, 'scripts/datos-importacion/datos-excel.json');
  const datos = JSON.parse(readFileSync(datosPath, 'utf-8'));
  const datosPatrimonioDetallePath = path.join(RAIZ, 'scripts/datos-importacion/patrimonio-detalle.json');
  const datosPatrimonioDetalle = existsSync(datosPatrimonioDetallePath)
    ? JSON.parse(readFileSync(datosPatrimonioDetallePath, 'utf-8'))
    : null;

  const usuarioId = sesion.user.id;

  // ---------- Categorías ----------
  const cacheCategorias = new Map(); // clave `${tipo}:${nombre}:${padreId ?? ''}` -> id

  async function obtenerOCrearCategoria(nombre, tipo, categoriaPadreId = null) {
    const clave = `${tipo}:${nombre}:${categoriaPadreId ?? ''}`;
    if (cacheCategorias.has(clave)) return cacheCategorias.get(clave);

    let consulta = supabase
      .from('categorias')
      .select('id')
      .eq('espacio_id', espacio.id)
      .eq('tipo', tipo)
      .eq('nombre', nombre);
    // .is() de PostgREST solo admite null/true/false — para comparar con
    // un UUID real hace falta .eq().
    consulta = categoriaPadreId === null ? consulta.is('categoria_padre_id', null) : consulta.eq('categoria_padre_id', categoriaPadreId);
    const { data: existente, error: errorBuscar } = await consulta.maybeSingle();
    if (errorBuscar) throw new Error(`Buscando categoría "${nombre}": ${errorBuscar.message}`);
    if (existente) {
      cacheCategorias.set(clave, existente.id);
      return existente.id;
    }

    const { data: creada, error: errorCrear } = await supabase
      .from('categorias')
      .insert({ espacio_id: espacio.id, tipo, nombre, categoria_padre_id: categoriaPadreId })
      .select('id')
      .single();
    if (errorCrear) throw new Error(`Creando categoría "${nombre}": ${errorCrear.message}`);
    console.log('  + categoría creada:', tipo, nombre);
    cacheCategorias.set(clave, creada.id);
    return creada.id;
  }

  const MESES_2026 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`);

  async function cargarSerieMensual(categoriaId, tipo, nombreDescripcion, valores) {
    const tabla = tipo === 'ingreso' ? 'ingresos' : 'gastos';

    // Idempotencia: si el script se interrumpe a mitad (como ya ha
    // pasado) o se corrige un dato en datos-excel.json y se relanza, no
    // debe duplicar los movimientos de las categorías que ya se
    // cargaron — pero tampoco debe limitarse a saltarlos en silencio
    // (eso dejaría una corrección sin aplicar). Se busca el id de la
    // fila existente por categoría+fecha y, si existe, se actualiza en
    // vez de insertar otra.
    const { data: existentes, error: errorExistentes } = await supabase
      .from(tabla)
      .select('id, fecha_prevista')
      .eq('espacio_id', espacio.id)
      .eq('categoria_id', categoriaId)
      .in('fecha_prevista', MESES_2026);
    if (errorExistentes) throw new Error(`Comprobando ${tabla} existentes de "${nombreDescripcion}": ${errorExistentes.message}`);
    const idExistentePorFecha = new Map((existentes ?? []).map((f) => [f.fecha_prevista, f.id]));

    const filasNuevas = [];
    let actualizadas = 0;
    for (let i = 0; i < valores.length; i++) {
      const valor = valores[i];
      if (!valor) continue; // no crear movimientos de 0€, no aportan nada
      const fecha = MESES_2026[i];
      const importe = Math.abs(valor);

      const campos = {
        descripcion: `${nombreDescripcion} — ${fecha.slice(0, 7)}`,
        importe_real: importe,
        ...(tipo === 'ingreso'
          ? { importe_esperado: importe, fecha_cobrada: fecha }
          : { importe_previsto: importe, fecha_pagada: fecha }),
      };

      const idExistente = idExistentePorFecha.get(fecha);
      if (idExistente) {
        const { error } = await supabase.from(tabla).update(campos).eq('id', idExistente);
        if (error) throw new Error(`Actualizando ${tabla} de "${nombreDescripcion}" (${fecha}): ${error.message}`);
        actualizadas++;
        continue;
      }

      filasNuevas.push({
        espacio_id: espacio.id,
        categoria_id: categoriaId,
        fecha_prevista: fecha,
        moneda: 'EUR',
        periodicidad: 'unico',
        created_by: usuarioId,
        ...campos,
      });
    }
    if (actualizadas > 0) console.log(`  (${nombreDescripcion}: ${actualizadas} meses ya existían, actualizados con el valor actual)`);
    if (filasNuevas.length === 0) return actualizadas;
    const { error } = await supabase.from(tabla).insert(filasNuevas);
    if (error) throw new Error(`Insertando ${tabla} de "${nombreDescripcion}": ${error.message}`);
    return filasNuevas.length + actualizadas;
  }

  let totalMovimientos = 0;

  console.log('\n--- Ingresos (Casa def) ---');
  for (const ing of datos.casa_def.ingresos) {
    const catId = await obtenerOCrearCategoria(ing.nombre, 'ingreso');
    totalMovimientos += await cargarSerieMensual(catId, 'ingreso', ing.nombre, ing.valores);
  }

  console.log('\n--- Gastos (Casa def) ---');
  for (const grupo of datos.casa_def.gastos_raiz) {
    const padreId = await obtenerOCrearCategoria(grupo.nombre, 'gasto');
    if (grupo.hijos.length === 0) {
      totalMovimientos += await cargarSerieMensual(padreId, 'gasto', grupo.nombre, grupo.valores);
    } else {
      for (const hijo of grupo.hijos) {
        const hijoId = await obtenerOCrearCategoria(hijo.nombre, 'gasto', padreId);
        totalMovimientos += await cargarSerieMensual(hijoId, 'gasto', hijo.nombre, hijo.valores);
      }
    }
  }

  console.log('\n--- Piso Carabanchel ---');
  for (const ing of datos.piso_carabanchel.ingresos) {
    const catId = await obtenerOCrearCategoria(ing.nombre, 'ingreso');
    totalMovimientos += await cargarSerieMensual(catId, 'ingreso', ing.nombre, ing.valores);
  }
  {
    const grupo = datos.piso_carabanchel.gastos;
    const padreId = await obtenerOCrearCategoria(grupo.nombre, 'gasto');
    for (const hijo of grupo.hijos) {
      const hijoId = await obtenerOCrearCategoria(hijo.nombre, 'gasto', padreId);
      totalMovimientos += await cargarSerieMensual(hijoId, 'gasto', hijo.nombre, hijo.valores);
    }
  }

  console.log('\n--- Piso Alicante (sin desglose, hoja de origen muy irregular) ---');
  for (const ing of datos.piso_alicante.ingresos) {
    const catId = await obtenerOCrearCategoria(ing.nombre, 'ingreso');
    totalMovimientos += await cargarSerieMensual(catId, 'ingreso', ing.nombre, ing.valores);
  }
  {
    const grupo = datos.piso_alicante.gastos;
    const catId = await obtenerOCrearCategoria(grupo.nombre, 'gasto');
    totalMovimientos += await cargarSerieMensual(catId, 'gasto', grupo.nombre, grupo.valores);
  }

  console.log(`\nMovimientos creados: ${totalMovimientos}`);

  // ---------- Patrimonio histórico ----------
  console.log('\n--- Histórico de patrimonio (Resumen) ---');
  const { patrimonio_historico: ph } = datos;
  const meses = Object.keys(ph.total_cuentas).sort();
  const filasPatrimonio = meses.map((mes) => ({
    espacio_id: espacio.id,
    mes,
    total_cuentas: ph.total_cuentas[mes] ?? 0,
    total_inversiones_liquidas: ph.total_inversiones_liquidas[mes] ?? 0,
    total_inversiones_intocables: ph.total_inversiones_intocables[mes] ?? 0,
    total_inversiones_iliquidas: ph.total_inversiones_iliquidas[mes] ?? 0,
    total_deuda: ph.total_deuda[mes] ?? 0,
    created_by: usuarioId,
  }));
  // upsert por unique(espacio_id, mes): si el mes ya existía se actualiza
  // con el valor actual de datos-excel.json en vez de dejarlo tal cual
  // estaba (igual que cargarSerieMensual arriba y que el detalle por
  // concepto más abajo).
  const { error: errorPatrimonio } = await supabase
    .from('patrimonio_historico')
    .upsert(filasPatrimonio, { onConflict: 'espacio_id,mes' });
  if (errorPatrimonio) throw new Error(`Guardando patrimonio_historico: ${errorPatrimonio.message}`);
  console.log(`Meses de patrimonio creados/actualizados: ${filasPatrimonio.length}`);

  // ---------- Patrimonio histórico — detalle por concepto ----------
  if (datosPatrimonioDetalle) {
    console.log('\n--- Histórico de patrimonio — detalle por cuenta/inversión/deuda ---');
    let itemsCreados = 0;
    for (const item of datosPatrimonioDetalle.items) {
      const filas = Object.entries(item.valores).map(([mes, valor]) => ({
        espacio_id: espacio.id,
        mes,
        bloque: item.bloque,
        concepto: item.concepto,
        valor,
        created_by: usuarioId,
      }));
      // upsert por la clave única (espacio_id, mes, bloque, concepto): si ya
      // existe un valor para ese concepto y mes, lo actualiza en vez de
      // duplicar — relanzar el script dos veces es seguro.
      const { error } = await supabase
        .from('patrimonio_historico_item')
        .upsert(filas, { onConflict: 'espacio_id,mes,bloque,concepto' });
      if (error) throw new Error(`Insertando detalle de patrimonio "${item.concepto}": ${error.message}`);
      itemsCreados += filas.length;
    }
    console.log(`Filas de detalle de patrimonio creadas/actualizadas: ${itemsCreados}`);
  }

  console.log('\nImportación terminada.');
}

main().catch((e) => {
  console.error('\nError durante la importación:', e.message);
  process.exitCode = 1;
});
