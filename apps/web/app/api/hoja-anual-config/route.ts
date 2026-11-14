import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { idsCategoriaDeConfig, validarPayloadConfigHojaAnual } from '../../../lib/validacion-hoja-anual';

/**
 * GET /api/hoja-anual-config?espacio_id=...&anio=2026
 * Devuelve { data: configuracion | null }. RLS (hoja_anual_config_select)
 * decide si el usuario puede verla.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const espacio_id = params.get('espacio_id');
    const anio = Number(params.get('anio'));
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');
    if (!Number.isInteger(anio)) throw new ErrorApi(400, 'El parámetro anio es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('hoja_anual_config')
      .select('configuracion')
      .eq('espacio_id', espacio_id)
      .eq('anio', anio)
      .maybeSingle();
    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data: data?.configuracion ?? null });
  } catch (err) {
    return manejarError(err);
  }
}

/**
 * PUT /api/hoja-anual-config
 * Body: { espacio_id, anio, configuracion }. Crea o sustituye la
 * configuración de ese año.
 */
export async function PUT(request: NextRequest) {
  try {
    const payload = validarPayloadConfigHojaAnual(await request.json());
    const supabase = crearClienteSupabaseDeRequest(request);

    // Multi-tenant: las categorías elegidas tienen que ser de este espacio.
    const ids = idsCategoriaDeConfig(payload.configuracion);
    if (ids.length > 0) {
      const { data: encontradas, error } = await supabase
        .from('categorias')
        .select('id')
        .eq('espacio_id', payload.espacio_id)
        .in('id', ids);
      if (error) throw new ErrorApi(500, error.message);
      if ((encontradas ?? []).length !== ids.length) {
        throw new ErrorApi(400, 'Alguna de las categorías elegidas no pertenece a este espacio');
      }
    }

    const { data, error } = await supabase
      .from('hoja_anual_config')
      .upsert(
        { espacio_id: payload.espacio_id, anio: payload.anio, configuracion: payload.configuracion },
        { onConflict: 'espacio_id,anio' }
      )
      .select('configuracion')
      .single();

    if (error) {
      if (error.code === '42501') throw new ErrorApi(403, 'No tienes permiso para cambiar la hoja de este espacio');
      throw new ErrorApi(400, error.message);
    }
    return NextResponse.json({ data: data.configuracion });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/hoja-anual-config:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
