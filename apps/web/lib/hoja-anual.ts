/**
 * Cálculo puro de la hoja anual (/dashboard/hoja-anual), réplica de la
 * hoja de presupuesto del Excel del usuario:
 *
 * - Ingresos y gastos en una sola tabla, ingresos en positivo y gastos en
 *   negativo (como en el Excel, donde el resultado del mes es la suma de
 *   todo).
 * - Cada categoría con subcategorías es una fila de subtotal (la suma de
 *   sus hijas) con sus hijas debajo.
 * - Columnas: los 12 meses, el total del año, el % y el "mensualizado"
 *   (total / 12).
 * - El % de un ingreso es sobre el total de ingresos; el de un gasto, sobre
 *   los gastos sin amortizaciones anticipadas (las mismas referencias que
 *   usa el Excel: $O$141 y $O$155).
 * - Debajo, el bloque de resultados con las mismas fórmulas que el Excel.
 */

export interface CategoriaHoja {
  id: string;
  nombre: string;
  tipo: 'ingreso' | 'gasto';
  categoria_padre_id: string | null;
}

export interface MovimientoHoja {
  id: string;
  categoria_id: string | null;
  importe_esperado?: number | null; // ingresos
  importe_previsto?: number | null; // gastos
  importe_real: number | null;
  fecha_prevista: string; // YYYY-MM-DD
  formula?: string | null;
}

export interface ConfigHojaAnual {
  /** Forecast por mes ('YYYY-MM' -> resultado previsto del mes). */
  forecast: Record<string, number>;
  /** Ingresos extraordinarios a descontar por mes (préstamos recibidos y similares). */
  ingresosExtraordinarios: Record<string, number>;
  /** Saldo de las cuentas a 1 de enero. El resto de meses encadena el saldo final del anterior. */
  saldoInicial: number | null;
  /** Categorías de gasto que son amortizaciones anticipadas (se excluyen de "Gastos sin amortizaciones"). */
  categoriasAmortizacion: string[];
  /** Categorías de ingreso que no vienen del trabajo (alquileres, dividendos...). */
  categoriasIngresosSinTrabajo: string[];
  /** Categorías de gasto ligadas a esos ingresos (gastos e hipotecas de los pisos...), para el neto. */
  categoriasGastosSinTrabajo: string[];
}

export const CONFIG_HOJA_VACIA: ConfigHojaAnual = {
  forecast: {},
  ingresosExtraordinarios: {},
  saldoInicial: null,
  categoriasAmortizacion: [],
  categoriasIngresosSinTrabajo: [],
  categoriasGastosSinTrabajo: [],
};

export interface CeldaHoja {
  /** Con signo de la hoja: gastos en negativo. */
  valor: number;
  /** Id del único movimiento de la celda; null si hay 0 o varios. */
  movimientoId: string | null;
  cantidadMovimientos: number;
  formula: string | null;
}

export interface FilaHoja {
  clave: string;
  categoriaId: string | null;
  nombre: string;
  tipo: 'ingreso' | 'gasto';
  /** 0 = fila principal; 1 = subcategoría bajo un subtotal. */
  nivel: 0 | 1;
  /** Fila de subtotal calculada (no editable). */
  esSubtotal: boolean;
  celdas: CeldaHoja[]; // 12, enero primero
  total: number;
  /** Fracción (0.42 = 42 %) o null si la base es 0. */
  porcentaje: number | null;
  mensualizado: number;
}

export interface FilaResultado {
  clave: string;
  nombre: string;
  valores: (number | null)[]; // 12
  total: number | null;
  mensualizado: number | null;
  formato: 'importe' | 'porcentaje';
  /** Fila que se edita desde la configuración (forecast, extraordinarios, saldo inicial). */
  editable?: 'forecast' | 'ingresosExtraordinarios' | 'saldoInicial';
  destacada?: boolean;
}

export interface BloqueResultados {
  titulo: string;
  filas: FilaResultado[];
}

export interface HojaAnual {
  meses: string[];
  ingresos: FilaHoja[];
  gastos: FilaHoja[];
  resultados: BloqueResultados[];
}

const SIN_CATEGORIA = 'sin-categoria';

export function mesesDe(anio: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
}

function importeAlmacenado(m: MovimientoHoja): number {
  return Number(m.importe_real ?? m.importe_esperado ?? m.importe_previsto ?? 0);
}

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const celdaVacia = (): CeldaHoja => ({ valor: 0, movimientoId: null, cantidadMovimientos: 0, formula: null });

