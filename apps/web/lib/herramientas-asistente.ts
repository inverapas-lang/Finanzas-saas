import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorApi } from './supabase-server';
import { verificarCategoriaYCuenta } from './validacion-movimientos';
import { BLOQUES_PATRIMONIO } from './validacion-patrimonio-historico-item';
import { validarPropuesta } from './validacion-propuesta';
import type { CambioPropuesto, PropuestaCambios, ValorCampo } from './tipos-propuesta';

/**
 * Herramientas del asistente financiero. Las de consulta se ejecutan en el
 * servidor con el cliente Supabase DEL USUARIO (nunca la service role), así
 * que RLS decide qué puede leer. La de proponer_cambios no escribe nada:
 * valida la propuesta, lee los valores actuales y la devuelve para que el
 * usuario la acepte o la descarte en pantalla.
 */

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAMANO_PAGINA = 1000; // límite por defecto de filas de PostgREST
const MAX_FILAS_AGREGADO = 20000;

const TIPO_MOVIMIENTO = {
  type: 'string',
  enum: ['gasto', 'ingreso'],
  description: 'gasto o ingreso',
} as const;
const FECHA = (descripcion: string) =>
  ({ type: 'string', description: `${descripcion} (YYYY-MM-DD)` }) as const;

export const HERRAMIENTAS_ASISTENTE: Anthropic.Beta.BetaTool[] = [
  {
    name: 'listar_categorias',
    description:
      'Lista las categorías del espacio (id, nombre, tipo y categoría padre). Úsala para traducir el nombre de una categoría que diga el usuario a su id antes de filtrar o de proponer un cambio de categoría.',
    input_schema: {
      type: 'object',
      properties: { tipo: TIPO_MOVIMIENTO },
      additionalProperties: false,
    },
  },
  {
    name: 'buscar_movimientos',
    description:
      'Devuelve gastos o ingresos concretos, uno por fila, con su id, fecha, descripción, categoría e importes. Úsala para ver el detalle o para localizar los registros (y sus ids) que el usuario quiere ajustar. Ordenados por fecha. Si la respuesta dice "truncado": true, acota más el filtro.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: TIPO_MOVIMIENTO,
        desde: FECHA('Fecha prevista mínima, incluida'),
        hasta: FECHA('Fecha prevista máxima, incluida'),
        categoria_id: { type: 'string', description: 'id de categoría (de listar_categorias)' },
        texto: { type: 'string', description: 'Texto que debe contener la descripción' },
        limite: { type: 'integer', description: 'Máximo de filas, por defecto 100, máximo 300' },
      },
      required: ['tipo'],
      additionalProperties: false,
    },
  },
  {
    name: 'totales_movimientos',
    description:
      'Suma gastos o ingresos de un periodo, agrupados por mes, por categoría o por ambos. El importe de cada movimiento es el real si existe y si no el previsto (mismo criterio que el resto de la app). Úsala para preguntas de totales y comparativas en vez de sumar a mano filas de buscar_movimientos.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: TIPO_MOVIMIENTO,
        desde: FECHA('Inicio del periodo, incluido'),
        hasta: FECHA('Fin del periodo, incluido'),
        agrupar_por: { type: 'string', enum: ['mes', 'categoria', 'mes_y_categoria'] },
        categoria_id: { type: 'string', description: 'Opcional: solo esta categoría' },
      },
      required: ['tipo', 'desde', 'hasta', 'agrupar_por'],
      additionalProperties: false,
    },
  },
  {
    name: 'consultar_patrimonio',
    description:
      'Devuelve el histórico de patrimonio línea a línea: un valor por mes (siempre día 1), bloque y concepto (p. ej. "Cta Santander"), con su id. Las deudas se guardan en positivo en el bloque "deuda". Patrimonio neto = todo menos deuda, sin contar inversion_iliquida.',
    input_schema: {
      type: 'object',
      properties: {
        desde: FECHA('Primer mes, incluido'),
        hasta: FECHA('Último mes, incluido'),
        bloque: { type: 'string', enum: [...BLOQUES_PATRIMONIO] },
        concepto: { type: 'string', description: 'Texto que debe contener el concepto' },
        limite: { type: 'integer', description: 'Máximo de filas, por defecto 300, máximo 1000' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'proponer_cambios',
    description:
      'Propone al usuario modificar, crear o eliminar gastos, ingresos o valores de patrimonio. NO aplica nada: el usuario ve cada cambio (valor actual -> nuevo) y decide si lo aplica. Usa ids reales obtenidos con las herramientas de consulta, nunca inventados. Una sola llamada por respuesta, con todos los cambios juntos.',
    input_schema: {
      type: 'object',
      properties: {
        resumen: { type: 'string', description: 'Una frase que explique qué cambia y por qué' },
        cambios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              accion: { type: 'string', enum: ['modificar', 'crear', 'eliminar'] },
              entidad: { type: 'string', enum: ['gasto', 'ingreso', 'patrimonio_item'] },
              id: {
                type: 'string',
                description: 'id del registro; obligatorio en modificar y eliminar, omitir en crear',
              },
              valores: {
                type: 'object',
                description:
                  'Campos a fijar (no en eliminar). gasto: descripcion, importe_previsto, importe_real, fecha_prevista, fecha_pagada, categoria_id, notas. ingreso: descripcion, importe_esperado, importe_real, fecha_prevista, fecha_cobrada, categoria_id, observaciones. patrimonio_item: al modificar solo valor y notas; al crear mes (día 1), bloque, concepto, valor y notas. Importes como número con punto decimal, fechas YYYY-MM-DD. Al crear un gasto/ingreso son obligatorios descripcion, fecha_prevista y el importe previsto/esperado.',
              },
            },
            required: ['accion', 'entidad'],
          },
        },
      },
      required: ['resumen', 'cambios'],
      additionalProperties: false,
    },
  },
];

