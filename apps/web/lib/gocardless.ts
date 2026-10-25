/**
 * Cliente mínimo de la API de GoCardless Bank Account Data (antes
 * Nordigen) — agregador Open Banking/PSD2 con licencia AISP que da
 * acceso de solo lectura a bancos españoles (BBVA, Santander,
 * CaixaBank, ING…) sin que este proyecto tenga que ser una entidad
 * regulada. Documentación: https://developer.gocardless.com/bank-account-data
 *
 * IMPORTANTE — sin verificar contra la API real: este cliente está
 * escrito siguiendo el contrato documentado de GoCardless, pero nunca
 * se ha ejecutado contra su sandbox porque este proyecto no tiene
 * GOCARDLESS_SECRET_ID/GOCARDLESS_SECRET_KEY configuradas. La primera
 * llamada real es la que confirma que esto funciona.
 */

const BASE_URL = 'https://bankaccountdata.gocardless.com/api/v2';

export class ErrorGoCardless extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

interface TokenCacheado {
  accessToken: string;
  expiraEn: number; // epoch ms
}

let tokenCacheado: TokenCacheado | null = null;

function credenciales(): { secretId: string; secretKey: string } {
  const secretId = process.env.GOCARDLESS_SECRET_ID;
  const secretKey = process.env.GOCARDLESS_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new ErrorGoCardless(
      'Faltan GOCARDLESS_SECRET_ID o GOCARDLESS_SECRET_KEY en las variables de entorno',
      500
    );
  }
  return { secretId, secretKey };
}

async function peticion<T>(
  metodo: string,
  ruta: string,
  opciones: { body?: unknown; autenticada?: boolean } = {}
): Promise<T> {
  const { autenticada = true } = opciones;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (autenticada) {
    headers.Authorization = `Bearer ${await obtenerAccessToken()}`;
  }

  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    method: metodo,
    headers,
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text();
    throw new ErrorGoCardless(
      `GoCardless ${metodo} ${ruta} devolvió ${respuesta.status}: ${cuerpo.slice(0, 500)}`,
      respuesta.status
    );
  }

  if (respuesta.status === 204) return undefined as T;
  return respuesta.json() as Promise<T>;
}

/** Obtiene (y cachea en memoria del proceso) el token de acceso — es de la cuenta desarrolladora, no por usuario final. */
export async function obtenerAccessToken(): Promise<string> {
  const margenSeguridadMs = 60_000;
  if (tokenCacheado && tokenCacheado.expiraEn - margenSeguridadMs > Date.now()) {
    return tokenCacheado.accessToken;
  }

  const { secretId, secretKey } = credenciales();
  const data = await peticion<{ access: string; access_expires: number }>('POST', '/token/new/', {
    body: { secret_id: secretId, secret_key: secretKey },
    autenticada: false,
  });

  tokenCacheado = {
    accessToken: data.access,
    expiraEn: Date.now() + data.access_expires * 1000,
  };
  return tokenCacheado.accessToken;
}

export interface Institucion {
  id: string;
  name: string;
  logo: string;
  transaction_total_days: string;
}

/** Lista los bancos disponibles para un país (código ISO 2 letras, ej. "ES"). */
export async function listarInstituciones(pais: string): Promise<Institucion[]> {
  return peticion<Institucion[]>('GET', `/institutions/?country=${encodeURIComponent(pais)}`);
}

/**
 * Crea el acuerdo de acceso (agreement) y la solicitud de vinculación
 * (requisition) en un solo paso — GoCardless los modela como dos
 * recursos separados, pero para este caso de uso siempre van juntos.
 * Devuelve el link al que hay que redirigir al usuario para que
 * autorice el acceso en la web/app de su banco.
 */
export async function crearVinculacion(params: {
  institucionId: string;
  maxHistoricalDays: number;
  redirectUrl: string;
  referencia: string;
}): Promise<{ requisitionId: string; link: string }> {
  const acuerdo = await peticion<{ id: string }>('POST', '/agreements/enduser/', {
    body: {
      institution_id: params.institucionId,
      max_historical_days: params.maxHistoricalDays,
      access_valid_for_days: 90,
      access_scopes: ['balances', 'details', 'transactions'],
    },
  });

  const requisition = await peticion<{ id: string; link: string }>('POST', '/requisitions/', {
    body: {
      redirect: params.redirectUrl,
      institution_id: params.institucionId,
      reference: params.referencia,
      agreement: acuerdo.id,
      user_language: 'ES',
    },
  });

  return { requisitionId: requisition.id, link: requisition.link };
}

export type EstadoRequisition = 'CR' | 'GC' | 'UA' | 'RJ' | 'SA' | 'GA' | 'LN' | 'EX' | 'SU';

export interface Requisition {
  id: string;
  status: EstadoRequisition;
  accounts: string[];
}

export async function obtenerRequisition(requisitionId: string): Promise<Requisition> {
  return peticion<Requisition>('GET', `/requisitions/${encodeURIComponent(requisitionId)}/`);
}

export async function eliminarRequisition(requisitionId: string): Promise<void> {
  await peticion<void>('DELETE', `/requisitions/${encodeURIComponent(requisitionId)}/`);
}

export interface DetalleCuentaExterna {
  iban: string | null;
  nombre: string;
  moneda: string;
}

export async function obtenerDetalleCuenta(cuentaExternaId: string): Promise<DetalleCuentaExterna> {
  const data = await peticion<{
    account: { iban?: string; ownerName?: string; name?: string; product?: string; currency: string };
  }>('GET', `/accounts/${encodeURIComponent(cuentaExternaId)}/details/`);

  return {
    iban: data.account.iban ?? null,
    nombre: data.account.name ?? data.account.product ?? data.account.ownerName ?? 'Cuenta bancaria',
    moneda: data.account.currency,
  };
}

export interface TransaccionExterna {
  transaccionExternaId: string;
  importe: number; // positivo = ingreso, negativo = gasto
  moneda: string;
  fecha: string; // YYYY-MM-DD
  descripcion: string;
}

interface TransaccionCruda {
  transactionId?: string;
  internalTransactionId?: string;
  transactionAmount: { amount: string; currency: string };
  bookingDate?: string;
  valueDate?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  creditorName?: string;
  debtorName?: string;
}

function mapearTransaccionCruda(t: TransaccionCruda): TransaccionExterna | null {
  const id = t.transactionId ?? t.internalTransactionId;
  const fecha = t.bookingDate ?? t.valueDate;
  if (!id || !fecha) return null; // transacción sin identificador o fecha estable: no se puede deduplicar con seguridad

  const descripcion =
    t.remittanceInformationUnstructured ||
    t.remittanceInformationUnstructuredArray?.join(' ') ||
    t.creditorName ||
    t.debtorName ||
    'Movimiento bancario';

  return {
    transaccionExternaId: id,
    importe: Number(t.transactionAmount.amount),
    moneda: t.transactionAmount.currency,
    fecha,
    descripcion,
  };
}

/** Solo transacciones "booked" (confirmadas) — las "pending" pueden cambiar de importe/fecha y no son fiables para persistir. */
export async function obtenerTransacciones(cuentaExternaId: string): Promise<TransaccionExterna[]> {
  const data = await peticion<{ transactions: { booked: TransaccionCruda[] } }>(
    'GET',
    `/accounts/${encodeURIComponent(cuentaExternaId)}/transactions/`
  );

  return data.transactions.booked
    .map(mapearTransaccionCruda)
    .filter((t): t is TransaccionExterna => t !== null);
}
