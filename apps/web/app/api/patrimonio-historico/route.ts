import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { validarPayloadPatrimonioHistorico } from '../../../lib/validacion-patrimonio-historico';

/**
 * GET /api/patrimonio-historico?espacio_id=...
 *
 * La autorización real la resuelve Postgres RLS (política
 * patrimonio_historico_select en supabase/migrations/0015_patrimonio_historico.sql):
 * si el usuario no es miembro del espacio, Supabase simplemente devuelve una
 * lista vacía, no un error.
 *
 * Ordenado por mes ascendente para que el frontend pueda dibujar la serie
 * temporal de izquierda a derecha sin tener que reordenar.
 */
export async function GET(request: NextRequest) {
  try {
    const espacio_id = request.nextUrl.searchParams.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('patrimonio_historico')
      .select('*')
      .eq('espacio_id', espacio_id)
      .order('mes', { ascending: true });

    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

/**
 * POST /api/patrimonio-historico
 * Body: { espacio_id, mes, total_cuentas?, total_inversiones_liquidas?,
 *   total_inversiones_intocables?, total_inversiones_iliquidas?, total_deuda?, notas? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = validarPayloadPatrimonioHistorico(body);
    const supabase = crearClienteSupabaseDeRequest(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const { data, error } = await supabase
      .from('patrimonio_historico')
      .insert({ ...payload, created_by: user.id })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ErrorApi(
          409,
          'Ya existe un registro de patrimonio para este mes — edítalo en vez de crear uno nuevo.'
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
  console.error('Error inesperado en /api/patrimonio-historico:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
