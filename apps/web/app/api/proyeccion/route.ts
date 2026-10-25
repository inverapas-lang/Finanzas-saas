import { NextRequest, NextResponse } from 'next/server';
import { calcularProyeccion } from '@finanzas-saas/projection-engine';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { mapearMovimiento, mapearReglaRecurrente } from '../../../lib/mappers-proyeccion';

/**
 * GET /api/proyeccion?espacio_id=...&hasta=YYYY-MM-DD
 *
 * hasta admite además los atajos "fin_mes" y "fin_anio" (relativos a hoy).
 * La lógica de cálculo vive en @finanzas-saas/projection-engine (paquete
 * puro, sin dependencia de Supabase) — este endpoint solo se encarga de
 * leer los datos del espacio y pasárselos.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const espacio_id = params.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const hoy = new Date().toISOString().slice(0, 10);
    const fechaObjetivo = resolverFechaObjetivo(params.get('hasta'), hoy);

    const supabase = crearClienteSupabaseDeRequest(request);

    const [reglasRes, ingresosRes, gastosRes] = await Promise.all([
      supabase
        .from('reglas_recurrentes')
        .select('id, tipo, importe, periodicidad, fecha_inicio, fecha_fin, activa, categoria_id')
        .eq('espacio_id', espacio_id)
        .eq('activa', true),
      supabase
        .from('ingresos')
        .select(
          'id, categoria_id, importe_esperado, importe_real, fecha_prevista, fecha_cobrada, regla_recurrente_id'
        )
        .eq('espacio_id', espacio_id)
        .lte('fecha_prevista', fechaObjetivo),
      supabase
        .from('gastos')
        .select(
          'id, categoria_id, importe_previsto, importe_real, fecha_prevista, fecha_pagada, regla_recurrente_id'
        )
        .eq('espacio_id', espacio_id)
        .lte('fecha_prevista', fechaObjetivo),
    ]);

    for (const res of [reglasRes, ingresosRes, gastosRes]) {
      if (res.error) throw new ErrorApi(500, res.error.message);
    }

    const reglasRecurrentes = (reglasRes.data ?? []).map(mapearReglaRecurrente);
    const movimientosReales = [
      ...(ingresosRes.data ?? []).map((f) => mapearMovimiento(f, 'ingreso')),
      ...(gastosRes.data ?? []).map((f) => mapearMovimiento(f, 'gasto')),
    ];

    const resultado = calcularProyeccion({
      fechaCorte: hoy,
      fechaObjetivo,
      reglasRecurrentes,
      movimientosReales,
    });

    return NextResponse.json({ data: resultado });
  } catch (err) {
    return manejarError(err);
  }
}

function resolverFechaObjetivo(valor: string | null, hoy: string): string {
  const fecha = new Date(hoy + 'T00:00:00Z');
  if (valor === 'fin_mes' || !valor) {
    fecha.setUTCMonth(fecha.getUTCMonth() + 1, 0); // último día del mes actual
    return fecha.toISOString().slice(0, 10);
  }
  if (valor === 'fin_anio') {
    return `${fecha.getUTCFullYear()}-12-31`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new ErrorApi(400, 'hasta debe ser "fin_mes", "fin_anio" o una fecha YYYY-MM-DD');
  }
  return valor;
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/proyeccion:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
