import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { validarPayloadChat } from '../../../lib/validacion-chat';
import { obtenerDatosFinancieros } from '../../../lib/obtener-datos-financieros';
import { formatearContextoFinanciero, INSTRUCCIONES_SISTEMA } from '../../../lib/contexto-financiero';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODELO = 'claude-sonnet-5';
const MAX_TOKENS_RESPUESTA = 1024;

/**
 * POST /api/chat
 *
 * Body: { espacio_id: string, mensajes: { rol: 'usuario'|'asistente', contenido: string }[] }
 *
 * El cliente manda el historial completo de la conversación en cada
 * petición (el modelo no tiene memoria entre llamadas) — ver decisiones
 * de diseño en el README. El contexto financiero se recalcula desde
 * Supabase en cada mensaje, no se cachea, para que nunca esté desactualizado.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      // Error controlado, no un 500: falta configuración del usuario, no
      // un fallo de la app. Ver README > "Asistente financiero".
      throw new ErrorApi(
        503,
        'El asistente financiero no está configurado todavía: falta ANTHROPIC_API_KEY en apps/web/.env.local.'
      );
    }

    const body = await request.json();
    const payload = validarPayloadChat(body);

    const supabase = crearClienteSupabaseDeRequest(request);

    // Comprobación de acceso: si el usuario no pertenece al espacio, RLS
    // hará que esta consulta devuelva null en vez de datos ajenos.
    const { data: espacio, error: errorEspacio } = await supabase
      .from('espacios_financieros')
      .select('id')
      .eq('id', payload.espacio_id)
      .maybeSingle();
    if (errorEspacio) throw new ErrorApi(500, errorEspacio.message);
    if (!espacio) throw new ErrorApi(403, 'No tienes acceso a este espacio financiero');

    const datos = await obtenerDatosFinancieros(supabase, payload.espacio_id);
    const sistema = `${INSTRUCCIONES_SISTEMA}\n\n${formatearContextoFinanciero(datos)}`;

    const mensajesAnthropic = payload.mensajes.map((m) => ({
      role: m.rol === 'usuario' ? ('user' as const) : ('assistant' as const),
      content: m.contenido,
    }));

    const respuestaAnthropic = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: MAX_TOKENS_RESPUESTA,
        system: sistema,
        messages: mensajesAnthropic,
      }),
    });

    if (!respuestaAnthropic.ok) {
      const detalle = await respuestaAnthropic.text().catch(() => '');
      console.error('Error de la API de Anthropic:', respuestaAnthropic.status, detalle);
      if (respuestaAnthropic.status === 401) {
        throw new ErrorApi(503, 'La clave ANTHROPIC_API_KEY configurada no es válida.');
      }
      if (respuestaAnthropic.status === 429) {
        throw new ErrorApi(429, 'Límite de peticiones a la API de Anthropic alcanzado. Prueba en unos segundos.');
      }
      throw new ErrorApi(502, 'No se ha podido contactar con el asistente financiero. Inténtalo de nuevo.');
    }

    const cuerpoAnthropic = await respuestaAnthropic.json();
    const texto = (cuerpoAnthropic.content ?? [])
      .filter((bloque: { type: string }) => bloque.type === 'text')
      .map((bloque: { text: string }) => bloque.text)
      .join('\n');

    if (!texto) {
      throw new ErrorApi(502, 'El asistente financiero no ha devuelto una respuesta de texto.');
    }

    return NextResponse.json({ data: { rol: 'asistente', contenido: texto } });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/chat:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
