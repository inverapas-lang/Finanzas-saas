import { ErrorApi } from './supabase-server';

export interface PayloadPatrimonioHistorico {
  espacio_id: string;
  mes: string;
  total_cuentas: number;
  total_inversiones_liquidas: number;
  total_inversiones_intocables: number;
  total_inversiones_iliquidas: number;
  total_deuda: number;
  notas: string | null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const CAMPOS_TOTAL = [
  'total_cuentas',
  'total_inversiones_liquidas',
  'total_inversiones_intocables',
  'total_inversiones_iliquidas',
  'total_deuda',
] as const;

type CampoTotal = (typeof CAMPOS_TOTAL)[number];

/**
 * Valida que `mes` tenga formato YYYY-MM-DD y que el día sea siempre "01"
 * (la tabla solo admite snapshots mensuales, siempre fechados a día 1 del
 * mes — ver comentario en la migración 0015). Rechazamos explícitamente
 * cualquier otro día en vez de truncarlo en silencio: si el cliente manda
 * una fecha equivocada, mejor que falle de forma clara que guardar un
 * snapshot en el día equivocado sin que nadie se dé cuenta.
 */
function validarMes(valor: unknown): string {
  if (typeof valor !== 'string' || !MES_REGEX.test(valor)) {
    throw new ErrorApi(400, 'mes debe tener formato YYYY-MM-DD');
  }
  const dia = valor.slice(8, 10);
  if (dia !== '01') {
    throw new ErrorApi(400, 'mes debe ser siempre el día 1 del mes (ej. 2026-01-01)');
  }
  return valor;
}

function validarTotal(campo: CampoTotal, valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new ErrorApi(400, `${campo} debe ser un número finito`);
  }
  return valor;
}

export function validarPayloadPatrimonioHistorico(body: unknown): PayloadPatrimonioHistorico {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }

  const mes = validarMes(b.mes);

  const totales: Record<CampoTotal, number> = {
    total_cuentas: 0,
    total_inversiones_liquidas: 0,
    total_inversiones_intocables: 0,
    total_inversiones_iliquidas: 0,
    total_deuda: 0,
  };
  for (const campo of CAMPOS_TOTAL) {
    if (b[campo] !== undefined) {
      totales[campo] = validarTotal(campo, b[campo]);
    }
  }

  if (b.notas !== undefined && b.notas !== null && typeof b.notas !== 'string') {
    throw new ErrorApi(400, 'notas debe ser una cadena de texto si se indica');
  }

  return {
    espacio_id: b.espacio_id,
    mes,
    ...totales,
    notas: typeof b.notas === 'string' ? b.notas.trim() || null : null,
  };
}

/** Validación de un PATCH parcial: solo valida los campos presentes en `cambios`. */
export function validarCambiosPatrimonioHistorico(cambios: Record<string, unknown>): void {
  for (const campo of CAMPOS_TOTAL) {
    if (cambios[campo] !== undefined) {
      validarTotal(campo, cambios[campo]);
    }
  }
  if (cambios.notas !== undefined && cambios.notas !== null && typeof cambios.notas !== 'string') {
    throw new ErrorApi(400, 'notas debe ser una cadena de texto si se indica');
  }
}