export interface ResultadoHerramienta {
  contenido: string;
  esError: boolean;
  /** Solo lo rellena proponer_cambios cuando la propuesta es válida. */
  propuesta?: PropuestaCambios;
}

/**
 * Ejecuta una herramienta. Los errores de entrada (ErrorApi) no rompen la
 * conversación: vuelven a la IA como resultado con is_error para que
 * corrija la llamada.
 */
export async function ejecutarHerramienta(
  supabase: SupabaseClient,
  espacioId: string,
  nombre: string,
  input: unknown
): Promise<ResultadoHerramienta> {
  try {
    const entrada = (typeof input === 'object' && input !== null ? input : {}) as Record<
      string,
      unknown
    >;
    switch (nombre) {
      case 'listar_categorias':
        return ok(await listarCategorias(supabase, espacioId, entrada));
      case 'buscar_movimientos':
        return ok(await buscarMovimientos(supabase, espacioId, entrada));
      case 'totales_movimientos':
        return ok(await totalesMovimientos(supabase, espacioId, entrada));
      case 'consultar_patrimonio':
        return ok(await consultarPatrimonio(supabase, espacioId, entrada));
      case 'proponer_cambios': {
        const propuesta = await prepararPropuesta(supabase, espacioId, input);
        return {
          contenido:
            'Propuesta mostrada al usuario con los botones "Aplicar" y "Descartar". Todavía NO está aplicada: no digas que los datos han cambiado. Explícale en una o dos frases qué has propuesto y termina.',
          esError: false,
          propuesta,
        };
      }
      default:
        return { contenido: `Herramienta desconocida: ${nombre}`, esError: true };
    }
  } catch (err) {
    if (err instanceof ErrorApi) return { contenido: err.message, esError: true };
    throw err;
  }
}

function ok(datos: unknown): ResultadoHerramienta {
  return { contenido: JSON.stringify(datos), esError: false };
}

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------

async function listarCategorias(
  supabase: SupabaseClient,
  espacioId: string,
  entrada: Record<string, unknown>
) {
  const tipo = leerTipoOpcional(entrada.tipo);
  let consulta = supabase
    .from('categorias')
    .select('id, nombre, tipo, categoria_padre_id')
    .eq('espacio_id', espacioId)
    .order('nombre');
  if (tipo) consulta = consulta.eq('tipo', tipo);
  const { data, error } = await consulta;
  if (error) throw new ErrorApi(500, error.message);

  const filas = (data ?? []) as {
    id: string;
    nombre: string;
    tipo: string;
    categoria_padre_id: string | null;
  }[];
  const nombrePorId = new Map(filas.map((c) => [c.id, c.nombre]));
  return filas.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    categoria_padre: c.categoria_padre_id ? (nombrePorId.get(c.categoria_padre_id) ?? null) : null,
  }));
}

