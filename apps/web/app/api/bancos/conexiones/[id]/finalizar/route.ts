import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../../../lib/supabase-server';
import { obtenerRequisition, obtenerDetalleCuenta, ErrorGoCardless } from '../../../../../../lib/gocardless';

interface Contexto {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/bancos/conexiones/[id]/finalizar
 *
 * Paso 2 del flujo: se llama desde /dashboard/bancos/callback cuando el
 * banco redirige de vuelta tras el consentimiento. Comprueba el estado
 * de la requisition en GoCardless; si quedó vinculada ("LN"), recorre las
 * cuentas externas devueltas y, para cada una, reutiliza la
 * cuentas_bancarias existente con el mismo IBAN en este espacio si la
 * hay, o crea una nueva — así una cuenta que el usuario ya tenía dada de
 * alta a mano no se duplica al conectar el banco.
 */
export async function POST(request: NextRequest, { params }: Contexto) {
  try {
    const { id } = await params;
    const supabase = crearClienteSupabaseDeRequest(request);

    const { data: conexion, error: errorConexion } = await supabase
      .from('conexiones_bancarias')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (errorConexion) throw new ErrorApi(500, errorConexion.message);
    if (!conexion) throw new ErrorApi(404, 'Conexión bancaria no encontrada o sin acceso');

    const requisition = await obtenerRequisition(conexion.requisition_id);

    if (requisition.status !== 'LN') {
      const estadoLegible: Record<string, string> = {
        RJ: 'el usuario rechazó el acceso',
        SA: 'la selección de cuentas quedó pendiente',
        EX: 'el enlace de autorización caducó',
        UA: 'el acceso todavía no ha sido autorizado',
      };
      await supabase
        .from('conexiones_bancarias')
        .update({
          estado: 'error',
          error_mensaje: estadoLegible[requisition.status] ?? `estado inesperado: ${requisition.status}`,
        })
        .eq('id', id);
      throw new ErrorApi(
        409,
        `La vinculación no se completó (${estadoLegible[requisition.status] ?? requisition.status}). Vuelve a intentarlo.`
      );
    }

    const { data: cuentasExistentes, error: errorCuentas } = await supabase
      .from('cuentas_bancarias')
      .select('id, iban')
      .eq('espacio_id', conexion.espacio_id);
    if (errorCuentas) throw new ErrorApi(500, errorCuentas.message);

    const cuentasVinculadas = [];
    for (const cuentaExternaId of requisition.accounts) {
      const detalle = await obtenerDetalleCuenta(cuentaExternaId);
      const existente = detalle.iban
        ? cuentasExistentes?.find((c) => c.iban === detalle.iban)
        : undefined;

      if (existente) {
        const { data: actualizada, error: errorActualizar } = await supabase
          .from('cuentas_bancarias')
          .update({
            conexion_bancaria_id: id,
            cuenta_externa_id: cuentaExternaId,
            iban: detalle.iban,
          })
          .eq('id', existente.id)
          .select()
          .single();
        if (errorActualizar) throw new ErrorApi(500, errorActualizar.message);
        cuentasVinculadas.push(actualizada);
      } else {
        const { data: nueva, error: errorCrear } = await supabase
          .from('cuentas_bancarias')
          .insert({
            espacio_id: conexion.espacio_id,
            nombre: detalle.nombre,
            tipo: 'corriente',
            moneda: detalle.moneda,
            saldo_actual: 0,
            conexion_bancaria_id: id,
            cuenta_externa_id: cuentaExternaId,
            iban: detalle.iban,
          })
          .select()
          .single();
        if (errorCrear) throw new ErrorApi(500, errorCrear.message);
        cuentasVinculadas.push(nueva);
      }
    }

    const { data: conexionFinal, error: errorFinal } = await supabase
      .from('conexiones_bancarias')
      .update({ estado: 'vinculada', error_mensaje: null })
      .eq('id', id)
      .select()
      .single();
    if (errorFinal) throw new ErrorApi(500, errorFinal.message);

    return NextResponse.json({ data: { conexion: conexionFinal, cuentas: cuentasVinculadas } });
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
  console.error('Error inesperado en /api/bancos/conexiones/[id]/finalizar:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
