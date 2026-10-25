import { ErrorApi } from './supabase-server';

export interface PayloadConexionBancaria {
  espacio_id: string;
  institucion_id: string;
  institucion_nombre: string;
  redirect_url: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarPayloadConexionBancaria(body: unknown): PayloadConexionBancaria {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }
  if (typeof b.institucion_id !== 'string' || b.institucion_id.trim().length === 0) {
    throw new ErrorApi(400, 'institucion_id es obligatorio');
  }
  if (typeof b.institucion_nombre !== 'string' || b.institucion_nombre.trim().length === 0) {
    throw new ErrorApi(400, 'institucion_nombre es obligatorio');
  }
  if (typeof b.redirect_url !== 'string' || !b.redirect_url.startsWith('http')) {
    throw new ErrorApi(400, 'redirect_url debe ser una URL absoluta válida');
  }

  return {
    espacio_id: b.espacio_id,
    institucion_id: b.institucion_id.trim(),
    institucion_nombre: b.institucion_nombre.trim(),
    redirect_url: b.redirect_url,
  };
}
