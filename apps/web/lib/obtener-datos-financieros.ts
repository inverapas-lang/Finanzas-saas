import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularProyeccion } from '@finanzas-saas/projection-engine';
import { ErrorApi } from './supabase-server';
import { mapearMovimiento, mapearReglaRecurrente } from './mappers-proyeccion';
import type { DatosFinancieros } from './contexto-financiero';

/**
 * Reúne los datos financieros reales de un espacio para dárselos al
 * asistente de chat. Replica los mismos criterios de cálculo que ya usa
 * el resto de la app (p. ej. el patrimonio se suma sin conversión de
 * divisa, igual que en /dashboard — ver apps/web/app/dashboard/page.tsx)
 * en vez de inventar una lógica de agregación nueva.
 */
export async function obtenerDatosFinancieros(
  supabase: SupabaseClient,
  espacioId: string
): Promise<DatosFinancieros> {
  const hoy = new Date().toISOString().slice(0, 10);
  const finMes = finDeMes(hoy);
  const inicioMesActual = hoy.slice(0, 7) + '-01';
  const hace3Meses = restarMeses(hoy, 3);

  const [
    activosRes,
    pasivosRes,
    categoriasRes,
    reglasRes,
    ingresosRes,
    gastosRes,
    presupuestosRes,
  ] = await Promise.all([
    supabase.from('activos').select('nombre, tipo, valor_actual').eq('espacio_id', espacioId),
    supabase
      .from('pasivos')
      .select('nombre, tipo, capital_pendiente, cuota, tipo_interes_anual')
      .eq('espacio_id', espacioId)
      .eq('activo', true),
    supabase.from('categorias').select('id, nombre').eq('espacio_id', espacioId),
    supabase
      .from('reglas_recurrentes')
      .select('id, tipo, importe, periodicidad, fecha_inicio, fecha_fin, activa, categoria_id')
      .eq('espacio_id', espacioId)
      .eq('activa', true),
    supabase
      .from('ingresos')
      .select(
        'id, categoria_id, importe_esperado, importe_real, fecha_prevista, fecha_cobrada, regla_recurrente_id'
      )
      .eq('espacio_id', espacioId)
      .lte('fecha_prevista', finMes),
    // fecha_prevista <= finMes cubre a la vez lo necesario para la
    // proyección del mes, el desglose por categoría de los últimos 3
    // meses y el gasto real del mes en curso (para los presupuestos).
    supabase
      .from('gastos')
      .select(
        'id, categoria_id, importe_previsto, importe_real, fecha_prevista, fecha_pagada, regla_recurrente_id'
      )
      .eq('espacio_id', espacioId)
      .lte('fecha_prevista', finMes),
    supabase
      .from('presupuestos')
      .select('categoria_id, importe_planificado')
      .eq('espacio_id', espacioId)
      .eq('periodo_tipo', 'mensual')
      .eq('periodo_inicio', inicioMesActual),
  ]);

  for (const res of [
    activosRes,
    pasivosRes,
    categoriasRes,
    reglasRes,
    ingresosRes,
    gastosRes,
    presupuestosRes,
  ]) {
    if (res.error) throw new ErrorApi(500, res.error.message);
  }

  const nombrePorCategoria = new Map<string, string>(
    (categoriasRes.data ?? []).map((c: { id: string; nombre: string }) => [c.id, c.nombre])
  );

  const activos = (activosRes.data ?? []).map(
    (a: { nombre: string; tipo: string; valor_actual: number }) => ({
      nombre: a.nombre,
      tipo: a.tipo,
      valorActual: a.valor_actual,
    })
  );
  const totalActivos = activos.reduce((acc, a) => acc + a.valorActual, 0);

  const pasivos = (pasivosRes.data ?? []).map(
    (p: {
      nombre: string;
      tipo: string;
      capital_pendiente: number;
      cuota: number;
      tipo_interes_anual: number;
    }) => ({
      nombre: p.nombre,
      tipo: p.tipo,
      capitalPendiente: p.capital_pendiente,
      cuota: p.cuota,
      tipoInteresAnual: p.tipo_interes_anual,
    })
  );
  const totalPasivos = pasivos.reduce((acc, p) => acc + p.capitalPendiente, 0);

  const reglasRecurrentes = (reglasRes.data ?? []).map(mapearReglaRecurrente);
  const gastosFilas = gastosRes.data ?? [];
  const ingresosFilas = ingresosRes.data ?? [];
  const movimientosReales = [
    ...ingresosFilas.map((f: Parameters<typeof mapearMovimiento>[0]) =>
      mapearMovimiento(f, 'ingreso')
    ),
    ...gastosFilas.map((f: Parameters<typeof mapearMovimiento>[0]) => mapearMovimiento(f, 'gasto')),
  ];

  const proyeccion = calcularProyeccion({
    fechaCorte: hoy,
    fechaObjetivo: finMes,
    reglasRecurrentes,
    movimientosReales,
  });

  // Gasto por categoría, últimos 3 meses (usa importe_real si ya está
  // pagado, si no el previsto — igual criterio que el resto de la app).
  const gastoPorCategoria = new Map<string, number>();
  for (const g of gastosFilas as {
    categoria_id: string | null;
    importe_previsto: number;
    importe_real: number | null;
    fecha_prevista: string;
  }[]) {
    if (g.fecha_prevista < hace3Meses) continue;
    const importe = g.importe_real ?? g.importe_previsto;
    const clave = g.categoria_id ?? 'sin_categoria';
    gastoPorCategoria.set(clave, (gastoPorCategoria.get(clave) ?? 0) + importe);
  }
  const gastosPorCategoriaUltimos3Meses = Array.from(gastoPorCategoria.entries()).map(
    ([categoriaId, total]) => ({
      categoria: nombrePorCategoria.get(categoriaId) ?? 'Sin categoría',
      total,
    })
  );

  // Presupuestos del mes en curso, comparados con el gasto real del mismo
  // mes (no de los últimos 3 meses — se recalcula aparte, con rango exacto).
  const gastoMesActualPorCategoria = new Map<string, number>();
  for (const g of gastosFilas as {
    categoria_id: string | null;
    importe_previsto: number;
    importe_real: number | null;
    fecha_prevista: string;
  }[]) {
    if (g.fecha_prevista < inicioMesActual) continue;
    const importe = g.importe_real ?? g.importe_previsto;
    const clave = g.categoria_id ?? 'sin_categoria';
    gastoMesActualPorCategoria.set(clave, (gastoMesActualPorCategoria.get(clave) ?? 0) + importe);
  }
  const presupuestos = (presupuestosRes.data ?? []).map(
    (p: { categoria_id: string; importe_planificado: number }) => ({
      categoria: nombrePorCategoria.get(p.categoria_id) ?? 'Sin categoría',
      planificado: p.importe_planificado,
      gastado: gastoMesActualPorCategoria.get(p.categoria_id) ?? 0,
    })
  );

  return {
    fecha: hoy,
    patrimonio: {
      totalActivos,
      totalPasivos,
      patrimonioNeto: totalActivos - totalPasivos,
    },
    activos,
    pasivos,
    proyeccionMes: {
      totalEstimadoIngresos: proyeccion.totalEstimadoIngresos,
      totalEstimadoGastos: proyeccion.totalEstimadoGastos,
      saldoEstimado: proyeccion.saldoEstimado,
    },
    gastosPorCategoriaUltimos3Meses,
    presupuestos,
  };
}

function finDeMes(fechaISO: string): string {
  const fecha = new Date(fechaISO + 'T00:00:00Z');
  fecha.setUTCMonth(fecha.getUTCMonth() + 1, 0);
  return fecha.toISOString().slice(0, 10);
}

function restarMeses(fechaISO: string, meses: number): string {
  const fecha = new Date(fechaISO + 'T00:00:00Z');
  fecha.setUTCMonth(fecha.getUTCMonth() - meses);
  return fecha.toISOString().slice(0, 10);
}
