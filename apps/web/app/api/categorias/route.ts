import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { validarPayloadCategoria } from '../../../lib/validacion-categorias';

/**
 * GET /api/categorias?espacio_id=...&tipo=ingreso|gasto
 * Devuelve la lista plana (no como árbol anidado); el cliente construye
 * la jerarquía visual a partir de categoria_padre_id si la necesita.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const espacio_id = params.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    let query = supabase
      .from('categorias')
      .select('*')
      .eq('espacio_id', espacio_id)
      .order('tipo', { ascending: true })
      .order('orden', { ascending: true });

    const tipo = params.get('tipo');
    if (tipo === 'ingreso' || tipo === 'gasto') {
      query = query.eq('tipo', tipo);
    }

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
    const payload = validarPayloadCategoria(body);
    const supabase = crearClienteSupabaseDeRequest(request);

    // Si tiene padre, comprobamos que exista, sea del mismo espacio y del
    // mismo tipo (no tiene sentido una subcategoría de gasto bajo un padre
    // de ingreso) — regla de negocio que la base de datos no impone por sí
    // sola, la exigimos aquí.
    if (payload.categoria_padre_id) {
      const { data: padre, error: errorPadre } = await supabase
        .from('categorias')
        .select('id, tipo, espacio_id')
        .eq('id', payload.categoria_padre_id)
        .maybeSingle();

      if (errorPadre) throw new ErrorApi(500, errorPadre.message);
      if (!padre) throw new ErrorApi(404, 'categoria_padre_id no existe o no tienes acceso a ella');
      if (padre.espacio_id !== payload.espacio_id) {
        throw new ErrorApi(400, 'La categoría padre debe pertenecer al mismo espacio');
      }
      if (padre.tipo !== payload.tipo) {
        throw new ErrorApi(400, 'La categoría padre debe ser del mismo tipo (ingreso/gasto)');
      }
    }

    const { data, error } = await supabase.from('categorias').insert(payload).select().single();

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para crear categorías');
      if (error.code === '23505') throw new ErrorApi(409, 'Ya existe una categoría con ese nombre en este nivel');
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
  console.error('Error inesperado en /api/categorias:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
