import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';
import { validarCambiosReglaRecurrente } from '../../../../lib/validacion-reglas-recurrentes';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase.from('reglas_recurrentes').select('*').eq('id', id).maybeSingle();

    if (error) throw new ErrorApi(500, error.message);
    if (!data) throw new ErrorApi(404, 'Regla recurrente no encontrada');

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
    delete cambios.tipo; // cambiar el tipo de una regla ya usada en proyecciones sería confuso
    delete cambios.created_at;
    validarCambiosReglaRecurrente(cambios);

    const supabase = crearClienteSupabaseDeRequest(request);

    if (cambios.categoria_id) {
      const { data: actual, error: errorActual } = await supabase
        .from('reglas_recurrentes')
        .select('espacio_id, tipo')
        .eq('id', id)
        .maybeSingle();
      if (errorActual) throw new ErrorApi(500, errorActual.message);
      if (!actual) throw new ErrorApi(404, 'Regla recurrente no encontrada o sin acceso');

      const { data: categoria, error: errorCategoria } = await supabase
        .from('categorias')
        .select('id, tipo, espacio_id')
        .eq('id', cambios.categoria_id)
        .maybeSingle();
      if (errorCategoria) throw new ErrorApi(500, errorCategoria.message);
      if (!categoria) throw new ErrorApi(404, 'categoria_id no existe o no tienes acceso a ella');
      if (categoria.espacio_id !== actual.espacio_id) {
        throw new ErrorApi(400, 'La categoría debe pertenecer al mismo espacio');
      }
      if (categoria.tipo !== actual.tipo) {
        throw new ErrorApi(400, 'La categoría debe ser del mismo tipo (ingreso/gasto) que la regla');
      }
    }

    const { data, error } = await supabase
      .from('reglas_recurrentes')
      .update(cambios)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para editar esta regla recurrente');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!data) throw new ErrorApi(404, 'Regla recurrente no encontrada o sin acceso');

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { error, count } = await supabase
      .from('reglas_recurrentes')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para eliminar esta regla recurrente');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!count) throw new ErrorApi(404, 'Regla recurrente no encontrada o sin acceso');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/reglas-recurrentes/[id]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
