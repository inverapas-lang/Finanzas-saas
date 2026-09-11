import { ErrorApi } from './supabase-server';

export type TipoActivo = 'vivienda' | 'fondo' | 'accion' | 'etf' | 'deposito' | 'efectivo' | 'otro';
export type FuenteValoracion = 'manual' | 'api_externa';

export interface PayloadActivo {
  espacio_id: string;
  tipo: TipoActivo;
  nombre: string;
  valor_actual: number;
  moneda: string;
  fecha_valoracion: string;
  fuente_valoracion: FuenteValoracion;
  rentabilidad_estimada: number | null;
  notas: string | null;
}

const TIPOS_ACTIVO: TipoActivo[] = ['vivienda', 'fondo', 'accion', 'etf', 'deposito', 'efectivo', 'otro'];
const FUENTES: FuenteValoracion[] = ['manual', 'api_externa'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validarPayloadActivo(body: unknown): PayloadActivo {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }
  if (typeof b.tipo !== 'string' || !TIPOS_ACTIVO.includes(b.tipo as TipoActivo)) {
    throw new ErrorApi(400, `tipo debe ser uno de: ${TIPOS_ACTIVO.join(', ')}`);
  }
  if (typeof b.nombre !== 'string' || b.nombre.trim().length === 0) {
    throw new ErrorApi(400, 'nombre no puede estar vacío');
  }
  if (typeof b.valor_actual !== 'number' || b.valor_actual < 0) {
    throw new ErrorApi(400, 'valor_actual debe ser un número >= 0');
  }

  let fuente_valoracion: FuenteValoracion = 'manual';
  if (b.fuente_valoracion !== undefined) {
    if (typeof b.fuente_valoracion !== 'string' || !FUENTES.includes(b.fuente_valoracion as FuenteValoracion)) {
      throw new ErrorApi(400, `fuente_valoracion debe ser uno de: ${FUENTES.join(', ')}`);
    }
    fuente_valoracion = b.fuente_valoracion as FuenteValoracion;
  }

  // Regla honesta (ver conversación sobre Idealista/AVM): 'api_externa' no
  // tiene todavía ninguna integración real detrás. Se acepta el valor en el
  // esquema para dejarlo preparado, pero por ahora exigimos que el importe
  // se informe igualmente a mano — no hay ningún proceso que lo rellene solo.
  if (fuente_valoracion === 'api_externa') {
    throw new ErrorApi(
      400,
      'fuente_valoracion "api_externa" no está disponible todavía (no hay ninguna integración real conectada) — usa "manual"'
    );
  }

  if (b.rentabilidad_estimada !== undefined && b.rentabilidad_estimada !== null) {
    if (typeof b.rentabilidad_estimada !== 'number') {
      throw new ErrorApi(400, 'rentabilidad_estimada debe ser un número si se indica');
    }
  }

  let fecha_valoracion = new Date().toISOString().slice(0, 10);
  if (b.fecha_valoracion !== undefined) {
    if (typeof b.fecha_valoracion !== 'string' || !FECHA_REGEX.test(b.fecha_valoracion)) {
      throw new ErrorApi(400, 'fecha_valoracion debe tener formato YYYY-MM-DD');
    }
    fecha_valoracion = b.fecha_valoracion;
  }

  return {
    espacio_id: b.espacio_id,
    tipo: b.tipo as TipoActivo,
    nombre: b.nombre.trim(),
    valor_actual: b.valor_actual,
    moneda: typeof b.moneda === 'string' ? b.moneda : 'EUR',
    fecha_valoracion,
    fuente_valoracion,
    rentabilidad_estimada: (b.rentabilidad_estimada as number) ?? null,
    notas: typeof b.notas === 'string' ? b.notas : null,
  };
}

/** Validación de un PATCH parcial: solo valida los campos presentes en `cambios`. */
export function validarCambiosActivo(cambios: Record<string, unknown>): void {
  if (cambios.tipo !== undefined) {
    if (typeof cambios.tipo !== 'string' || !TIPOS_ACTIVO.includes(cambios.tipo as TipoActivo)) {
      throw new ErrorApi(400, `tipo debe ser uno de: ${TIPOS_ACTIVO.join(', ')}`);
    }
  }
  if (cambios.nombre !== undefined) {
    if (typeof cambios.nombre !== 'string' || cambios.nombre.trim().length === 0) {
      throw new ErrorApi(400, 'nombre no puede estar vacío');
    }
  }
  if (cambios.valor_actual !== undefined) {
    if (typeof cambios.valor_actual !== 'number' || cambios.valor_actual < 0) {
      throw new ErrorApi(400, 'valor_actual debe ser un número >= 0');
    }
  }
  if (cambios.fuente_valoracion !== undefined) {
    if (
      typeof cambios.fuente_valoracion !== 'string' ||
      !FUENTES.includes(cambios.fuente_valoracion as FuenteValoracion)
    ) {
      throw new ErrorApi(400, `fuente_valoracion debe ser uno de: ${FUENTES.join(', ')}`);
    }
    if (cambios.fuente_valoracion === 'api_externa') {
      throw new ErrorApi(
        400,
        'fuente_valoracion "api_externa" no está disponible todavía (no hay ninguna integración real conectada) — usa "manual"'
      );
    }
  }
  if (cambios.rentabilidad_estimada !== undefined && cambios.rentabilidad_estimada !== null) {
    if (typeof cambios.rentabilidad_estimada !== 'number') {
      throw new ErrorApi(400, 'rentabilidad_estimada debe ser un número si se indica');
    }
  }
  if (cambios.fecha_valoracion !== undefined) {
    if (typeof cambios.fecha_valoracion !== 'string' || !FECHA_REGEX.test(cambios.fecha_valoracion)) {
      throw new ErrorApi(400, 'fecha_valoracion debe tener formato YYYY-MM-DD');
    }
  }
}
