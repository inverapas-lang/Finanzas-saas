import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { validarPayloadVistaGuardada } from '../../../lib/validacion-vistas-guardadas';

export async function GET(request: NextRequest) {
  try {
    const espacio_id = request.nextUrl.searchParams.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('vistas_guardadas')
      .select('*')
      .eq('espacio_id', espacio_id)
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = validarPayloadVistaGuardada(body);
    const supabase = crearClienteSupabaseDeRequest(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const { data, error } = await supabase
      .from('vistas_guardadas')
      .insert({
        espacio_id: payload.espacio_id,
        nombre: payload.nombre,
        configuracion: payload.configuracion,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para guardar vistas en este espacio');
      }
      throw new ErrorApi(400, error.message);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/vistas-guardadas:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