/**
 * Celdas por categoría con el signo de la hoja. Un gasto guardado como
 * 136,57 es -136,57 en la hoja; un gasto guardado en negativo (una
 * devolución) suma en positivo, igual que en el Excel.
 */
function celdasPorCategoria(
  movimientos: MovimientoHoja[],
  signo: 1 | -1,
  meses: string[]
): Map<string, CeldaHoja[]> {
  const indiceMes = new Map(meses.map((m, i) => [m, i]));
  const resultado = new Map<string, CeldaHoja[]>();
  for (const m of movimientos) {
    const i = indiceMes.get(m.fecha_prevista.slice(0, 7));
    if (i === undefined) continue;
    const clave = m.categoria_id ?? SIN_CATEGORIA;
    let celdas = resultado.get(clave);
    if (!celdas) {
      celdas = meses.map(celdaVacia);
      resultado.set(clave, celdas);
    }
    const c = celdas[i];
    c.valor += signo * importeAlmacenado(m);
    c.cantidadMovimientos += 1;
    c.movimientoId = c.cantidadMovimientos === 1 ? m.id : null;
    c.formula = c.cantidadMovimientos === 1 ? m.formula ?? null : null;
  }
  return resultado;
}

function construirFilas(
  tipo: 'ingreso' | 'gasto',
  categorias: CategoriaHoja[],
  celdas: Map<string, CeldaHoja[]>,
  meses: string[]
): FilaHoja[] {
  const propias = categorias.filter((c) => c.tipo === tipo);
  const ids = new Set(propias.map((c) => c.id));
  // Una subcategoría cuyo padre no es del mismo tipo (o no existe) se trata como principal.
  const raices = propias.filter((c) => !c.categoria_padre_id || !ids.has(c.categoria_padre_id));
  const hijasDe = (id: string) => propias.filter((c) => c.categoria_padre_id === id);

  const fila = (c: { id: string | null; nombre: string }, nivel: 0 | 1): FilaHoja => {
    const cs = (c.id && celdas.get(c.id)) || meses.map(celdaVacia);
    return {
      clave: c.id ?? `${tipo}-${SIN_CATEGORIA}`,
      categoriaId: c.id,
      nombre: c.nombre,
      tipo,
      nivel,
      esSubtotal: false,
      celdas: cs,
      total: suma(cs.map((x) => x.valor)),
      porcentaje: null,
      mensualizado: 0,
    };
  };

  const filas: FilaHoja[] = [];
  for (const raiz of raices) {
    const hijas = hijasDe(raiz.id);
    if (hijas.length === 0) {
      filas.push(fila(raiz, 0));
      continue;
    }
    const filasHijas = hijas.map((h) => fila(h, 1));
    // Si el propio grupo tiene movimientos (cargados antes de crear las
    // subcategorías) se muestran como una fila más, para que el subtotal
    // cuadre y se vean de dónde salen.
    const propiasDelGrupo = celdas.get(raiz.id);
    if (propiasDelGrupo && propiasDelGrupo.some((c) => c.cantidadMovimientos > 0)) {
      filasHijas.unshift({ ...fila(raiz, 1), clave: `${raiz.id}-propios`, nombre: `${raiz.nombre} (sin subcategoría)` });
    }
    const subtotalCeldas = meses.map((_, i) => ({
      ...celdaVacia(),
      valor: suma(filasHijas.map((f) => f.celdas[i].valor)),
    }));
    filas.push({
      clave: `${raiz.id}-subtotal`,
      categoriaId: raiz.id,
      nombre: raiz.nombre,
      tipo,
      nivel: 0,
      esSubtotal: true,
      celdas: subtotalCeldas,
      total: suma(subtotalCeldas.map((c) => c.valor)),
      porcentaje: null,
      mensualizado: 0,
    });
    filas.push(...filasHijas);
  }

  const sinCategoria = celdas.get(SIN_CATEGORIA);
  if (sinCategoria) filas.push({ ...fila({ id: null, nombre: 'Sin categoría' }, 0), celdas: sinCategoria, total: suma(sinCategoria.map((c) => c.valor)) });

  for (const f of filas) f.mensualizado = f.total / 12;
  return filas;
}

/** Suma por mes de las filas principales (los subtotales ya incluyen a sus hijas). */
function totalesPorMes(filas: FilaHoja[]): number[] {
  return Array.from({ length: 12 }, (_, i) => suma(filas.filter((f) => f.nivel === 0).map((f) => f.celdas[i].valor)));
}

