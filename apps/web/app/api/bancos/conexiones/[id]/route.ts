import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../../lib/supabase-server';
import { eliminarRequisition, ErrorGoCardless } from '../../../../../lib/gocardless';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase.from('conexiones_bancarias').select('*').eq('id', id).maybeSingle();

    if (error) throw new ErrorApi(500, error.message);
    if (!data) throw new ErrorApi(404, 'Conexión bancaria no encontrada');

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

/**
 * DELETE revoca el acceso en GoCardless (si la requisition sigue viva) y
 * marca la conexión como "revocada" — no se borra la fila para conservar
 * el histórico de qué se importó desde ella (transacciones_externas la
 * referencia indirectamente vía cuentas_bancarias.conexion_bancaria_id).
 */
export async function DELETE(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);

    const { data: conexion, error: errorLectura } = await supabase
      .from('conexiones_bancarias')
      .select('requisition_id, estado')
      .eq('id', id)
      .maybeSingle();
    if (errorLectura) throw new ErrorApi(500, errorLectura.message);
    if (!conexion) throw new ErrorApi(404, 'Conexión bancaria no encontrada o sin acceso');

    if (conexion.estado !== 'pendiente' && !conexion.requisition_id.startsWith('pendiente-')) {
      try {
        await eliminarRequisition(conexion.requisition_id);
      } catch (errorGoCardless) {
        // No bloqueamos la revocación local por un fallo al avisar a GoCardless
        // (p. ej. la requisition ya había expirado por su cuenta): se registra
        // y se sigue, para que el usuario pueda desvincular igualmente desde aquí.
        console.error('Error revocando requisition en GoCardless:', errorGoCardless);
      }
    }

    const { error: errorUpdate, count } = await supabase
      .from('conexiones_bancarias')
      .update({ estado: 'revocada' }, { count: 'exact' })
      .eq('id', id);

    if (errorUpdate) {
      if (errorUpdate.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para desvincular este banco');
      }
      throw new ErrorApi(400, errorUpdate.message);
    }
    if (!count) throw new ErrorApi(404, 'Conexión bancaria no encontrada o sin acceso');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ErrorGoCardless) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  console.error('Error inesperado en /api/bancos/conexiones/[id]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
