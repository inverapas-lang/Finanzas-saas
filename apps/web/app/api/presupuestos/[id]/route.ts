import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase.from('presupuestos').select('*').eq('id', id).maybeSingle();

    if (error) throw new ErrorApi(500, error.message);
    if (!data) throw new ErrorApi(404, 'Presupuesto no encontrado');

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
    delete cambios.categoria_id; // cambiar de categoría sería un presupuesto distinto, no una edición
    delete cambios.created_at;

    if (cambios.importe_planificado !== undefined) {
      if (typeof cambios.importe_planificado !== 'number' || cambios.importe_planificado <= 0) {
        throw new ErrorApi(400, 'importe_planificado debe ser un número mayor que 0');
      }
    }

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('presupuestos')
      .update(cambios)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para editar este presupuesto');
      throw new ErrorApi(400, error.message);
    }
    if (!data) throw new ErrorApi(404, 'Presupuesto no encontrado o sin acceso');

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { error, count } = await supabase.from('presupuestos').delete({ count: 'exact' }).eq('id', id);

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para eliminar este presupuesto');
      throw new ErrorApi(400, error.message);
    }
    if (!count) throw new ErrorApi(404, 'Presupuesto no encontrado o sin acceso');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/presupuestos/[id]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
