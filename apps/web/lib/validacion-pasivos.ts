import { ErrorApi } from './supabase-server';

export type TipoPasivo = 'hipoteca' | 'prestamo_personal' | 'prestamo_vehiculo' | 'deuda_tarjeta' | 'otro';
export type TipoTasaHipoteca = 'fijo' | 'variable' | 'mixto';
export type IndicadorReferencia = 'euribor_3m' | 'euribor_6m' | 'euribor_12m' | 'otro' | 'ninguno';

export interface PayloadPasivo {
  espacio_id: string;
  tipo: TipoPasivo;
  nombre: string;
  capital_inicial: number;
  tipo_interes_anual: number;
  plazo_meses: number;
  fecha_inicio: string;
  moneda: string;
  tipo_tasa: TipoTasaHipoteca | null;
  indicador_referencia: IndicadorReferencia;
  diferencial: number | null;
  meses_tramo_fijo: number | null;
}

const TIPOS_PASIVO: TipoPasivo[] = [
  'hipoteca',
  'prestamo_personal',
  'prestamo_vehiculo',
  'deuda_tarjeta',
  'otro',
];
const TIPOS_TASA: TipoTasaHipoteca[] = ['fijo', 'variable', 'mixto'];
const INDICADORES: IndicadorReferencia[] = [
  'euribor_3m',
  'euribor_6m',
  'euribor_12m',
  'otro',
  'ninguno',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida el payload de creación de un pasivo. Las reglas de negocio que
 * exige esta validación reflejan exactamente las CHECK constraints de la
 * migración 0005 — si algo pasa aquí pero falla en la base de datos (o al
 * revés), hay una inconsistencia entre este archivo y el esquema SQL que
 * habría que corregir.
 */
export function validarPayloadPasivo(body: unknown): PayloadPasivo {
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

  const tipo = requerido('tipo');
  if (typeof tipo !== 'string' || !TIPOS_PASIVO.includes(tipo as TipoPasivo)) {
    throw new ErrorApi(400, `tipo debe ser uno de: ${TIPOS_PASIVO.join(', ')}`);
  }

  const nombre = requerido('nombre');
  if (typeof nombre !== 'string' || nombre.trim().length === 0) {
    throw new ErrorApi(400, 'nombre no puede estar vacío');
  }

  const capital_inicial = requerido('capital_inicial');
  if (typeof capital_inicial !== 'number' || capital_inicial <= 0) {
    throw new ErrorApi(400, 'capital_inicial debe ser un número mayor que 0');
  }

  const tipo_interes_anual = requerido('tipo_interes_anual');
  if (typeof tipo_interes_anual !== 'number' || tipo_interes_anual < 0) {
    throw new ErrorApi(400, 'tipo_interes_anual debe ser un número >= 0 (como fracción, ej. 0.031)');
  }

  const plazo_meses = requerido('plazo_meses');
  if (typeof plazo_meses !== 'number' || plazo_meses <= 0 || !Number.isInteger(plazo_meses)) {
    throw new ErrorApi(400, 'plazo_meses debe ser un entero mayor que 0');
  }

  const fecha_inicio = requerido('fecha_inicio');
  if (typeof fecha_inicio !== 'string' || !FECHA_REGEX.test(fecha_inicio)) {
    throw new ErrorApi(400, 'fecha_inicio debe tener formato YYYY-MM-DD');
  }

  // --- Reglas específicas de hipoteca (tipo_tasa, indicador, diferencial, tramo fijo) ---
  let tipo_tasa: TipoTasaHipoteca | null = null;
  let indicador_referencia: IndicadorReferencia = 'ninguno';
  let diferencial: number | null = null;
  let meses_tramo_fijo: number | null = null;

  if (tipo === 'hipoteca') {
    const tipoTasaRaw = requerido('tipo_tasa');
    if (typeof tipoTasaRaw !== 'string' || !TIPOS_TASA.includes(tipoTasaRaw as TipoTasaHipoteca)) {
      throw new ErrorApi(400, `tipo_tasa es obligatorio en hipotecas y debe ser: ${TIPOS_TASA.join(', ')}`);
    }
    tipo_tasa = tipoTasaRaw as TipoTasaHipoteca;

    if (b.indicador_referencia !== undefined && b.indicador_referencia !== null) {
      if (
        typeof b.indicador_referencia !== 'string' ||
        !INDICADORES.includes(b.indicador_referencia as IndicadorReferencia)
      ) {
        throw new ErrorApi(400, `indicador_referencia debe ser uno de: ${INDICADORES.join(', ')}`);
      }
      indicador_referencia = b.indicador_referencia as IndicadorReferencia;
    } else {
      indicador_referencia = tipo_tasa === 'fijo' ? 'ninguno' : 'euribor_12m';
    }

    // Regla del esquema: si hay indicador (no 'ninguno'), diferencial es obligatorio.
    if (indicador_referencia !== 'ninguno') {
      const diferencialRaw = requerido('diferencial');
      if (typeof diferencialRaw !== 'number' || diferencialRaw < 0) {
        throw new ErrorApi(400, 'diferencial debe ser un número >= 0 cuando hay indicador_referencia');
      }
      diferencial = diferencialRaw;
    }

    // Regla del esquema: si tipo_tasa es 'mixto', meses_tramo_fijo es obligatorio.
    if (tipo_tasa === 'mixto') {
      const tramoRaw = requerido('meses_tramo_fijo');
      if (typeof tramoRaw !== 'number' || tramoRaw <= 0 || !Number.isInteger(tramoRaw)) {
        throw new ErrorApi(400, 'meses_tramo_fijo debe ser un entero > 0 cuando tipo_tasa es mixto');
      }
      if (tramoRaw >= plazo_meses) {
        throw new ErrorApi(400, 'meses_tramo_fijo debe ser menor que plazo_meses');
      }
      meses_tramo_fijo = tramoRaw;
    }
  }

  return {
    espacio_id,
    tipo: tipo as TipoPasivo,
    nombre: nombre.trim(),
    capital_inicial,
    tipo_interes_anual,
    plazo_meses,
    fecha_inicio,
    moneda: typeof b.moneda === 'string' ? b.moneda : 'EUR',
    tipo_tasa,
    indicador_referencia,
    diferencial,
    meses_tramo_fijo,
  };
}

/**
 * Validación de un PATCH parcial: solo valida los campos presentes en
 * `cambios`. Las reglas cruzadas específicas de hipoteca (tipo_tasa,
 * indicador_referencia, diferencial, meses_tramo_fijo) ya están cubiertas
 * por CHECK constraints en la migración 0005, así que aquí solo se valida
 * lo que la base de datos no comprueba (p. ej. capital_inicial > 0).
 */
export function validarCambiosPasivo(cambios: Record<string, unknown>): void {
  if (cambios.tipo !== undefined) {
    if (typeof cambios.tipo !== 'string' || !TIPOS_PASIVO.includes(cambios.tipo as TipoPasivo)) {
      throw new ErrorApi(400, `tipo debe ser uno de: ${TIPOS_PASIVO.join(', ')}`);
    }
  }
  if (cambios.nombre !== undefined) {
    if (typeof cambios.nombre !== 'string' || cambios.nombre.trim().length === 0) {
      throw new ErrorApi(400, 'nombre no puede estar vacío');
    }
  }
  if (cambios.capital_inicial !== undefined) {
    if (typeof cambios.capital_inicial !== 'number' || cambios.capital_inicial <= 0) {
      throw new ErrorApi(400, 'capital_inicial debe ser un número mayor que 0');
    }
  }
  if (cambios.tipo_interes_anual !== undefined) {
    if (typeof cambios.tipo_interes_anual !== 'number' || cambios.tipo_interes_anual < 0) {
      throw new ErrorApi(400, 'tipo_interes_anual debe ser un número >= 0 (como fracción, ej. 0.031)');
    }
  }
  if (cambios.plazo_meses !== undefined) {
    if (
      typeof cambios.plazo_meses !== 'number' ||
      cambios.plazo_meses <= 0 ||
      !Number.isInteger(cambios.plazo_meses)
    ) {
      throw new ErrorApi(400, 'plazo_meses debe ser un entero mayor que 0');
    }
  }
  if (cambios.fecha_inicio !== undefined) {
    if (typeof cambios.fecha_inicio !== 'string' || !FECHA_REGEX.test(cambios.fecha_inicio)) {
      throw new ErrorApi(400, 'fecha_inicio debe tener formato YYYY-MM-DD');
    }
  }
}