async function buscarMovimientos(
  supabase: SupabaseClient,
  espacioId: string,
  entrada: Record<string, unknown>
) {
  const tipo = leerTipo(entrada.tipo);
  const columnas = columnasMovimiento(tipo);
  const limite = leerEntero(entrada.limite, 100, 300);

  let consulta = supabase
    .from(columnas.tabla)
    .select(
      `id, descripcion, fecha_prevista, ${columnas.importe}, importe_real, ${columnas.fechaReal}, categoria_id, ${columnas.notas}`
    )
    .eq('espacio_id', espacioId);
  consulta = aplicarRangoFechas(consulta, entrada, 'fecha_prevista');
  if (entrada.categoria_id !== undefined) {
    consulta = consulta.eq('categoria_id', leerUuid(entrada.categoria_id, 'categoria_id'));
  }
  if (entrada.texto !== undefined) {
    if (typeof entrada.texto !== 'string') throw new ErrorApi(400, 'texto debe ser texto');
    consulta = consulta.ilike('descripcion', `%${escaparLike(entrada.texto)}%`);
  }
  // Una fila de más para saber si hay truncado sin contar aparte.
  const { data, error } = await consulta
    .order('fecha_prevista', { ascending: true })
    .limit(limite + 1);
  if (error) throw new ErrorApi(500, error.message);

  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  const nombres = await nombresCategorias(supabase, espacioId);
  return {
    truncado: filas.length > limite,
    movimientos: filas.slice(0, limite).map((f) => ({
      ...f,
      categoria: f.categoria_id ? (nombres.get(f.categoria_id as string) ?? null) : null,
    })),
  };
}

async function totalesMovimientos(
  supabase: SupabaseClient,
  espacioId: string,
  entrada: Record<string, unknown>
) {
  const tipo = leerTipo(entrada.tipo);
  const desde = leerFecha(entrada.desde, 'desde');
  const hasta = leerFecha(entrada.hasta, 'hasta');
  const agruparPor = entrada.agrupar_por;
  if (agruparPor !== 'mes' && agruparPor !== 'categoria' && agruparPor !== 'mes_y_categoria') {
    throw new ErrorApi(400, 'agrupar_por debe ser mes, categoria o mes_y_categoria');
  }
  const categoriaId =
    entrada.categoria_id === undefined ? null : leerUuid(entrada.categoria_id, 'categoria_id');
  const columnas = columnasMovimiento(tipo);

  const filas: { fecha_prevista: string; importe: number; importe_real: number | null; categoria_id: string | null }[] = [];
  for (let desdeFila = 0; ; desdeFila += TAMANO_PAGINA) {
    let consulta = supabase
      .from(columnas.tabla)
      .select(`fecha_prevista, importe:${columnas.importe}, importe_real, categoria_id`)
      .eq('espacio_id', espacioId)
      .gte('fecha_prevista', desde)
      .lte('fecha_prevista', hasta);
    if (categoriaId) consulta = consulta.eq('categoria_id', categoriaId);
    const { data, error } = await consulta
      .order('id')
      .range(desdeFila, desdeFila + TAMANO_PAGINA - 1);
    if (error) throw new ErrorApi(500, error.message);
    filas.push(...((data ?? []) as unknown as typeof filas));
    if (!data || data.length < TAMANO_PAGINA) break;
    if (filas.length >= MAX_FILAS_AGREGADO) {
      throw new ErrorApi(400, 'Demasiados movimientos en ese periodo; acota el rango de fechas');
    }
  }

  const nombres = await nombresCategorias(supabase, espacioId);
  const grupos = new Map<string, { mes?: string; categoria?: string; total: number; movimientos: number }>();
  let totalGeneral = 0;
  for (const f of filas) {
    const importe = Number(f.importe_real ?? f.importe);
    const mes = f.fecha_prevista.slice(0, 7);
    const categoria = f.categoria_id ? (nombres.get(f.categoria_id) ?? 'Sin categoría') : 'Sin categoría';
    const clave =
      agruparPor === 'mes' ? mes : agruparPor === 'categoria' ? categoria : `${mes}|${categoria}`;
    const grupo = grupos.get(clave) ?? {
      ...(agruparPor !== 'categoria' ? { mes } : {}),
      ...(agruparPor !== 'mes' ? { categoria } : {}),
      total: 0,
      movimientos: 0,
    };
    grupo.total += importe;
    grupo.movimientos += 1;
    grupos.set(clave, grupo);
    totalGeneral += importe;
  }

  return {
    total_general: redondear(totalGeneral),
    movimientos: filas.length,
    grupos: Array.from(grupos.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, g]) => ({ ...g, total: redondear(g.total) })),
  };
}

