import { ErrorApi } from './supabase-server';

export const BLOQUES_PATRIMONIO = [
  'cuenta',
  'inversion_liquida',
  'inversion_intocable',
  'inversion_iliquida',
  'deuda',
] as const;

export type BloquePatrimonio = (typeof BLOQUES_PATRIMONIO)[number];

export const ETIQUETAS_BLOQUE: Record<BloquePatrimonio, string> = {
  cuenta: 'Cuentas',
  inversion_liquida: 'Inversiones líquidas',
  inversion_intocable: 'Inversiones intocables',
  inversion_iliquida: 'Inversiones ilíquidas',
  deuda: 'Deuda',
};

export interface PayloadPatrimonioHistoricoItem {
  espacio_id: string;
  mes: string;
  bloque: BloquePatrimonio;
  concepto: string;
  valor: number;
  notas: string | null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida que `mes` tenga formato YYYY-MM-DD y que el día sea siempre "01"
 * (igual que en patrimonio_historico, ver validacion-patrimonio-historico.ts
 * — la tabla solo admite snapshots mensuales fechados a día 1 del mes).
 * Rechazamos explícitamente cualquier otro día en vez de truncarlo en
 * silencio.
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

function validarBloque(valor: unknown): BloquePatrimonio {
  if (typeof valor !== 'string' || !BLOQUES_PATRIMONIO.includes(valor as BloquePatrimonio)) {
    throw new ErrorApi(400, `bloque debe ser uno de: ${BLOQUES_PATRIMONIO.join(', ')}`);
  }
  return valor as BloquePatrimonio;
}

function validarConcepto(valor: unknown): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ErrorApi(400, 'concepto es obligatorio y no puede estar vacío');
  }
  return valor.trim();
}

/**
 * A diferencia de patrimonio_historico (donde el signo de total_deuda no se
 * fuerza), aquí tampoco se exige signo alguno: una deuda se guarda con su
 * valor positivo igual que el resto de conceptos — el bloque ya indica que
 * es deuda, y el cálculo del patrimonio neto (agregaciones-patrimonio-item.ts)
 * es quien resta ese importe.
 */
function validarValor(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new ErrorApi(400, 'valor debe ser un número finito');
  }
  return valor;
}

function validarNotas(valor: unknown): string | null {
  if (valor !== undefined && valor !== null && typeof valor !== 'string') {
    throw new ErrorApi(400, 'notas debe ser una cadena de texto si se indica');
  }
  return typeof valor === 'string' ? valor.trim() || null : null;
}

export function validarPayloadPatrimonioHistoricoItem(body: unknown): PayloadPatrimonioHistoricoItem {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }

  const mes = validarMes(b.mes);
  const bloque = validarBloque(b.bloque);
  const concepto = validarConcepto(b.concepto);
  const valor = b.valor === undefined ? 0 : validarValor(b.valor);
  const notas = validarNotas(b.notas);

  return {
    espacio_id: b.espacio_id,
    mes,
    bloque,
    concepto,
    valor,
    notas,
  };
}

/**
 * Validación de un PATCH parcial: solo valida los campos presentes en
 * `cambios`. espacio_id/mes/bloque/concepto nunca se validan aquí porque la
 * ruta los elimina del cuerpo antes de llamar a esta función (son
 * inmutables — cambiarlos equivaldría a crear un registro distinto, dada la
 * restricción unique(espacio_id, mes, bloque, concepto)).
 */
export function validarCambiosPatrimonioHistoricoItem(cambios: Record<string, unknown>): void {
  if (cambios.valor !== undefined) {
    validarValor(cambios.valor);
  }
  if (cambios.notas !== undefined && cambios.notas !== null && typeof cambios.notas !== 'string') {
    throw new ErrorApi(400, 'notas debe ser una cadena de texto si se indica');
  }
}
