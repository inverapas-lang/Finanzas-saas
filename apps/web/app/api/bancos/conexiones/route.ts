import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';
import { validarPayloadConexionBancaria } from '../../../../lib/validacion-bancos';
import { crearVinculacion, ErrorGoCardless } from '../../../../lib/gocardless';

const HISTORICO_DIAS_POR_DEFECTO = 90;

export async function GET(request: NextRequest) {
  try {
    const espacio_id = request.nextUrl.searchParams.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('conexiones_bancarias')
      .select('*')
      .eq('espacio_id', espacio_id)
      .order('created_at', { ascending: false });

    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

/**
 * POST /api/bancos/conexiones
 *
 * Paso 1 del flujo de vinculación: crea el acuerdo+requisition en
 * GoCardless y guarda la conexión en estado "pendiente". Devuelve `link`,
 * la URL a la que el navegador debe redirigir para que el usuario
 * autorice el acceso en la web/app de su banco. Cuando el banco redirige
 * de vuelta a redirect_url, hay que llamar a
 * POST /api/bancos/conexiones/[id]/finalizar para completar la vinculación.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = validarPayloadConexionBancaria(body);
    const supabase = crearClienteSupabaseDeRequest(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const { data: conexionPendiente, error: errorInsercion } = await supabase
      .from('conexiones_bancarias')
      .insert({
        espacio_id: payload.espacio_id,
        institucion_id: payload.institucion_id,
        institucion_nombre: payload.institucion_nombre,
        requisition_id: `pendiente-${crypto.randomUUID()}`, // placeholder único hasta tener el real de GoCardless
        estado: 'pendiente',
        max_historical_days: HISTORICO_DIAS_POR_DEFECTO,
        created_by: user.id,
      })
      .select()
      .single();

    if (errorInsercion) {
      if (errorInsercion.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para conectar bancos en este espacio');
      }
      throw new ErrorApi(400, errorInsercion.message);
    }

    try {
      const { requisitionId, link } = await crearVinculacion({
        institucionId: payload.institucion_id,
        maxHistoricalDays: HISTORICO_DIAS_POR_DEFECTO,
        redirectUrl: `${payload.redirect_url}?conexion_id=${conexionPendiente.id}`,
        referencia: conexionPendiente.id,
      });

      const { data: conexion, error: errorActualizacion } = await supabase
        .from('conexiones_bancarias')
        .update({ requisition_id: requisitionId })
        .eq('id', conexionPendiente.id)
        .select()
        .single();
      if (errorActualizacion) throw new ErrorApi(500, errorActualizacion.message);

      return NextResponse.json({ data: conexion, link }, { status: 201 });
    } catch (errorGoCardless) {
      const mensaje = errorGoCardless instanceof Error ? errorGoCardless.message : 'Error desconocido';
      await supabase
        .from('conexiones_bancarias')
        .update({ estado: 'error', error_mensaje: mensaje })
        .eq('id', conexionPendiente.id);
      throw errorGoCardless;
    }
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ErrorGoCardless) {
    return NextResponse.json({ error: `No se ha podido conectar con el banco: ${err.message}` }, { status: 502 });
  }
  console.error('Error inesperado en /api/bancos/conexiones:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
