import { ErrorApi } from './supabase-server';

export type TipoReglaRecurrente = 'ingreso' | 'gasto';
export type Periodicidad = 'semanal' | 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

export interface PayloadReglaRecurrente {
  espacio_id: string;
  tipo: TipoReglaRecurrente;
  categoria_id: string | null;
  cuenta_id: string | null;
  descripcion: string;
  importe: number;
  moneda: string;
  periodicidad: Periodicidad;
  fecha_inicio: string;
  fecha_fin: string | null;
  activa: boolean;
}

// 'unico' existe como valor del enum de periodicidad compartido con
// ingresos/gastos, pero una regla RECURRENTE que solo ocurre una vez no
// tiene sentido de negocio — para eso está el alta normal de un movimiento.
const PERIODICIDADES: Periodicidad[] = [
  'semanal',
  'mensual',
  'bimestral',
  'trimestral',
  'semestral',
  'anual',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validarPayloadReglaRecurrente(body: unknown): PayloadReglaRecurrente {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }
  if (b.tipo !== 'ingreso' && b.tipo !== 'gasto') {
    throw new ErrorApi(400, 'tipo debe ser "ingreso" o "gasto"');
  }
  if (typeof b.descripcion !== 'string' || b.descripcion.trim().length === 0) {
    throw new ErrorApi(400, 'descripcion no puede estar vacía');
  }
  if (typeof b.importe !== 'number' || !Number.isFinite(b.importe) || b.importe <= 0) {
    throw new ErrorApi(400, 'importe debe ser un número mayor que 0');
  }
  if (typeof b.periodicidad !== 'string' || !PERIODICIDADES.includes(b.periodicidad as Periodicidad)) {
    throw new ErrorApi(400, `periodicidad debe ser una de: ${PERIODICIDADES.join(', ')}`);
  }
  if (typeof b.fecha_inicio !== 'string' || !FECHA_REGEX.test(b.fecha_inicio)) {
    throw new ErrorApi(400, 'fecha_inicio debe tener formato YYYY-MM-DD');
  }
  let fecha_fin: string | null = null;
  if (b.fecha_fin !== undefined && b.fecha_fin !== null && b.fecha_fin !== '') {
    if (typeof b.fecha_fin !== 'string' || !FECHA_REGEX.test(b.fecha_fin)) {
      throw new ErrorApi(400, 'fecha_fin debe tener formato YYYY-MM-DD');
    }
    if (b.fecha_fin < b.fecha_inicio) {
      throw new ErrorApi(400, 'fecha_fin no puede ser anterior a fecha_inicio');
    }
    fecha_fin = b.fecha_fin;
  }

  return {
    espacio_id: b.espacio_id,
    tipo: b.tipo,
    categoria_id: (b.categoria_id as string) ?? null,
    cuenta_id: (b.cuenta_id as string) ?? null,
    descripcion: b.descripcion.trim(),
    importe: b.importe,
    moneda: typeof b.moneda === 'string' ? b.moneda : 'EUR',
    periodicidad: b.periodicidad as Periodicidad,
    fecha_inicio: b.fecha_inicio,
    fecha_fin,
    activa: b.activa !== false,
  };
}

/** Validación de un PATCH parcial: solo valida los campos presentes en `cambios`. */
export function validarCambiosReglaRecurrente(cambios: Record<string, unknown>): void {
  if (cambios.descripcion !== undefined) {
    if (typeof cambios.descripcion !== 'string' || cambios.descripcion.trim().length === 0) {
      throw new ErrorApi(400, 'descripcion no puede estar vacía');
    }
  }
  if (cambios.importe !== undefined) {
    if (typeof cambios.importe !== 'number' || !Number.isFinite(cambios.importe) || cambios.importe <= 0) {
      throw new ErrorApi(400, 'importe debe ser un número mayor que 0');
    }
  }
  if (cambios.periodicidad !== undefined) {
    if (typeof cambios.periodicidad !== 'string' || !PERIODICIDADES.includes(cambios.periodicidad as Periodicidad)) {
      throw new ErrorApi(400, `periodicidad debe ser una de: ${PERIODICIDADES.join(', ')}`);
    }
  }
  if (cambios.fecha_inicio !== undefined) {
    if (typeof cambios.fecha_inicio !== 'string' || !FECHA_REGEX.test(cambios.fecha_inicio)) {
      throw new ErrorApi(400, 'fecha_inicio debe tener formato YYYY-MM-DD');
    }
  }
  if (cambios.fecha_fin !== undefined && cambios.fecha_fin !== null) {
    if (typeof cambios.fecha_fin !== 'string' || !FECHA_REGEX.test(cambios.fecha_fin)) {
      throw new ErrorApi(400, 'fecha_fin debe tener formato YYYY-MM-DD');
    }
  }
  if (cambios.activa !== undefined && typeof cambios.activa !== 'boolean') {
    throw new ErrorApi(400, 'activa debe ser un booleano');
  }
}
