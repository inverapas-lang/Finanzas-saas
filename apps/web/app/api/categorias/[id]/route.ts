import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase.from('categorias').select('*').eq('id', id).maybeSingle();

    if (error) throw new ErrorApi(500, error.message);
    if (!data) throw new ErrorApi(404, 'Categoría no encontrada');

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const cambios = await request.json();
    delete cambios.id;
    delete cambios.espacio_id;
    delete cambios.tipo; // cambiar el tipo de una categoría con movimientos ya asociados sería inconsistente

    const supabase = crearClienteSupabaseDeRequest(request);

    if (cambios.categoria_padre_id) {
      if (cambios.categoria_padre_id === id) {
        throw new ErrorApi(400, 'Una categoría no puede ser su propio padre');
      }

      const { data: actual, error: errorActual } = await supabase
        .from('categorias')
        .select('espacio_id, tipo')
        .eq('id', id)
        .maybeSingle();
      if (errorActual) throw new ErrorApi(500, errorActual.message);
      if (!actual) throw new ErrorApi(404, 'Categoría no encontrada o sin acceso');

      const { data: padre, error: errorPadre } = await supabase
        .from('categorias')
        .select('id, tipo, espacio_id')
        .eq('id', cambios.categoria_padre_id)
        .maybeSingle();
      if (errorPadre) throw new ErrorApi(500, errorPadre.message);
      if (!padre) throw new ErrorApi(404, 'categoria_padre_id no existe o no tienes acceso a ella');
      if (padre.espacio_id !== actual.espacio_id) {
        throw new ErrorApi(400, 'La categoría padre debe pertenecer al mismo espacio');
      }
      if (padre.tipo !== actual.tipo) {
        throw new ErrorApi(400, 'La categoría padre debe ser del mismo tipo (ingreso/gasto)');
      }
    }

    const { data, error } = await supabase
      .from('categorias')
      .update(cambios)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para editar esta categoría');
      throw new ErrorApi(400, error.message);
    }
    if (!data) throw new ErrorApi(404, 'Categoría no encontrada o sin acceso');

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    // Las subcategorías hijas quedan con categoria_padre_id = null
    // (ON DELETE SET NULL en el esquema), no se borran en cascada.
    const { error, count } = await supabase.from('categorias').delete({ count: 'exact' }).eq('id', id);

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para eliminar esta categoría');
      if (error.code === '23503') {
        throw new ErrorApi(409, 'No se puede eliminar: hay ingresos o gastos asociados a esta categoría');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!count) throw new ErrorApi(404, 'Categoría no encontrada o sin acceso');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/categorias/[id]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
