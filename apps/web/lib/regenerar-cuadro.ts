import type { SupabaseClient } from '@supabase/supabase-js';
import { generarCuadroAmortizacion } from '@finanzas-saas/loan-engine';
import { ErrorApi } from './supabase-server';

interface PasivoParaCuadro {
  id: string;
  capital_inicial: number;
  tipo_interes_anual: number;
  plazo_meses: number;
  fecha_inicio: string;
}

/**
 * Regenera el cuadro de amortización completo de un pasivo desde el
 * origen (cuota 1) y lo guarda en `cuadro_amortizacion`, sustituyendo
 * cualquier contenido anterior.
 *
 * Decisión de diseño: se recalcula SIEMPRE desde cuota 1 con
 * capital_inicial, en vez de intentar regenerar solo "desde la última
 * revisión" a partir del capital pendiente actual. Regenerar parcialmente
 * exigiría conocer con certeza el capital pendiente exacto justo antes del
 * punto de corte, y un error ahí contaminaría todo el resto del cuadro sin
 * que se note. Recalcular todo desde el origen es más simple, siempre
 * consistente, y el coste (como mucho ~360 filas) es insignificante.
 *
 * IMPORTANTE sobre hipotecas variables/mixtas: el motor solo conoce los
 * cambios de tipo YA REGISTRADOS en `revisiones_tipo_interes` (hechos
 * reales). Las cuotas futuras más allá de la última revisión conocida se
 * calculan asumiendo que el tipo actual se mantiene constante — es una
 * PROYECCIÓN, no una promesa, y se corrige cada vez que se registra una
 * revisión real nueva (ver /api/pasivos/[id]/revisiones).
 */
export async function regenerarCuadroAmortizacion(
  supabase: SupabaseClient,
  pasivo: PasivoParaCuadro
): Promise<void> {
  const [{ data: revisiones, error: errorRevisiones }, { data: amortizacionesExtra, error: errorExtra }] =
    await Promise.all([
      supabase
        .from('revisiones_tipo_interes')
        .select('numero_cuota, tipo_total_aplicado')
        .eq('pasivo_id', pasivo.id)
        .order('numero_cuota', { ascending: true }),
      supabase
        .from('amortizaciones_extra')
        .select('numero_cuota, importe, estrategia')
        .eq('pasivo_id', pasivo.id)
        .order('numero_cuota', { ascending: true }),
    ]);

  if (errorRevisiones) {
    throw new ErrorApi(500, `Error leyendo revisiones de tipo: ${errorRevisiones.message}`);
  }
  if (errorExtra) {
    throw new ErrorApi(500, `Error leyendo amortizaciones extra: ${errorExtra.message}`);
  }

  const cambiosTipoInteres = (revisiones ?? []).map((r) => ({
    numeroCuota: r.numero_cuota,
    nuevoTipoInteresAnual: r.tipo_total_aplicado,
  }));

  const amortExtra = (amortizacionesExtra ?? []).map((a) => ({
    numeroCuota: a.numero_cuota,
    importe: a.importe,
    estrategia: a.estrategia as 'reducir_cuota' | 'reducir_plazo',
  }));

  const resultado = generarCuadroAmortizacion({
    capitalInicial: pasivo.capital_inicial,
    tipoInteresAnual: pasivo.tipo_interes_anual,
    plazoMeses: pasivo.plazo_meses,
    fechaPrimeraCuota: pasivo.fecha_inicio,
    cambiosTipoInteres,
    amortizacionesExtra: amortExtra,
  });

  const { error: errorBorrado } = await supabase
    .from('cuadro_amortizacion')
    .delete()
    .eq('pasivo_id', pasivo.id);

  if (errorBorrado) {
    throw new ErrorApi(500, `Error borrando cuadro anterior: ${errorBorrado.message}`);
  }

  const filasAInsertar = resultado.cuadro.map((fila) => ({
    pasivo_id: pasivo.id,
    numero_cuota: fila.numeroCuota,
    fecha: fila.fecha,
    cuota: fila.cuota,
    capital: fila.capital,
    intereses: fila.intereses,
    capital_pendiente: fila.capitalPendiente,
    es_amortizacion_extra: fila.esAmortizacionExtra,
  }));

  const { error: errorInsercion } = await supabase
    .from('cuadro_amortizacion')
    .insert(filasAInsertar);

  if (errorInsercion) {
    throw new ErrorApi(500, `Error guardando el nuevo cuadro: ${errorInsercion.message}`);
  }
}
