import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { error, count } = await supabase.from('vistas_guardadas').delete({ count: 'exact' }).eq('id', id);

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para eliminar esta vista');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!count) throw new ErrorApi(404, 'Vista guardada no encontrada o sin acceso');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/vistas-guardadas/[id]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