/** Suma por mes de las categorías indicadas (y de sus subcategorías). */
function totalesDeCategorias(filas: FilaHoja[], categoriaIds: string[], categorias: CategoriaHoja[]): number[] {
  const elegidas = new Set(categoriaIds);
  // Si se elige un grupo entero, cuentan todas sus hijas; si se elige una
  // hija suelta, solo ella. Nunca se cuenta dos veces la misma fila.
  const incluida = (f: FilaHoja) => {
    if (f.esSubtotal || !f.categoriaId) return false;
    if (elegidas.has(f.categoriaId)) return true;
    const cat = categorias.find((c) => c.id === f.categoriaId);
    return !!cat?.categoria_padre_id && elegidas.has(cat.categoria_padre_id);
  };
  return Array.from({ length: 12 }, (_, i) => suma(filas.filter(incluida).map((f) => f.celdas[i].valor)));
}

const fraccion = (a: number, b: number): number | null => (b === 0 ? null : a / b);

function filaImporte(clave: string, nombre: string, valores: number[], extra: Partial<FilaResultado> = {}): FilaResultado {
  const total = suma(valores);
  return { clave, nombre, valores, total, mensualizado: total / 12, formato: 'importe', ...extra };
}

export interface EntradaHoja {
  anio: number;
  categorias: CategoriaHoja[];
  ingresos: MovimientoHoja[];
  gastos: MovimientoHoja[];
  /** Ingresos de diciembre del año anterior, para los saldos de enero. */
  ingresosDiciembreAnterior: number;
  config: ConfigHojaAnual;
}

