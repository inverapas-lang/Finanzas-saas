import { ErrorApi } from './supabase-server';
import type { PeriodoTipo } from './periodos';

export type { PeriodoTipo } from './periodos';
export { finDePeriodo } from './periodos';

export interface PayloadPresupuesto {
  espacio_id: string;
  categoria_id: string;
  periodo_tipo: PeriodoTipo;
  periodo_inicio: string;
  importe_planificado: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validarPayloadPresupuesto(body: unknown): PayloadPresupuesto {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }
  if (typeof b.categoria_id !== 'string' || !UUID_REGEX.test(b.categoria_id)) {
    throw new ErrorApi(400, 'categoria_id debe ser un UUID válido');
  }
  if (b.periodo_tipo !== 'mensual' && b.periodo_tipo !== 'anual') {
    throw new ErrorApi(400, 'periodo_tipo debe ser "mensual" o "anual"');
  }
  if (typeof b.periodo_inicio !== 'string' || !FECHA_REGEX.test(b.periodo_inicio)) {
    throw new ErrorApi(400, 'periodo_inicio debe tener formato YYYY-MM-DD');
  }

  // Regla de negocio: el periodo siempre empieza el día 1 (del mes o del
  // año). No es una restricción del esquema SQL, pero sin esto un
  // "presupuesto mensual" con periodo_inicio a mitad de mes no tendría
  // sentido al comparar luego con el gasto real de ese mes completo.
  const dia = b.periodo_inicio.slice(8, 10);
  if (dia !== '01') {
    throw new ErrorApi(400, 'periodo_inicio debe ser el día 1 del mes (o del año, si es anual)');
  }
  if (b.periodo_tipo === 'anual' && b.periodo_inicio.slice(5, 7) !== '01') {
    throw new ErrorApi(400, 'Para un presupuesto anual, periodo_inicio debe ser el 1 de enero');
  }

  if (typeof b.importe_planificado !== 'number' || b.importe_planificado <= 0) {
    throw new ErrorApi(400, 'importe_planificado debe ser un número mayor que 0');
  }

  return {
    espacio_id: b.espacio_id,
    categoria_id: b.categoria_id,
    periodo_tipo: b.periodo_tipo,
    periodo_inicio: b.periodo_inicio,
    importe_planificado: b.importe_planificado,
  };
}
