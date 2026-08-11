import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import {
  parsearFiltrosListado,
  validarPayloadMovimiento,
} from '../../../lib/validacion-movimientos';

/**
 * GET /api/ingresos?espacio_id=...&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&categoria_id=...&cuenta_id=...
 *
 * La autorización real la resuelve Postgres RLS (política ingresos_select
 * en supabase/migrations/0002_movimientos.sql): si el usuario no es
 * miembro del espacio, Supabase simplemente devuelve una lista vacía, no
 * un error — así no filtramos información sobre la existencia de espacios
 * ajenos.
 */
export async function GET(request: NextRequest) {
  try {
    const filtros = parsearFiltrosListado(request.nextUrl.searchParams);
    const supabase = crearClienteSupabaseDeRequest(request);

    let query = supabase
      .from('ingresos')
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

/**
 * POST /api/ingresos
 * Body: ver esquema IngresoInput en api/openapi.yaml
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = validarPayloadMovimiento(body, 'ingreso');
    const supabase = crearClienteSupabaseDeRequest(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const { data, error } = await supabase
      .from('ingresos')
      .insert({ ...payload, created_by: user.id })
      .select()
      .single();

    // Si el usuario no tiene permiso 'ingresos:editar', RLS bloquea el INSERT
    // y Postgres devuelve un error de política (42501) en vez de insertar.
    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para crear ingresos en este espacio');
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
  console.error('Error inesperado en /api/ingresos:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
