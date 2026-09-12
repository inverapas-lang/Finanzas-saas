import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';
import { validarCambiosMeta } from '../../../../lib/validacion-metas';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase.from('metas_ahorro').select('*').eq('id', id).maybeSingle();

    if (error) throw new ErrorApi(500, error.message);
    if (!data) throw new ErrorApi(404, 'Meta de ahorro no encontrada');

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
    validarCambiosMeta(cambios);

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('metas_ahorro')
      .update(cambios)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para editar esta meta de ahorro');
      throw new ErrorApi(400, error.message);
    }
    if (!data) throw new ErrorApi(404, 'Meta de ahorro no encontrada o sin acceso');

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { error, count } = await supabase.from('metas_ahorro').delete({ count: 'exact' }).eq('id', id);

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para eliminar esta meta de ahorro');
      throw new ErrorApi(400, error.message);
    }
    if (!count) throw new ErrorApi(404, 'Meta de ahorro no encontrada o sin acceso');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/metas/[id]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
