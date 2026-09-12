import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { validarPayloadReglaRecurrente } from '../../../lib/validacion-reglas-recurrentes';

/**
 * GET /api/reglas-recurrentes?espacio_id=...
 * POST /api/reglas-recurrentes
 *
 * Las reglas recurrentes son plantillas ("nómina mensual", "dividendos
 * trimestrales") que packages/projection-engine usa para proyectar cash
 * flow futuro (dashboard y asistente de chat) — no generan por sí solas
 * filas en ingresos/gastos. Para cargar un histórico ya cerrado, usa
 * /api/movimientos/carga-masiva; esto es para lo que aún no ha ocurrido.
 */
export async function GET(request: NextRequest) {
  try {
    const espacio_id = request.nextUrl.searchParams.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('reglas_recurrentes')
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
    const payload = validarPayloadReglaRecurrente(body);
    const supabase = crearClienteSupabaseDeRequest(request);

    if (payload.categoria_id) {
      const { data: categoria, error: errorCategoria } = await supabase
        .from('categorias')
        .select('id, tipo, espacio_id')
        .eq('id', payload.categoria_id)
        .maybeSingle();
      if (errorCategoria) throw new ErrorApi(500, errorCategoria.message);
      if (!categoria) throw new ErrorApi(404, 'categoria_id no existe o no tienes acceso a ella');
      if (categoria.espacio_id !== payload.espacio_id) {
        throw new ErrorApi(400, 'La categoría debe pertenecer al mismo espacio');
      }
      if (categoria.tipo !== payload.tipo) {
        throw new ErrorApi(400, 'La categoría debe ser del mismo tipo (ingreso/gasto) que la regla');
      }
    }

    const { data, error } = await supabase.from('reglas_recurrentes').insert(payload).select().single();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para crear reglas recurrentes en este espacio');
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
  console.error('Error inesperado en /api/reglas-recurrentes:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
