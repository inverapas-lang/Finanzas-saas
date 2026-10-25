import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorApi } from './supabase-server';

export type TipoMovimientoApi = 'ingreso' | 'gasto';

export interface PayloadMovimiento {
  espacio_id: string;
  categoria_id?: string | null;
  subcategoria_id?: string | null; // solo aplica a gastos
  cuenta_id?: string | null;
  descripcion: string;
  importe_esperado?: number; // ingresos
  importe_previsto?: number; // gastos
  importe_real?: number | null;
  moneda?: string;
  fecha_prevista: string;
  fecha_cobrada?: string | null; // ingresos
  fecha_pagada?: string | null; // gastos
  periodicidad?: string;
  observaciones?: string | null; // ingresos
  notas?: string | null; // gastos
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Debe coincidir con el enum "periodicidad" de la migración 0001_core_schema.sql.
const PERIODICIDADES = ['unico', 'semanal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual'];

/**
 * Validación manual deliberadamente explícita (sin librería externa) para
 * que este archivo se pueda leer de arriba a abajo sin saltar a un esquema
 * externo. Si el proyecto crece, migrar esto a zod es razonable.
 */
export function validarPayloadMovimiento(
  body: unknown,
  tipo: TipoMovimientoApi
): PayloadMovimiento {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  const requerido = (campo: string): unknown => {
    if (b[campo] === undefined || b[campo] === null || b[campo] === '') {
      throw new ErrorApi(400, `El campo "${campo}" es obligatorio`);
    }
    return b[campo];
  };

  const espacio_id = requerido('espacio_id');
  if (typeof espacio_id !== 'string' || !UUID_REGEX.test(espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }

  const descripcion = requerido('descripcion');
  if (typeof descripcion !== 'string' || descripcion.trim().length === 0) {
    throw new ErrorApi(400, 'descripcion no puede estar vacía');
  }

  const fecha_prevista = requerido('fecha_prevista');
  if (typeof fecha_prevista !== 'string' || !FECHA_REGEX.test(fecha_prevista)) {
    throw new ErrorApi(400, 'fecha_prevista debe tener formato YYYY-MM-DD');
  }

  const campoImporte = tipo === 'ingreso' ? 'importe_esperado' : 'importe_previsto';
  const importe = requerido(campoImporte);
  if (typeof importe !== 'number' || !Number.isFinite(importe) || importe < 0) {
    throw new ErrorApi(400, `${campoImporte} debe ser un número mayor o igual a 0`);
  }

  if (b.importe_real !== undefined && b.importe_real !== null) {
    if (typeof b.importe_real !== 'number' || !Number.isFinite(b.importe_real) || b.importe_real < 0) {
      throw new ErrorApi(400, 'importe_real debe ser un número mayor o igual a 0');
    }
  }

  if (b.periodicidad !== undefined && !PERIODICIDADES.includes(b.periodicidad as string)) {
    throw new ErrorApi(400, `periodicidad debe ser una de: ${PERIODICIDADES.join(', ')}`);
  }

  const payload: PayloadMovimiento = {
    espacio_id,
    descripcion: descripcion.trim(),
    fecha_prevista,
    categoria_id: (b.categoria_id as string) ?? null,
    cuenta_id: (b.cuenta_id as string) ?? null,
    importe_real: (b.importe_real as number) ?? null,
    moneda: (b.moneda as string) ?? 'EUR',
    periodicidad: (b.periodicidad as string) ?? 'unico',
  };

  if (tipo === 'ingreso') {
    payload.importe_esperado = importe;
    payload.fecha_cobrada = (b.fecha_cobrada as string) ?? null;
    payload.observaciones = (b.observaciones as string) ?? null;
  } else {
    payload.importe_previsto = importe;
    payload.subcategoria_id = (b.subcategoria_id as string) ?? null;
    payload.fecha_pagada = (b.fecha_pagada as string) ?? null;
    payload.notas = (b.notas as string) ?? null;
  }

  return payload;
}

/**
 * Validación de un PATCH parcial: solo valida los campos que vienen
 * presentes en `cambios` (nunca exige los obligatorios de un alta), para
 * evitar persistir valores inválidos (importe negativo, fecha con formato
 * incorrecto, moneda arbitraria) que `validarPayloadMovimiento` sí bloquea
 * en el alta pero que un PATCH sin pasar por aquí dejaría colar.
 */
export function validarCambiosMovimiento(
  cambios: Record<string, unknown>,
  tipo: TipoMovimientoApi
): void {
  const campoImporte = tipo === 'ingreso' ? 'importe_esperado' : 'importe_previsto';
  if (cambios[campoImporte] !== undefined) {
    const importe = cambios[campoImporte];
    if (typeof importe !== 'number' || !Number.isFinite(importe) || importe < 0) {
      throw new ErrorApi(400, `${campoImporte} debe ser un número mayor o igual a 0`);
    }
  }

  if (cambios.importe_real !== undefined && cambios.importe_real !== null) {
    if (
      typeof cambios.importe_real !== 'number' ||
      !Number.isFinite(cambios.importe_real) ||
      cambios.importe_real < 0
    ) {
      throw new ErrorApi(400, 'importe_real debe ser un número mayor o igual a 0');
    }
  }

  if (cambios.periodicidad !== undefined && !PERIODICIDADES.includes(cambios.periodicidad as string)) {
    throw new ErrorApi(400, `periodicidad debe ser una de: ${PERIODICIDADES.join(', ')}`);
  }

  if (cambios.descripcion !== undefined) {
    if (typeof cambios.descripcion !== 'string' || cambios.descripcion.trim().length === 0) {
      throw new ErrorApi(400, 'descripcion no puede estar vacía');
    }
  }

  for (const campoFecha of ['fecha_prevista', 'fecha_cobrada', 'fecha_pagada']) {
    const valor = cambios[campoFecha];
    if (valor !== undefined && valor !== null) {
      if (typeof valor !== 'string' || !FECHA_REGEX.test(valor)) {
        throw new ErrorApi(400, `${campoFecha} debe tener formato YYYY-MM-DD`);
      }
    }
  }
}

/**
 * Verifica que categoria_id, subcategoria_id y cuenta_id (si vienen
 * informados) existan, pertenezcan al mismo espacio_id del movimiento y
 * sean del tipo correcto — igual que ya hacen reglas-recurrentes y metas.
 * Sin esto, un usuario podría enlazar un ingreso/gasto de su espacio a una
 * cuenta o categoría de un espacio ajeno del que solo conozca el UUID.
 */
export async function verificarCategoriaYCuenta(
  supabase: SupabaseClient,
  espacioId: string,
  tipo: TipoMovimientoApi,
  campos: { categoria_id?: string | null; subcategoria_id?: string | null; cuenta_id?: string | null }
): Promise<void> {
  for (const campo of ['categoria_id', 'subcategoria_id'] as const) {
    const categoriaId = campos[campo];
    if (!categoriaId) continue;
    const { data, error } = await supabase
      .from('categorias')
      .select('id, tipo, espacio_id')
      .eq('id', categoriaId)
      .maybeSingle();
    if (error) throw new ErrorApi(500, error.message);
    if (!data) throw new ErrorApi(404, `${campo} no existe o no tienes acceso a ella`);
    if (data.espacio_id !== espacioId) {
      throw new ErrorApi(400, `${campo === 'categoria_id' ? 'La categoría' : 'La subcategoría'} debe pertenecer al mismo espacio`);
    }
    if (data.tipo !== tipo) {
      throw new ErrorApi(400, `${campo === 'categoria_id' ? 'La categoría' : 'La subcategoría'} debe ser del mismo tipo (ingreso/gasto)`);
    }
  }

  if (campos.cuenta_id) {
    const { data, error } = await supabase
      .from('cuentas_bancarias')
      .select('id, espacio_id')
      .eq('id', campos.cuenta_id)
      .maybeSingle();
    if (error) throw new ErrorApi(500, error.message);
    if (!data) throw new ErrorApi(404, 'cuenta_id no existe o no tienes acceso a ella');
    if (data.espacio_id !== espacioId) {
      throw new ErrorApi(400, 'La cuenta debe pertenecer al mismo espacio');
    }
  }
}

export function parsearFiltrosListado(searchParams: URLSearchParams) {
  const espacio_id = searchParams.get('espacio_id');
  if (!espacio_id) {
    throw new ErrorApi(400, 'El parámetro de consulta espacio_id es obligatorio');
  }
  return {
    espacio_id,
    desde: searchParams.get('desde'), // fecha_prevista >= desde
    hasta: searchParams.get('hasta'), // fecha_prevista <= hasta
    categoria_id: searchParams.get('categoria_id'),
    cuenta_id: searchParams.get('cuenta_id'),
  };
}
