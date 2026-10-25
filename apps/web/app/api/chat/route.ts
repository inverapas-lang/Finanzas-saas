import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { validarPayloadChat } from '../../../lib/validacion-chat';
import { obtenerDatosFinancieros } from '../../../lib/obtener-datos-financieros';
import { formatearContextoFinanciero, INSTRUCCIONES_SISTEMA } from '../../../lib/contexto-financiero';
import { ejecutarHerramienta, HERRAMIENTAS_ASISTENTE } from '../../../lib/herramientas-asistente';
import type { PropuestaCambios } from '../../../lib/tipos-propuesta';

const MODELO = 'claude-opus-5-5';
const MAX_TOKENS_RESPUESTA = 16000;
/** Tope de vueltas consulta -> respuesta por mensaje, para acotar coste y tiempo. */
const MAX_ITERACIONES = 10;

// Las consultas encadenadas con herramientas pueden tardar más que los 10 s
// por defecto de una función de Vercel.
export const maxDuration = 60;

/**
 * POST /api/chat
 *
 * Body: { espacio_id: string, mensajes: { rol: 'usuario'|'asistente', contenido: string }[] }
 * Respuesta: { data: { rol: 'asistente', contenido: string, propuesta: PropuestaCambios | null } }
 *
 * El cliente manda el historial completo en cada petición (el modelo no
 * tiene memoria entre llamadas). El resumen financiero se recalcula desde
 * Supabase en cada mensaje; el detalle lo consulta la IA con herramientas
 * que leen con la sesión del usuario (RLS). La IA no escribe nada: como
 * mucho devuelve una propuesta que el usuario aplica desde el navegador.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      // Error controlado, no un 500: falta configuración del usuario, no
      // un fallo de la app. Ver README > "Asistente financiero".
      throw new ErrorApi(
        503,
        'El asistente financiero no está configurado todavía: falta ANTHROPIC_API_KEY en las variables de entorno.'
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

    const mensajes: Anthropic.Beta.BetaMessageParam[] = payload.mensajes.map((m) => ({
      role: m.rol === 'usuario' ? 'user' : 'assistant',
      content: m.contenido,
    }));

    const cliente = new Anthropic();
    let propuesta: PropuestaCambios | null = null;
    const textos: string[] = [];

    for (let iteracion = 0; ; iteracion++) {
      if (iteracion >= MAX_ITERACIONES) {
        throw new ErrorApi(502, 'El asistente ha necesitado demasiadas consultas. Prueba a acotar la pregunta.');
      }

      const respuesta = await cliente.beta.messages.create({
        model: MODELO,
        max_tokens: MAX_TOKENS_RESPUESTA,
        output_config: { effort: 'medium' },
        // Si el modelo rechaza la petición por política, la API la reintenta
        // sola con otro modelo en vez de devolver una respuesta vacía.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: sistema,
        tools: HERRAMIENTAS_ASISTENTE,
        messages: mensajes,
      });

      for (const bloque of respuesta.content) {
        if (bloque.type === 'text' && bloque.text.trim()) textos.push(bloque.text);
      }

      if (respuesta.stop_reason === 'refusal') {
        throw new ErrorApi(502, 'El asistente no ha podido responder a esta petición.');
      }
      if (respuesta.stop_reason === 'pause_turn') {
        mensajes.push({ role: 'assistant', content: respuesta.content });
        continue;
      }

      const llamadas = respuesta.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use'
      );
      if (respuesta.stop_reason !== 'tool_use' || llamadas.length === 0) break;

      mensajes.push({ role: 'assistant', content: respuesta.content });

      // Todos los resultados en un único mensaje, aunque haya varias llamadas en paralelo.
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const llamada of llamadas) {
        const resultado = await ejecutarHerramienta(
          supabase,
          payload.espacio_id,
          llamada.name,
          llamada.input
        );
        if (resultado.propuesta) propuesta = resultado.propuesta;
        resultados.push({
          type: 'tool_result',
          tool_use_id: llamada.id,
          content: resultado.contenido,
          ...(resultado.esError ? { is_error: true } : {}),
        });
      }
      mensajes.push({ role: 'user', content: resultados });
    }

    const texto = textos.join('\n\n').trim();
    if (!texto && !propuesta) {
      throw new ErrorApi(502, 'El asistente financiero no ha devuelto una respuesta.');
    }

    return NextResponse.json({
      data: {
        rol: 'asistente',
        contenido: texto || 'Te propongo estos cambios:',
        propuesta,
      },
    });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return NextResponse.json(
      { error: 'La clave ANTHROPIC_API_KEY configurada no es válida.' },
      { status: 503 }
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return NextResponse.json(
      { error: 'Límite de peticiones a la API de Anthropic alcanzado. Prueba en unos segundos.' },
      { status: 429 }
    );
  }
  if (err instanceof Anthropic.APIError) {
    console.error('Error de la API de Anthropic:', err.status, err.message);
    return NextResponse.json(
      { error: 'No se ha podido contactar con el asistente financiero. Inténtalo de nuevo.' },
      { status: 502 }
    );
  }
  console.error('Error inesperado en /api/chat:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
