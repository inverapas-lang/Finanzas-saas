import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';
import { validarCambiosPatrimonioHistorico } from '../../../../lib/validacion-patrimonio-historico';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const cambios = await request.json();
    delete cambios.id;
    delete cambios.espacio_id;
    delete cambios.mes;
    delete cambios.created_by;
    delete cambios.created_at;
    validarCambiosPatrimonioHistorico(cambios);

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('patrimonio_historico')
      .update(cambios)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para editar este registro de patrimonio');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!data) throw new ErrorApi(404, 'Registro de patrimonio no encontrado o sin acceso');

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
      .from('patrimonio_historico')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para eliminar este registro de patrimonio');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!count) throw new ErrorApi(404, 'Registro de patrimonio no encontrado o sin acceso');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/patrimonio-historico/[id]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
