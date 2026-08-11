import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../../../lib/supabase-server';

interface Contexto {
  params: Promise<{ id: string; usuarioId: string }>;
}

export async function DELETE(request: NextRequest, { params }: Contexto) {
  try {
    const { id: espacioId, usuarioId } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);

    // No dejamos que el owner se elimine a sí mismo por esta vía — se
    // quedaría el espacio sin ningún administrador. Si de verdad hace
    // falta transferir la propiedad, es una operación deliberada aparte,
    // no un clic accidental en "eliminar miembro".
    const { data: miembro, error: errorMiembro } = await supabase
      .from('miembros_espacio')
      .select('rol')
      .eq('espacio_id', espacioId)
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    if (errorMiembro) throw new ErrorApi(500, errorMiembro.message);
    if (miembro?.rol === 'owner') {
      throw new ErrorApi(400, 'No se puede eliminar al propietario del espacio');
    }

    const { error, count } = await supabase
      .from('miembros_espacio')
      .delete({ count: 'exact' })
      .eq('espacio_id', espacioId)
      .eq('usuario_id', usuarioId);

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para eliminar miembros de este espacio');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!count) throw new ErrorApi(404, 'Ese usuario no es miembro de este espacio');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/espacios/[id]/miembros/[usuarioId]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
