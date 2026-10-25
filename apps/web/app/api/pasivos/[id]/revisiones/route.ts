import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../../lib/supabase-server';
import { regenerarCuadroAmortizacion } from '../../../../../lib/regenerar-cuadro';

interface Contexto {
  params: Promise<{ id: string }>;
}

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/pasivos/:id/revisiones
 *
 * Registra un HECHO REAL: "desde la cuota X, el tipo pasa a ser Y" (Y ya
 * calculado como indicador + diferencial, tú decides ese número, esta API
 * no lo calcula ni lo trae de ninguna fuente externa). Body esperado:
 *   { numero_cuota: number, fecha: "YYYY-MM-DD", tipo_total_aplicado: number,
 *     indicador_valor?: number, notas?: string }
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
    if (typeof body.tipo_total_aplicado !== 'number' || body.tipo_total_aplicado < 0) {
      throw new ErrorApi(400, 'tipo_total_aplicado debe ser un número >= 0 (fracción, ej. 0.042)');
    }
    if (body.indicador_valor !== undefined && typeof body.indicador_valor !== 'number') {
      throw new ErrorApi(400, 'indicador_valor debe ser un número si se indica');
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

    const { data: revision, error: errorRevision } = await supabase
      .from('revisiones_tipo_interes')
      .insert({
        pasivo_id: pasivoId,
        numero_cuota: body.numero_cuota,
        fecha: body.fecha,
        tipo_total_aplicado: body.tipo_total_aplicado,
        indicador_valor: body.indicador_valor ?? null,
        notas: body.notas ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (errorRevision) {
      if (errorRevision.code === '42501') {
        throw new ErrorApi(403, 'No tienes permiso para registrar revisiones en este pasivo');
      }
      if (errorRevision.code === '23505') {
        throw new ErrorApi(409, `Ya existe una revisión registrada para la cuota ${body.numero_cuota}`);
      }
      throw new ErrorApi(400, errorRevision.message);
    }

    // Con la revisión ya guardada, regeneramos el cuadro completo para que
    // refleje el nuevo tipo desde esa cuota en adelante.
    await regenerarCuadroAmortizacion(supabase, pasivo);

    return NextResponse.json({ data: revision }, { status: 201 });
  } catch (err) {
    return manejarError(err);
  }
}

export async function GET(request: NextRequest, { params }: Contexto) {
  try {
    const { id: pasivoId } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);

    const { data, error } = await supabase
      .from('revisiones_tipo_interes')
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
  console.error('Error inesperado en /api/pasivos/[id]/revisiones:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
