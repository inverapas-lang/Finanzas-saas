import { NextRequest, NextResponse } from 'next/server';
import { generarCuadroAmortizacion } from '@finanzas-saas/loan-engine';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../../lib/supabase-server';

interface Contexto {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/pasivos/:id/simular
 *
 * Simula, SIN GUARDAR NADA, el efecto de:
 *  - 'amortizacion_parcial': aportar un importe extra tras una cuota concreta.
 *  - 'cancelacion_total': cancelar todo el capital pendiente tras una cuota concreta.
 *
 * Body:
 *   { tipo: 'amortizacion_parcial', numero_cuota: number, importe: number, estrategia: 'reducir_cuota'|'reducir_plazo' }
 *   { tipo: 'cancelacion_total', numero_cuota: number }
 *
 * La comparación se hace contra el escenario REAL actual (capital inicial +
 * revisiones de tipo + amortizaciones extra ya registradas de verdad),
 * no contra un préstamo "limpio" — así el ahorro mostrado es el que
 * corresponde a tu situación real hoy, no a un préstamo hipotético.
 */
export async function POST(request: NextRequest, { params }: Contexto) {
  try {
    const { id: pasivoId } = await params;
    const body = await request.json();

    if (body.tipo !== 'amortizacion_parcial' && body.tipo !== 'cancelacion_total') {
      throw new ErrorApi(400, 'tipo debe ser "amortizacion_parcial" o "cancelacion_total"');
    }
    if (typeof body.numero_cuota !== 'number' || body.numero_cuota < 1) {
      throw new ErrorApi(400, 'numero_cuota debe ser un número >= 1');
    }
    if (body.tipo === 'amortizacion_parcial') {
      if (typeof body.importe !== 'number' || body.importe <= 0) {
        throw new ErrorApi(400, 'importe debe ser un número > 0');
      }
      if (body.estrategia !== 'reducir_cuota' && body.estrategia !== 'reducir_plazo') {
        throw new ErrorApi(400, 'estrategia debe ser "reducir_cuota" o "reducir_plazo"');
      }
    }

    const supabase = crearClienteSupabaseDeRequest(request);

    const { data: pasivo, error: errorPasivo } = await supabase
      .from('pasivos')
      .select('id, capital_inicial, tipo_interes_anual, plazo_meses, fecha_inicio')
      .eq('id', pasivoId)
      .maybeSingle();

    if (errorPasivo) throw new ErrorApi(500, errorPasivo.message);
    if (!pasivo) throw new ErrorApi(404, 'Pasivo no encontrado o sin acceso');

    const [{ data: revisiones, error: errorRevisiones }, { data: reales, error: errorReales }] =
      await Promise.all([
        supabase
          .from('revisiones_tipo_interes')
          .select('numero_cuota, tipo_total_aplicado')
          .eq('pasivo_id', pasivoId),
        supabase
          .from('amortizaciones_extra')
          .select('numero_cuota, importe, estrategia')
          .eq('pasivo_id', pasivoId),
      ]);

    if (errorRevisiones) throw new ErrorApi(500, errorRevisiones.message);
    if (errorReales) throw new ErrorApi(500, errorReales.message);

    if ((reales ?? []).some((r) => r.numero_cuota === body.numero_cuota)) {
      throw new ErrorApi(
        409,
        `Ya existe una amortización extra real registrada en la cuota ${body.numero_cuota}. Elige otra cuota para simular, o consulta el histórico real de este préstamo.`
      );
    }

    const cambiosTipoInteres = (revisiones ?? []).map((r) => ({
      numeroCuota: r.numero_cuota,
      nuevoTipoInteresAnual: r.tipo_total_aplicado,
    }));
    const amortizacionesReales = (reales ?? []).map((a) => ({
      numeroCuota: a.numero_cuota,
      importe: a.importe,
      estrategia: a.estrategia as 'reducir_cuota' | 'reducir_plazo',
    }));

    const parametrosBase = {
      capitalInicial: pasivo.capital_inicial,
      tipoInteresAnual: pasivo.tipo_interes_anual,
      plazoMeses: pasivo.plazo_meses,
      fechaPrimeraCuota: pasivo.fecha_inicio,
      cambiosTipoInteres,
      amortizacionesExtra: amortizacionesReales,
    };

    const escenarioActual = generarCuadroAmortizacion(parametrosBase);

    let importeSimulado: number;
    let estrategiaSimulada: 'reducir_cuota' | 'reducir_plazo';

    if (body.tipo === 'cancelacion_total') {
      const filaCuota = escenarioActual.cuadro.find(
        (f) => f.numeroCuota === body.numero_cuota && !f.esAmortizacionExtra
      );
      if (!filaCuota) {
        throw new ErrorApi(400, `La cuota ${body.numero_cuota} no existe en el cuadro actual de este préstamo`);
      }
      if (filaCuota.capitalPendiente <= 0) {
        throw new ErrorApi(400, 'El préstamo ya está saldado en esa cuota, no hay nada que cancelar');
      }
      importeSimulado = filaCuota.capitalPendiente;
      estrategiaSimulada = 'reducir_plazo'; // con cancelación total da igual la estrategia, el resultado es el mismo
    } else {
      importeSimulado = body.importe;
      estrategiaSimulada = body.estrategia;
    }

    const escenarioSimulado = generarCuadroAmortizacion({
      ...parametrosBase,
      amortizacionesExtra: [
        ...amortizacionesReales,
        { numeroCuota: body.numero_cuota, importe: importeSimulado, estrategia: estrategiaSimulada },
      ],
    });

    const cuotaAntes =
      escenarioActual.cuadro.find((f) => f.numeroCuota === body.numero_cuota && !f.esAmortizacionExtra)
        ?.cuota ?? escenarioActual.cuotaInicial;
    const filaDespues = escenarioSimulado.cuadro.find(
      (f) => f.numeroCuota === body.numero_cuota + 1 && !f.esAmortizacionExtra
    );

    return NextResponse.json({
      data: {
        tipo: body.tipo,
        numeroCuota: body.numero_cuota,
        importeAportado: importeSimulado,
        cuotaAntes,
        cuotaDespues: filaDespues?.cuota ?? null, // null = préstamo ya cancelado, no hay "después"
        interesesTotalesAntes: escenarioActual.totales.totalIntereses,
        interesesTotalesDespues: escenarioSimulado.totales.totalIntereses,
        interesesAhorrados: Number(
          (escenarioActual.totales.totalIntereses - escenarioSimulado.totales.totalIntereses).toFixed(2)
        ),
        mesesTotalesAntes: escenarioActual.totales.numeroCuotasReales,
        mesesTotalesDespues: escenarioSimulado.totales.numeroCuotasReales,
        mesesAhorrados:
          escenarioActual.totales.numeroCuotasReales - escenarioSimulado.totales.numeroCuotasReales,
      },
    });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/pasivos/[id]/simular:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
