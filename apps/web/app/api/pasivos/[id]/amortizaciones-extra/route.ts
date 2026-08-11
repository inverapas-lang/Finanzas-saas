import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../../lib/supabase-server';
import { regenerarCuadroAmortizacion } from '../../../../../lib/regenerar-cuadro';

interface Contexto {
  params: Promise<{ id: string }>;
}

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ESTRATEGIAS = ['reducir_cuota', 'reducir_plazo'];

/**
 * POST /api/pasivos/:id/amortizaciones-extra
 * Registra un HECHO REAL: "ya he aportado X€ de más tras la cuota N".
 * Regenera el cuadro completo para que lo refleje desde ese punto.
 */
export async function POST(request: NextRequest, { params }: Contexto) {
  try {
    const { id: pasivoId } = await params;
    const body = await request.json();

    if (typeof body.numero_cuota !== 'number' || body.numero_cuota < 1) {
      throw new ErrorApi(400, 'numero_cuota debe ser un número >= 1');
    }
    if (typeof body.fecha !== 'string' || !FECHA_REGEX.test(body.fecha)) {
      throw new ErrorApi(400, 'fecha debe tener formato YYYY-MM-DD');
    }
    if (typeof body.importe !== 'number' || body.importe <= 0) {
      throw new ErrorApi(400, 'importe debe ser un número > 0');
    }
    if (typeof body.estrategia !== 'string' || !ESTRATEGIAS.includes(body.estrategia)) {
      throw new ErrorApi(400, `estrategia debe ser: ${ESTRATEGIAS.join(' o ')}`);
    }

    const supabase = crearClienteSupabaseDeRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const { data: pasivo, error: errorPasivo } = await supabase
      .from('pasivos')
      .select('id, capital_inicial, tipo_interes_anual, plazo_meses, fecha_inicio')
      .eq('id', pasivoId)
      .maybeSingle();

    if (errorPasivo) throw new ErrorApi(500, errorPasivo.message);
    if (!pasivo) throw new ErrorApi(404, 'Pasivo no encontrado o sin acceso');

    const { data: registro, error: errorInsert } = await supabase
      .from('amortizaciones_extra')
      .insert({
        pasivo_id: pasivoId,
        numero_cuota: body.numero_cuota,
        fecha: body.fecha,
        importe: body.importe,
        estrategia: body.estrategia,
        notas: body.notas ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (errorInsert) {
      if (errorInsert.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para registrar amortizaciones en este pasivo');
      }
      throw new ErrorApi(400, errorInsert.message);
    }

    await regenerarCuadroAmortizacion(supabase, pasivo);

    return NextResponse.json({ data: registro }, { status: 201 });
  } catch (err) {
    return manejarError(err);
  }
}

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id: pasivoId } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);

    const { data, error } = await supabase
      .from('amortizaciones_extra')
      .select('*')
      .eq('pasivo_id', pasivoId)
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
  console.error('Error inesperado en /api/pasivos/[id]/amortizaciones-extra:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
