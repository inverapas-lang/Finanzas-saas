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
    if (typeof b.importe_real !== 'number' || b.importe_real < 0) {
      throw new ErrorApi(400, 'importe_real debe ser un número mayor o igual a 0');
    }
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
