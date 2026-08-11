import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { finDePeriodo } from '../../../lib/periodos';

const DIAS_VENTANA_PROXIMOS = 7;

export interface Notificacion {
  id: string;
  tipo: 'pago_proximo' | 'pago_vencido' | 'cobro_proximo' | 'cobro_vencido' | 'presupuesto_excedido';
  severidad: 'info' | 'aviso' | 'alerta';
  mensaje: string;
  fecha: string;
  entidadTipo: 'gasto' | 'ingreso' | 'presupuesto';
  entidadId: string;
}

function sumarDias(fechaIso: string, dias: number): string {
  const fecha = new Date(fechaIso + 'T00:00:00Z');
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/**
 * GET /api/notificaciones?espacio_id=...
 *
 * Calculado al vuelo en cada petición, no persistido. Ver nota de diseño
 * en el README: evita depender de un job programado que no existe todavía.
 */
export async function GET(request: NextRequest) {
  try {
    const espacio_id = request.nextUrl.searchParams.get('espacio_id');
    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');

    const supabase = crearClienteSupabaseDeRequest(request);
    const hoy = new Date().toISOString().slice(0, 10);
    const limiteProximos = sumarDias(hoy, DIAS_VENTANA_PROXIMOS);

    const [resGastos, resIngresos, resPresupuestos] = await Promise.all([
      supabase
        .from('gastos')
        .select('id, descripcion, importe_previsto, fecha_prevista, categoria_id')
        .eq('espacio_id', espacio_id)
        .is('fecha_pagada', null)
        .lte('fecha_prevista', limiteProximos),
      supabase
        .from('ingresos')
        .select('id, descripcion, importe_esperado, fecha_prevista')
        .eq('espacio_id', espacio_id)
        .is('fecha_cobrada', null)
        .lte('fecha_prevista', limiteProximos),
      supabase
        .from('presupuestos')
        .select('id, categoria_id, periodo_tipo, periodo_inicio, importe_planificado, categorias(nombre)')
        .eq('espacio_id', espacio_id)
        .lte('periodo_inicio', hoy),
    ]);

    if (resGastos.error) throw new ErrorApi(500, resGastos.error.message);
    if (resIngresos.error) throw new ErrorApi(500, resIngresos.error.message);
    if (resPresupuestos.error) throw new ErrorApi(500, resPresupuestos.error.message);

    const notificaciones: Notificacion[] = [];

    for (const g of resGastos.data ?? []) {
      const vencido = g.fecha_prevista < hoy;
      notificaciones.push({
        id: `gasto-${g.id}`,
        tipo: vencido ? 'pago_vencido' : 'pago_proximo',
        severidad: vencido ? 'alerta' : 'aviso',
        mensaje: `${vencido ? 'Pago vencido' : 'Pago próximo'}: "${g.descripcion}"`,
        fecha: g.fecha_prevista,
        entidadTipo: 'gasto',
        entidadId: g.id,
      });
    }

    for (const i of resIngresos.data ?? []) {
      const vencido = i.fecha_prevista < hoy;
      notificaciones.push({
        id: `ingreso-${i.id}`,
        tipo: vencido ? 'cobro_vencido' : 'cobro_proximo',
        severidad: vencido ? 'aviso' : 'info',
        mensaje: `${vencido ? 'Cobro pendiente desde hace días' : 'Cobro próximo'}: "${i.descripcion}"`,
        fecha: i.fecha_prevista,
        entidadTipo: 'ingreso',
        entidadId: i.id,
      });
    }

    // Presupuestos: solo los que cubren "hoy" (periodo activo ahora mismo),
    // no los históricos ya cerrados.
    const presupuestosActivos = (resPresupuestos.data ?? []).filter(
      (p) => hoy < finDePeriodo(p.periodo_inicio, p.periodo_tipo as 'mensual' | 'anual')
    );

    if (presupuestosActivos.length > 0) {
      const { data: gastosParaPresupuestos, error: errorGastosP } = await supabase
        .from('gastos')
        .select('categoria_id, importe_real, importe_previsto, fecha_prevista')
        .eq('espacio_id', espacio_id);

      if (errorGastosP) throw new ErrorApi(500, errorGastosP.message);

      for (const p of presupuestosActivos) {
        const fin = finDePeriodo(p.periodo_inicio, p.periodo_tipo as 'mensual' | 'anual');
        const gastado = (gastosParaPresupuestos ?? [])
          .filter(
            (g) =>
              g.categoria_id === p.categoria_id &&
              g.fecha_prevista >= p.periodo_inicio &&
              g.fecha_prevista < fin
          )
          .reduce((acc, g) => acc + (g.importe_real ?? g.importe_previsto), 0);

        if (gastado > p.importe_planificado) {
          const nombreCategoria =
            (p as { categorias?: { nombre?: string } }).categorias?.nombre ?? 'una categoría';
          notificaciones.push({
            id: `presupuesto-${p.id}`,
            tipo: 'presupuesto_excedido',
            severidad: 'alerta',
            mensaje: `Presupuesto de "${nombreCategoria}" superado`,
            fecha: hoy,
            entidadTipo: 'presupuesto',
            entidadId: p.id,
          });
        }
      }
    }

    notificaciones.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

    return NextResponse.json({ data: notificaciones });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/notificaciones:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
