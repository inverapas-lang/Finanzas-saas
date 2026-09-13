import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';
import { listarInstituciones, ErrorGoCardless } from '../../../../lib/gocardless';

/**
 * GET /api/bancos/instituciones?pais=ES
 * Lista los bancos disponibles para conectar en ese país. Requiere sesión
 * pero no un espacio_id concreto — es un catálogo, no datos del usuario.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = crearClienteSupabaseDeRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const pais = request.nextUrl.searchParams.get('pais') ?? 'ES';
    const instituciones = await listarInstituciones(pais);

    return NextResponse.json({ data: instituciones });
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
  console.error('Error inesperado en /api/bancos/instituciones:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
