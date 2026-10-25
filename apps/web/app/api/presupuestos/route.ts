import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { validarPayloadPresupuesto } from '../../../lib/validacion-presupuestos';

export async function GET(request: NextRequest) {
  try {
    const espacio_id = request.nextUrl.searchParams.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('espacio_id', espacio_id)
      .order('periodo_inicio', { ascending: false });

    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = validarPayloadPresupuesto(body);
    const supabase = crearClienteSupabaseDeRequest(request);

    const { data: categoria, error: errorCategoria } = await supabase
      .from('categorias')
      .select('id, tipo, espacio_id')
      .eq('id', payload.categoria_id)
      .maybeSingle();

    if (errorCategoria) throw new ErrorApi(500, errorCategoria.message);
    if (!categoria) throw new ErrorApi(404, 'categoria_id no existe o no tienes acceso a ella');
    if (categoria.espacio_id !== payload.espacio_id) {
      throw new ErrorApi(400, 'La categoría debe pertenecer al mismo espacio que el presupuesto');
    }
    if (categoria.tipo !== 'gasto') {
      throw new ErrorApi(400, 'Los presupuestos solo se pueden planificar sobre categorías de gasto');
    }

    const { data, error } = await supabase.from('presupuestos').insert(payload).select().single();

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para crear presupuestos');
      if (error.code === '23505') {
        throw new ErrorApi(409, 'Ya existe un presupuesto para esta categoría y periodo');
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
  console.error('Error inesperado en /api/presupuestos:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
