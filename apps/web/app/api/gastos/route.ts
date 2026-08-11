import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import {
  parsearFiltrosListado,
  validarPayloadMovimiento,
} from '../../../lib/validacion-movimientos';

export async function GET(request: NextRequest) {
  try {
    const filtros = parsearFiltrosListado(request.nextUrl.searchParams);
    const supabase = crearClienteSupabaseDeRequest(request);

    let query = supabase
      .from('gastos')
      .select('*')
      .eq('espacio_id', filtros.espacio_id)
      .order('fecha_prevista', { ascending: true });

    if (filtros.desde) query = query.gte('fecha_prevista', filtros.desde);
    if (filtros.hasta) query = query.lte('fecha_prevista', filtros.hasta);
    if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id);
    if (filtros.cuenta_id) query = query.eq('cuenta_id', filtros.cuenta_id);

    const { data, error } = await query;
    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = validarPayloadMovimiento(body, 'gasto');
    const supabase = crearClienteSupabaseDeRequest(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const { data, error } = await supabase
      .from('gastos')
      .insert({ ...payload, created_by: user.id })
      .select()
      .single();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para crear gastos en este espacio');
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
  console.error('Error inesperado en /api/gastos:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
