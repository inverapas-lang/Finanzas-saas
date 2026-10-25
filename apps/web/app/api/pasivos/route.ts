import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { validarPayloadPasivo } from '../../../lib/validacion-pasivos';
import { regenerarCuadroAmortizacion } from '../../../lib/regenerar-cuadro';

export async function GET(request: NextRequest) {
  try {
    const espacio_id = request.nextUrl.searchParams.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase
      .from('pasivos')
      .select('*')
      .eq('espacio_id', espacio_id)
      .order('created_at', { ascending: false });

    if (error) throw new ErrorApi(500, error.message);

    return NextResponse.json({ data });
  } catch (err) {
    return manejarError(err);
  }
}

/**
 * POST /api/pasivos
 * Crea el pasivo y, en la misma operación, genera su cuadro de
 * amortización completo con el motor de packages/loan-engine.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = validarPayloadPasivo(body);
    const supabase = crearClienteSupabaseDeRequest(request);

    const { data: pasivo, error } = await supabase
      .from('pasivos')
      .insert({
        espacio_id: payload.espacio_id,
        tipo: payload.tipo,
        nombre: payload.nombre,
        capital_inicial: payload.capital_inicial,
        capital_pendiente: payload.capital_inicial, // al crear, pendiente = inicial
        moneda: payload.moneda,
        tipo_interes_anual: payload.tipo_interes_anual,
        cuota: 0, // se recalcula justo debajo con el motor; placeholder temporal
        fecha_inicio: payload.fecha_inicio,
        plazo_meses: payload.plazo_meses,
        tipo_tasa: payload.tipo_tasa,
        indicador_referencia: payload.indicador_referencia,
        diferencial: payload.diferencial,
        meses_tramo_fijo: payload.meses_tramo_fijo,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para crear pasivos en este espacio');
      }
      throw new ErrorApi(400, error.message);
    }

    // Generar el cuadro de amortización real y, con la primera cuota, fijar
    // el campo `cuota` del pasivo (hasta ahora era un 0 provisional). Si esto
    // falla, el pasivo recién creado quedaría huérfano (sin cuadro y con
    // cuota=0 pero devolviendo un 500), así que lo borramos antes de
    // propagar el error.
    try {
      await regenerarCuadroAmortizacion(supabase, pasivo);
    } catch (errorCuadro) {
      await supabase.from('pasivos').delete().eq('id', pasivo.id);
      throw errorCuadro;
    }

    const { data: primeraCuota } = await supabase
      .from('cuadro_amortizacion')
      .select('cuota')
      .eq('pasivo_id', pasivo.id)
      .eq('numero_cuota', 1)
      .maybeSingle();

    if (primeraCuota) {
      await supabase.from('pasivos').update({ cuota: primeraCuota.cuota }).eq('id', pasivo.id);
      pasivo.cuota = primeraCuota.cuota;
    }

    return NextResponse.json({ data: pasivo }, { status: 201 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/pasivos:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
