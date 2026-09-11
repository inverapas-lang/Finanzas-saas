import { ErrorApi } from './supabase-server';

export type TipoCuenta = 'corriente' | 'ahorro' | 'inversion' | 'efectivo';

export interface PayloadCuenta {
  espacio_id: string;
  nombre: string;
  entidad: string | null;
  tipo: TipoCuenta;
  moneda: string;
  saldo_actual: number;
}

const TIPOS_CUENTA: TipoCuenta[] = ['corriente', 'ahorro', 'inversion', 'efectivo'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarPayloadCuenta(body: unknown): PayloadCuenta {
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

  const tipo = (b.tipo as string) ?? 'corriente';
  if (!TIPOS_CUENTA.includes(tipo as TipoCuenta)) {
    throw new ErrorApi(400, `tipo debe ser uno de: ${TIPOS_CUENTA.join(', ')}`);
  }

  if (b.saldo_actual !== undefined && typeof b.saldo_actual !== 'number') {
    throw new ErrorApi(400, 'saldo_actual debe ser un número');
  }

  return {
    espacio_id: b.espacio_id,
    nombre: b.nombre.trim(),
    entidad: typeof b.entidad === 'string' ? b.entidad.trim() : null,
    tipo: tipo as TipoCuenta,
    moneda: typeof b.moneda === 'string' ? b.moneda : 'EUR',
    saldo_actual: typeof b.saldo_actual === 'number' ? b.saldo_actual : 0,
  };
}

/** Validación de un PATCH parcial: solo valida los campos presentes en `cambios`. */
export function validarCambiosCuenta(cambios: Record<string, unknown>): void {
  if (cambios.nombre !== undefined) {
    if (typeof cambios.nombre !== 'string' || cambios.nombre.trim().length === 0) {
      throw new ErrorApi(400, 'nombre no puede estar vacío');
    }
  }
  if (cambios.tipo !== undefined) {
    if (typeof cambios.tipo !== 'string' || !TIPOS_CUENTA.includes(cambios.tipo as TipoCuenta)) {
      throw new ErrorApi(400, `tipo debe ser uno de: ${TIPOS_CUENTA.join(', ')}`);
    }
  }
  if (cambios.saldo_actual !== undefined && typeof cambios.saldo_actual !== 'number') {
    throw new ErrorApi(400, 'saldo_actual debe ser un número');
  }
}