async function consultarPatrimonio(
  supabase: SupabaseClient,
  espacioId: string,
  entrada: Record<string, unknown>
) {
  const limite = leerEntero(entrada.limite, 300, 1000);
  let consulta = supabase
    .from('patrimonio_historico_item')
    .select('id, mes, bloque, concepto, valor, notas')
    .eq('espacio_id', espacioId);
  consulta = aplicarRangoFechas(consulta, entrada, 'mes');
  if (entrada.bloque !== undefined) {
    if (!BLOQUES_PATRIMONIO.includes(entrada.bloque as (typeof BLOQUES_PATRIMONIO)[number])) {
      throw new ErrorApi(400, `bloque debe ser uno de: ${BLOQUES_PATRIMONIO.join(', ')}`);
    }
    consulta = consulta.eq('bloque', entrada.bloque as string);
  }
  if (entrada.concepto !== undefined) {
    if (typeof entrada.concepto !== 'string') throw new ErrorApi(400, 'concepto debe ser texto');
    consulta = consulta.ilike('concepto', `%${escaparLike(entrada.concepto)}%`);
  }
  const { data, error } = await consulta
    .order('mes', { ascending: true })
    .order('bloque')
    .order('concepto')
    .limit(limite + 1);
  if (error) throw new ErrorApi(500, error.message);
  const filas = data ?? [];
  return { truncado: filas.length > limite, items: filas.slice(0, limite) };
}

// ---------------------------------------------------------------------
// Propuestas
// ---------------------------------------------------------------------

/**
 * Valida la propuesta y le añade, para cada cambio, los valores ACTUALES
 * leídos de la base de datos (no los que afirme la IA) y una etiqueta
 * legible. Rechaza ids que no existan en este espacio para que la IA no
 * pueda proponer tocar registros ajenos ni inventados.
 */
async function prepararPropuesta(
  supabase: SupabaseClient,
  espacioId: string,
  input: unknown
): Promise<PropuestaCambios> {
  const propuesta = validarPropuesta(input, espacioId);
  const cambios: CambioPropuesto[] = [];

  for (const [indice, cambio] of propuesta.cambios.entries()) {
    const prefijo = `cambios[${indice}]`;

    if (cambio.entidad === 'patrimonio_item') {
      if (cambio.accion === 'crear') {
        const { data: existente, error } = await supabase
          .from('patrimonio_historico_item')
          .select('id')
          .eq('espacio_id', espacioId)
          .eq('mes', cambio.valores.mes as string)
          .eq('bloque', cambio.valores.bloque as string)
          .eq('concepto', (cambio.valores.concepto as string).trim())
          .maybeSingle();
        if (error) throw new ErrorApi(500, error.message);
        if (existente) {
          throw new ErrorApi(
            400,
            `${prefijo}: ya existe ese concepto en ese mes (id ${existente.id}); usa "modificar" con ese id`
          );
        }
        cambios.push({
          ...cambio,
          antes: null,
          etiqueta: `${cambio.valores.concepto} · ${(cambio.valores.mes as string).slice(0, 7)}`,
        });
        continue;
      }

      const { data: fila, error } = await supabase
        .from('patrimonio_historico_item')
        .select('mes, bloque, concepto, valor, notas')
        .eq('id', cambio.id as string)
        .eq('espacio_id', espacioId)
        .maybeSingle();
      if (error) throw new ErrorApi(500, error.message);
      if (!fila) throw new ErrorApi(400, `${prefijo}: no existe ningún valor de patrimonio con id ${cambio.id}`);
      cambios.push({
        ...cambio,
        antes: valoresAntes(fila, cambio.accion === 'eliminar' ? ['valor'] : Object.keys(cambio.valores)),
        etiqueta: `${fila.concepto} · ${String(fila.mes).slice(0, 7)}`,
      });
      continue;
    }

    const tipo = cambio.entidad;
    if (cambio.valores.categoria_id) {
      try {
        await verificarCategoriaYCuenta(supabase, espacioId, tipo, {
          categoria_id: cambio.valores.categoria_id as string,
        });
      } catch (err) {
        if (err instanceof ErrorApi) throw new ErrorApi(400, `${prefijo}: ${err.message}`);
        throw err;
      }
    }

    if (cambio.accion === 'crear') {
      cambios.push({
        ...cambio,
        antes: null,
        etiqueta: `${cambio.valores.descripcion} · ${cambio.valores.fecha_prevista}`,
      });
      continue;
    }

    const columnas = columnasMovimiento(tipo);
    const { data: fila, error } = await supabase
      .from(columnas.tabla)
      .select(
        `descripcion, fecha_prevista, ${columnas.importe}, importe_real, ${columnas.fechaReal}, categoria_id, ${columnas.notas}`
      )
      .eq('id', cambio.id as string)
      .eq('espacio_id', espacioId)
      .maybeSingle();
    if (error) throw new ErrorApi(500, error.message);
    if (!fila) throw new ErrorApi(400, `${prefijo}: no existe ningún ${tipo} con id ${cambio.id}`);
    const actual = fila as unknown as Record<string, unknown>;
    cambios.push({
      ...cambio,
      antes: valoresAntes(
        actual,
        cambio.accion === 'eliminar' ? [columnas.importe] : Object.keys(cambio.valores)
      ),
      etiqueta: `${actual.descripcion} · ${actual.fecha_prevista}`,
    });
  }

  const nombres = await nombresCategorias(supabase, espacioId);
  const categorias: Record<string, string> = {};
  for (const cambio of cambios) {
    for (const valor of [cambio.valores.categoria_id, cambio.antes?.categoria_id]) {
      if (typeof valor === 'string' && nombres.has(valor)) categorias[valor] = nombres.get(valor)!;
    }
  }

  return { resumen: propuesta.resumen, cambios, categorias };
}

