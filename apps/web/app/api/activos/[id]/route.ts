import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';
import { validarCambiosActivo } from '../../../../lib/validacion-activos';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase.from('activos').select('*').eq('id', id).maybeSingle();

    if (error) throw new ErrorApi(500, error.message);
    if (!data) throw new ErrorApi(404, 'Activo no encontrado');

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
    delete cambios.created_at;
    validarCambiosActivo(cambios);

    // Si se actualiza el valor sin indicar fecha, ponemos la de hoy — un
    // valor sin fecha de valoración asociada no tiene sentido de negocio.
    if (cambios.valor_actual !== undefined && cambios.fecha_valoracion === undefined) {
      cambios.fecha_valoracion = new Date().toISOString().slice(0, 10);
    }

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('activos')
      .update(cambios)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para editar este activo');
      throw new ErrorApi(400, error.message);
    }
    if (!data) throw new ErrorApi(404, 'Activo no encontrado o sin acceso');

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { error, count } = await supabase.from('activos').delete({ count: 'exact' }).eq('id', id);

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para eliminar este activo');
      throw new ErrorApi(400, error.message);
    }
    if (!count) throw new ErrorApi(404, 'Activo no encontrado o sin acceso');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/activos/[id]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
