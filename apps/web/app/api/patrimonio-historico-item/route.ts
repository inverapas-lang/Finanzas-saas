import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { validarPayloadPatrimonioHistoricoItem } from '../../../lib/validacion-patrimonio-historico-item';

/**
 * GET /api/patrimonio-historico-item?espacio_id=...
 *
 * La autorización real la resuelve Postgres RLS (política
 * patrimonio_historico_item_select en supabase/migrations/0016_patrimonio_historico_item.sql):
 * si el usuario no es miembro del espacio, Supabase simplemente devuelve una
 * lista vacía, no un error.
 *
 * Se ordena por bloque, luego concepto y luego mes ascendente para que el
 * frontend reciba las filas ya agrupadas por concepto y en orden
 * cronológico dentro de cada una, listas para pivotar en la rejilla
 * concepto x mes sin tener que reordenar nada (ver
 * lib/agregaciones-patrimonio-item.ts).
 */
export async function GET(request: NextRequest) {
  try {
    const espacio_id = request.nextUrl.searchParams.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('patrimonio_historico_item')
      .select('*')
      .eq('espacio_id', espacio_id)
      .order('bloque', { ascending: true })
      .order('concepto', { ascending: true })
      .order('mes', { ascending: true });

    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

/**
 * POST /api/patrimonio-historico-item
 * Body: { espacio_id, mes, bloque, concepto, valor?, notas? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = validarPayloadPatrimonioHistoricoItem(body);
    const supabase = crearClienteSupabaseDeRequest(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const { data, error } = await supabase
      .from('patrimonio_historico_item')
      .insert({ ...payload, created_by: user.id })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ErrorApi(
          409,
          'Ya existe un valor para este concepto en este mes — edítalo en vez de crear uno nuevo.'
        );
      }
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para registrar patrimonio en este espacio.');
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
  console.error('Error inesperado en /api/patrimonio-historico-item:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