function valoresAntes(fila: Record<string, unknown>, campos: string[]): Record<string, ValorCampo> {
  const antes: Record<string, ValorCampo> = {};
  for (const campo of campos) {
    const valor = fila[campo];
    antes[campo] = typeof valor === 'string' || typeof valor === 'number' ? valor : null;
  }
  return antes;
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

function columnasMovimiento(tipo: 'gasto' | 'ingreso') {
  return tipo === 'gasto'
    ? { tabla: 'gastos', importe: 'importe_previsto', fechaReal: 'fecha_pagada', notas: 'notas' }
    : { tabla: 'ingresos', importe: 'importe_esperado', fechaReal: 'fecha_cobrada', notas: 'observaciones' };
}

async function nombresCategorias(supabase: SupabaseClient, espacioId: string) {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre')
    .eq('espacio_id', espacioId);
  if (error) throw new ErrorApi(500, error.message);
  return new Map((data ?? []).map((c: { id: string; nombre: string }) => [c.id, c.nombre]));
}

// Tipado laxo a propósito: el builder de PostgREST cambia de tipo con cada
// select, y aquí solo añadimos dos filtros de rango.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aplicarRangoFechas<T extends { gte: any; lte: any }>(
  consulta: T,
  entrada: Record<string, unknown>,
  columna: string
): T {
  let resultado = consulta;
  if (entrada.desde !== undefined) resultado = resultado.gte(columna, leerFecha(entrada.desde, 'desde'));
  if (entrada.hasta !== undefined) resultado = resultado.lte(columna, leerFecha(entrada.hasta, 'hasta'));
  return resultado;
}

function leerTipo(valor: unknown): 'gasto' | 'ingreso' {
  if (valor !== 'gasto' && valor !== 'ingreso') {
    throw new ErrorApi(400, 'tipo debe ser "gasto" o "ingreso"');
  }
  return valor;
}

function leerTipoOpcional(valor: unknown): 'gasto' | 'ingreso' | null {
  return valor === undefined ? null : leerTipo(valor);
}

function leerFecha(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !FECHA_REGEX.test(valor)) {
    throw new ErrorApi(400, `${campo} debe tener formato YYYY-MM-DD`);
  }
  return valor;
}

function leerUuid(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !UUID_REGEX.test(valor)) {
    throw new ErrorApi(400, `${campo} debe ser un UUID (consúltalo con listar_categorias)`);
  }
  return valor;
}

function leerEntero(valor: unknown, porDefecto: number, maximo: number): number {
  if (valor === undefined) return porDefecto;
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1) {
    throw new ErrorApi(400, 'limite debe ser un entero positivo');
  }
  return Math.min(valor, maximo);
}

/** Escapa los comodines de LIKE para que el texto del usuario se busque literal. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
