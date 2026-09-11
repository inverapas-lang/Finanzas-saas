import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';
import { validarCambiosMovimiento } from '../../../../lib/validacion-movimientos';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('ingresos')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new ErrorApi(500, error.message);
    if (!data) throw new ErrorApi(404, 'Ingreso no encontrado');

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const cambios = await request.json();

    // Campos que nunca se aceptan por API (se gestionan por el sistema).
    delete cambios.id;
    delete cambios.espacio_id;
    delete cambios.created_by;
    delete cambios.created_at;
    validarCambiosMovimiento(cambios, 'ingreso');

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('ingresos')
      .update(cambios)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para editar este ingreso');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!data) throw new ErrorApi(404, 'Ingreso no encontrado o sin acceso');

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
      .from('ingresos')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para eliminar este ingreso');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!count) throw new ErrorApi(404, 'Ingreso no encontrado o sin acceso');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/ingresos/[id]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