export function calcularHojaAnual(e: EntradaHoja): HojaAnual {
  const meses = mesesDe(e.anio);
  const filasIngresos = construirFilas('ingreso', e.categorias, celdasPorCategoria(e.ingresos, 1, meses), meses);
  const filasGastos = construirFilas('gasto', e.categorias, celdasPorCategoria(e.gastos, -1, meses), meses);

  const ingresos = totalesPorMes(filasIngresos);
  const gastos = totalesPorMes(filasGastos);
  const resultado = ingresos.map((v, i) => v + gastos[i]);

  const extraordinarios = meses.map((m) => e.config.ingresosExtraordinarios[m] ?? 0);
  const ingresosSinExtra = ingresos.map((v, i) => v - extraordinarios[i]);
  const amortizaciones = totalesDeCategorias(filasGastos, e.config.categoriasAmortizacion, e.categorias);
  const gastosSinAmortizaciones = gastos.map((v, i) => v - amortizaciones[i]);

  // % de cada fila (columna P del Excel).
  const totalIngresos = suma(ingresos);
  const totalGastosSinAmort = suma(gastosSinAmortizaciones);
  for (const f of filasIngresos) f.porcentaje = fraccion(f.total, totalIngresos);
  for (const f of filasGastos) f.porcentaje = fraccion(f.total, totalGastosSinAmort);

  const forecast = meses.map((m) => e.config.forecast[m] ?? 0);


  const sinTrabajo = totalesDeCategorias(filasIngresos, e.config.categoriasIngresosSinTrabajo, e.categorias);
  const gastosLigados = totalesDeCategorias(filasGastos, e.config.categoriasGastosSinTrabajo, e.categorias);
  const netosSinTrabajo = sinTrabajo.map((v, i) => v + gastosLigados[i]);

  // Saldos de cuentas: el sueldo llega a fin de mes, así que lo disponible
  // en un mes son los ingresos del mes ANTERIOR (fila "Ingresos fin mes
  // anterior" del Excel).
  const ingresosMesAnterior = [e.ingresosDiciembreAnterior, ...ingresos.slice(0, 11)];
  const saldoInicio: (number | null)[] = [];
  const saldoFin: (number | null)[] = [];
  let saldo = e.config.saldoInicial;
  for (let i = 0; i < 12; i++) {
    saldoInicio.push(saldo);
    const fin = saldo === null ? null : saldo + ingresosMesAnterior[i] + gastos[i];
    saldoFin.push(fin);
    saldo = fin;
  }

  const pctIngresos = netosSinTrabajo.map((v, i) => fraccion(v, ingresos[i]));
  const pctGastos = netosSinTrabajo.map((v, i) => {
    const r = fraccion(v, gastosSinAmortizaciones[i]);
    return r === null ? null : -r;
  });

  const resultados: BloqueResultados[] = [
    {
      titulo: 'Cash flow',
      filas: [
        filaImporte('cf-ingresos', 'CF - Ingresos', ingresos),
        filaImporte('cf-gastos', 'CF - Gastos', gastos),
        filaImporte('cf', 'CF (resultado del mes)', resultado, { destacada: true }),
      ],
    },
    {
      titulo: 'Forecast frente a real',
      filas: [
        filaImporte('forecast', 'Forecast', forecast, { editable: 'forecast' }),
        filaImporte('real', 'Real', resultado),
        (() => {
          // Solo en los meses con forecast: comparar contra un hueco no dice nada.
          const valores = resultado.map((v, i) => (meses[i] in e.config.forecast ? v - forecast[i] : null));
          const conDato = valores.filter((v): v is number => v !== null);
          return {
            clave: 'diferencia',
            nombre: 'Diferencia',
            valores,
            total: conDato.length ? suma(conDato) : null,
            mensualizado: null,
            formato: 'importe' as const,
            destacada: true,
          };
        })(),
      ],
    },
    {
      titulo: 'Sin extraordinarios',
      filas: [
        filaImporte('extraordinarios', 'Ingresos extraordinarios (préstamos y similares)', extraordinarios, {
          editable: 'ingresosExtraordinarios',
        }),
        filaImporte('ingresos-sin-prestamos', 'Ingresos sin préstamos y similares', ingresosSinExtra),
        filaImporte('gastos-sin-amortizaciones', 'Gastos sin amortizaciones anticipadas', gastosSinAmortizaciones),
      ],
    },
    {
      titulo: 'Ingresos sin trabajo',
      filas: [
        filaImporte('ingresos-sin-trabajo', 'Ingresos sin trabajo', sinTrabajo),
        filaImporte('netos-sin-trabajo', 'Ingresos netos sin trabajo', netosSinTrabajo, { destacada: true }),
        {
          clave: 'pct-ingresos',
          nombre: '% sobre ingresos',
          valores: pctIngresos,
          total: fraccion(suma(netosSinTrabajo), totalIngresos),
          mensualizado: null,
          formato: 'porcentaje',
        },
        {
          clave: 'pct-gastos',
          nombre: '% sobre gastos',
          valores: pctGastos,
          total: (() => {
            const r = fraccion(suma(netosSinTrabajo), totalGastosSinAmort);
            return r === null ? null : -r;
          })(),
          mensualizado: null,
          formato: 'porcentaje',
        },
      ],
    },
    {
      titulo: 'Saldos de cuentas',
      filas: [
        {
          clave: 'saldo-inicio',
          nombre: 'Saldo cuentas a inicio de mes',
          valores: saldoInicio,
          total: null,
          mensualizado: null,
          formato: 'importe',
          editable: 'saldoInicial',
        },
        filaImporte('ingresos-mes-anterior', 'Ingresos fin mes anterior', ingresosMesAnterior),
        filaImporte('gastos-mes', 'Gastos', gastos),
        {
          clave: 'saldo-fin',
          nombre: 'Saldo fin de mes',
          valores: saldoFin,
          total: null,
          mensualizado: null,
          formato: 'importe',
          destacada: true,
        },
      ],
    },
  ];

  return { meses, ingresos: filasIngresos, gastos: filasGastos, resultados };
}

/**
 * Normaliza lo que venga guardado (o nada) a una configuración completa,
 * descartando ids de categorías que ya no existen.
 */
export function normalizarConfigHoja(cruda: unknown, categoriasExistentes: Set<string>): ConfigHojaAnual {
  const c = (cruda && typeof cruda === 'object' ? cruda : {}) as Partial<ConfigHojaAnual>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && categoriasExistentes.has(x)) : []);
  const porMes = (v: unknown) => {
    const r: Record<string, number> = {};
    if (v && typeof v === 'object') {
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        if (/^\d{4}-\d{2}$/.test(k) && typeof n === 'number' && Number.isFinite(n)) r[k] = n;
      }
    }
    return r;
  };
  return {
    forecast: porMes(c.forecast),
    ingresosExtraordinarios: porMes(c.ingresosExtraordinarios),
    saldoInicial: typeof c.saldoInicial === 'number' && Number.isFinite(c.saldoInicial) ? c.saldoInicial : null,
    categoriasAmortizacion: ids(c.categoriasAmortizacion),
    categoriasIngresosSinTrabajo: ids(c.categoriasIngresosSinTrabajo),
    categoriasGastosSinTrabajo: ids(c.categoriasGastosSinTrabajo),
  };
}
