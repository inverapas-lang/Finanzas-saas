import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { validarPayloadMeta } from '../../../lib/validacion-metas';

export async function GET(request: NextRequest) {
  try {
    const espacio_id = request.nextUrl.searchParams.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('metas_ahorro')
      .select('*')
      .eq('espacio_id', espacio_id)
      .order('created_at', { ascending: false });

    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = validarPayloadMeta(body);
    const supabase = crearClienteSupabaseDeRequest(request);

    if (payload.cuenta_id) {
      const { data: cuenta, error: errorCuenta } = await supabase
        .from('cuentas_bancarias')
        .select('id, espacio_id')
        .eq('id', payload.cuenta_id)
        .maybeSingle();
      if (errorCuenta) throw new ErrorApi(500, errorCuenta.message);
      if (!cuenta) throw new ErrorApi(404, 'cuenta_id no existe o no tienes acceso a ella');
      if (cuenta.espacio_id !== payload.espacio_id) {
        throw new ErrorApi(400, 'La cuenta debe pertenecer al mismo espacio');
      }
    }

    const { data, error } = await supabase.from('metas_ahorro').insert(payload).select().single();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para crear metas de ahorro en este espacio');
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
  console.error('Error inesperado en /api/metas:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
