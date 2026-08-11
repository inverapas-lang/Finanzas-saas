import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';
import { regenerarCuadroAmortizacion } from '../../../../lib/regenerar-cuadro';

interface Contexto {
  params: Promise<{ id: string }>;
}

// Campos que, si cambian, obligan a regenerar el cuadro de amortización
// porque afectan directamente al cálculo (no basta con guardar el cambio).
const CAMPOS_QUE_AFECTAN_AL_CUADRO = ['capital_inicial', 'tipo_interes_anual', 'plazo_meses', 'fecha_inicio'];

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    const { data, error } = await supabase.from('pasivos').select('*').eq('id', id).maybeSingle();

    if (error) throw new ErrorApi(500, error.message);
    if (!data) throw new ErrorApi(404, 'Pasivo no encontrado');

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
    delete cambios.cuota; // se recalcula, no se edita a mano

    const necesitaRegenerar = Object.keys(cambios).some((campo) =>
      CAMPOS_QUE_AFECTAN_AL_CUADRO.includes(campo)
    );

    const supabase = crearClienteSupabaseDeRequest(request);
    const { data: pasivo, error } = await supabase
      .from('pasivos')
      .update(cambios)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para editar este pasivo');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!pasivo) throw new ErrorApi(404, 'Pasivo no encontrado o sin acceso');

    if (necesitaRegenerar) {
      await regenerarCuadroAmortizacion(supabase, pasivo);
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
    }

    return NextResponse.json({ data: pasivo });
  } catch (err) {
    return manejarError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);
    // ON DELETE CASCADE en el esquema borra también su cuadro_amortizacion
    // y sus revisiones_tipo_interes — no hace falta borrarlos a mano aquí.
    const { error, count } = await supabase.from('pasivos').delete({ count: 'exact' }).eq('id', id);

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para eliminar este pasivo');
      }
      throw new ErrorApi(400, error.message);
    }
    if (!count) throw new ErrorApi(404, 'Pasivo no encontrado o sin acceso');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/pasivos/[id]:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
