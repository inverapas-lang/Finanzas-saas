import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../../../lib/supabase-server';
import { obtenerTransacciones, ErrorGoCardless } from '../../../../../../lib/gocardless';
import { mapearTransaccionesNuevas } from '../../../../../../lib/sincronizar-banco';

interface Contexto {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/bancos/conexiones/[id]/sincronizar
 *
 * Trae las transacciones de cada cuenta vinculada a esta conexión,
 * descarta las que ya se importaron (tabla transacciones_externas) y
 * crea un ingreso o gasto YA CONFIRMADO por cada una nueva (mismo
 * criterio que "confirmados" en /api/movimientos/carga-masiva: es
 * dinero que el banco ya registró como movido, no una previsión).
 * Categoría queda sin asignar — el usuario la pone después, igual que
 * al importar un Excel.
 */
export async function POST(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const { data: conexion, error: errorConexion } = await supabase
      .from('conexiones_bancarias')
      .select('id, estado')
      .eq('id', id)
      .maybeSingle();
    if (errorConexion) throw new ErrorApi(500, errorConexion.message);
    if (!conexion) throw new ErrorApi(404, 'Conexión bancaria no encontrada o sin acceso');
    if (conexion.estado !== 'vinculada') {
      throw new ErrorApi(409, `Esta conexión no está vinculada (estado: ${conexion.estado})`);
    }

    const { data: cuentas, error: errorCuentas } = await supabase
      .from('cuentas_bancarias')
      .select('id, cuenta_externa_id, moneda, espacio_id')
      .eq('conexion_bancaria_id', id);
    if (errorCuentas) throw new ErrorApi(500, errorCuentas.message);
    if (!cuentas || cuentas.length === 0) {
      throw new ErrorApi(409, 'Esta conexión no tiene ninguna cuenta vinculada todavía');
    }

    let totalCreados = 0;
    const resumenPorCuenta: { cuentaId: string; creados: number }[] = [];

    for (const cuenta of cuentas) {
      if (!cuenta.cuenta_externa_id) continue;

      const transacciones = await obtenerTransacciones(cuenta.cuenta_externa_id);

      const { data: yaImportadas, error: errorYaImportadas } = await supabase
        .from('transacciones_externas')
        .select('transaccion_externa_id')
        .eq('cuenta_bancaria_id', cuenta.id);
      if (errorYaImportadas) throw new ErrorApi(500, errorYaImportadas.message);

      const conjuntoYaImportadas = new Set((yaImportadas ?? []).map((t) => t.transaccion_externa_id));
      const nuevas = mapearTransaccionesNuevas(transacciones, conjuntoYaImportadas);

      let creadosEnCuenta = 0;
      for (const mov of nuevas) {
        const tabla = mov.tipo === 'ingreso' ? 'ingresos' : 'gastos';
        const campoFecha = mov.tipo === 'ingreso' ? 'fecha_cobrada' : 'fecha_pagada';
        const campoImporte = mov.tipo === 'ingreso' ? 'importe_esperado' : 'importe_previsto';

        const { data: movimientoCreado, error: errorInsercion } = await supabase
          .from(tabla)
          .insert({
            espacio_id: cuenta.espacio_id,
            cuenta_id: cuenta.id,
            descripcion: mov.descripcion,
            [campoImporte]: mov.importe,
            importe_real: mov.importe,
            fecha_prevista: mov.fecha,
            [campoFecha]: mov.fecha,
            moneda: cuenta.moneda,
            created_by: user.id,
          })
          .select('id')
          .single();

        if (errorInsercion) {
          console.error(`Error creando ${tabla} desde sincronización bancaria:`, errorInsercion);
          continue; // seguimos con el resto de transacciones en vez de abortar toda la sincronización
        }

        const { error: errorTraza } = await supabase.from('transacciones_externas').insert({
          cuenta_bancaria_id: cuenta.id,
          transaccion_externa_id: mov.transaccionExternaId,
          [mov.tipo === 'ingreso' ? 'ingreso_id' : 'gasto_id']: movimientoCreado.id,
          importe: mov.importe,
          fecha: mov.fecha,
          descripcion: mov.descripcion,
        });
        if (errorTraza) {
          console.error('Error registrando transacción externa (posible duplicado en próxima sync):', errorTraza);
        }

        creadosEnCuenta++;
      }

      await supabase.from('cuentas_bancarias').update({ ultima_sincronizacion: new Date().toISOString() }).eq('id', cuenta.id);

      totalCreados += creadosEnCuenta;
      resumenPorCuenta.push({ cuentaId: cuenta.id, creados: creadosEnCuenta });
    }

    return NextResponse.json({ data: { totalCreados, resumenPorCuenta } });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ErrorGoCardless) {
    return NextResponse.json({ error: `Error consultando GoCardless: ${err.message}` }, { status: 502 });
  }
  console.error('Error inesperado en /api/bancos/conexiones/[id]/sincronizar:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
