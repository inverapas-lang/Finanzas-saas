import { ErrorApi } from './supabase-server';

export interface PayloadMeta {
  espacio_id: string;
  nombre: string;
  importe_objetivo: number;
  importe_actual: number;
  moneda: string;
  fecha_objetivo: string | null;
  cuenta_id: string | null;
  notas: string | null;
  activa: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validarPayloadMeta(body: unknown): PayloadMeta {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }
  if (typeof b.nombre !== 'string' || b.nombre.trim().length === 0) {
    throw new ErrorApi(400, 'nombre no puede estar vacío');
  }
  if (typeof b.importe_objetivo !== 'number' || !Number.isFinite(b.importe_objetivo) || b.importe_objetivo <= 0) {
    throw new ErrorApi(400, 'importe_objetivo debe ser un número mayor que 0');
  }

  let importe_actual = 0;
  if (b.importe_actual !== undefined) {
    if (typeof b.importe_actual !== 'number' || !Number.isFinite(b.importe_actual) || b.importe_actual < 0) {
      throw new ErrorApi(400, 'importe_actual debe ser un número >= 0');
    }
    importe_actual = b.importe_actual;
  }

  let fecha_objetivo: string | null = null;
  if (b.fecha_objetivo !== undefined && b.fecha_objetivo !== null && b.fecha_objetivo !== '') {
    if (typeof b.fecha_objetivo !== 'string' || !FECHA_REGEX.test(b.fecha_objetivo)) {
      throw new ErrorApi(400, 'fecha_objetivo debe tener formato YYYY-MM-DD');
    }
    fecha_objetivo = b.fecha_objetivo;
  }

  return {
    espacio_id: b.espacio_id,
    nombre: b.nombre.trim(),
    importe_objetivo: b.importe_objetivo,
    importe_actual,
    moneda: typeof b.moneda === 'string' ? b.moneda : 'EUR',
    fecha_objetivo,
    cuenta_id: (b.cuenta_id as string) ?? null,
    notas: typeof b.notas === 'string' ? b.notas.trim() || null : null,
    activa: b.activa !== false,
  };
}

/** Validación de un PATCH parcial: solo valida los campos presentes en `cambios`. */
export function validarCambiosMeta(cambios: Record<string, unknown>): void {
  if (cambios.nombre !== undefined) {
    if (typeof cambios.nombre !== 'string' || cambios.nombre.trim().length === 0) {
      throw new ErrorApi(400, 'nombre no puede estar vacío');
    }
  }
  if (cambios.importe_objetivo !== undefined) {
    if (
      typeof cambios.importe_objetivo !== 'number' ||
      !Number.isFinite(cambios.importe_objetivo) ||
      cambios.importe_objetivo <= 0
    ) {
      throw new ErrorApi(400, 'importe_objetivo debe ser un número mayor que 0');
    }
  }
  if (cambios.importe_actual !== undefined) {
    if (
      typeof cambios.importe_actual !== 'number' ||
      !Number.isFinite(cambios.importe_actual) ||
      cambios.importe_actual < 0
    ) {
      throw new ErrorApi(400, 'importe_actual debe ser un número >= 0');
    }
  }
  if (cambios.fecha_objetivo !== undefined && cambios.fecha_objetivo !== null) {
    if (typeof cambios.fecha_objetivo !== 'string' || !FECHA_REGEX.test(cambios.fecha_objetivo)) {
      throw new ErrorApi(400, 'fecha_objetivo debe tener formato YYYY-MM-DD');
    }
  }
  if (cambios.activa !== undefined && typeof cambios.activa !== 'boolean') {
    throw new ErrorApi(400, 'activa debe ser un booleano');
  }
}
