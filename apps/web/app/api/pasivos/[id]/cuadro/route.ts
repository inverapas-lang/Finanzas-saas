import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../../lib/supabase-server';

interface Contexto {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pasivos/:id/cuadro
 * Devuelve el cuadro de amortización ya generado y guardado en
 * `cuadro_amortizacion`. No recalcula nada — para eso está
 * /api/pasivos (POST/PATCH) y /api/pasivos/:id/revisiones (POST).
 */
export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);

    const { data: pasivo, error: errorPasivo } = await supabase
      .from('pasivos')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (errorPasivo) throw new ErrorApi(500, errorPasivo.message);
    if (!pasivo) throw new ErrorApi(404, 'Pasivo no encontrado o sin acceso');

    const { data, error } = await supabase
      .from('cuadro_amortizacion')
      .select('*')
      .eq('pasivo_id', id)
      .order('numero_cuota', { ascending: true });

    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/pasivos/[id]/cuadro:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
