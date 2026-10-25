import { ErrorApi } from './supabase-server';

export type RolMensaje = 'usuario' | 'asistente';

export interface MensajeChat {
  rol: RolMensaje;
  contenido: string;
}

export interface PayloadChat {
  espacio_id: string;
  mensajes: MensajeChat[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Límite defensivo: evita mandar conversaciones desmesuradas a la API
 * (coste en tokens) por un fallo del cliente que no recorta el historial. */
const MAX_MENSAJES = 60;
const MAX_LONGITUD_MENSAJE = 4000;

/**
 * Valida el cuerpo de POST /api/chat. Función PURA (sin Supabase ni
 * llamadas de red) para poder testearla igual que el resto de validadores.
 *
 * El cliente manda el historial completo de la conversación en cada
 * petición (el modelo no tiene memoria entre llamadas) — el último
 * mensaje debe ser del usuario, es el que se está respondiendo ahora.
 */
export function validarPayloadChat(body: unknown): PayloadChat {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }

  if (!Array.isArray(b.mensajes) || b.mensajes.length === 0) {
    throw new ErrorApi(400, 'mensajes debe ser un array no vacío');
  }
  if (b.mensajes.length > MAX_MENSAJES) {
    throw new ErrorApi(400, `mensajes no puede tener más de ${MAX_MENSAJES} elementos`);
  }

  const mensajes = b.mensajes.map((m, indice) => {
    if (typeof m !== 'object' || m === null) {
      throw new ErrorApi(400, `mensajes[${indice}] debe ser un objeto`);
    }
    const mm = m as Record<string, unknown>;
    if (mm.rol !== 'usuario' && mm.rol !== 'asistente') {
      throw new ErrorApi(400, `mensajes[${indice}].rol debe ser "usuario" o "asistente"`);
    }
    if (typeof mm.contenido !== 'string' || mm.contenido.trim().length === 0) {
      throw new ErrorApi(400, `mensajes[${indice}].contenido debe ser texto no vacío`);
    }
    if (mm.contenido.length > MAX_LONGITUD_MENSAJE) {
      throw new ErrorApi(
        400,
        `mensajes[${indice}].contenido supera el límite de ${MAX_LONGITUD_MENSAJE} caracteres`
      );
    }
    return { rol: mm.rol, contenido: mm.contenido } as MensajeChat;
  });

  if (mensajes[mensajes.length - 1].rol !== 'usuario') {
    throw new ErrorApi(400, 'El último mensaje del historial debe ser del usuario');
  }

  return { espacio_id: b.espacio_id, mensajes };
}
