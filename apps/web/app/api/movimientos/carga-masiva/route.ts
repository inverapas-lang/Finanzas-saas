import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../../lib/supabase-server';
import { validarPayloadMovimiento, type TipoMovimientoApi } from '../../../../lib/validacion-movimientos';

const MAX_FILAS = 120; // de sobra para 10 años de una serie mensual

interface FilaEntrada {
  descripcion: string;
  fecha_prevista: string;
  importe: number;
}

/**
 * POST /api/movimientos/carga-masiva
 *
 * Crea de golpe varios ingresos o gastos que comparten categoría/cuenta —
 * pensado para series periódicas (nóminas mes a mes, dividendos estimados
 * del año que viene, etc.) sin tener que exportar/editar/importar un Excel
 * ni rellenar el formulario fila a fila.
 *
 * Body:
 * {
 *   tipo: 'ingreso' | 'gasto',
 *   espacio_id: string,
 *   categoria_id?: string | null,
 *   cuenta_id?: string | null,
 *   moneda?: string,
 *   confirmados: boolean, // true = ya cobrado/pagado (rellena importe_real y fecha_cobrada/pagada)
 *   filas: { descripcion: string, fecha_prevista: string, importe: number }[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body !== 'object' || body === null) {
      throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
    }
    const b = body as Record<string, unknown>;

    const tipo = b.tipo;
    if (tipo !== 'ingreso' && tipo !== 'gasto') {
      throw new ErrorApi(400, 'tipo debe ser "ingreso" o "gasto"');
    }

    if (!Array.isArray(b.filas) || b.filas.length === 0) {
      throw new ErrorApi(400, 'filas debe ser un array con al menos un elemento');
    }
    if (b.filas.length > MAX_FILAS) {
      throw new ErrorApi(400, `No se pueden crear más de ${MAX_FILAS} movimientos de golpe`);
    }

    const confirmados = b.confirmados === true;
    const campoImporte = tipo === 'ingreso' ? 'importe_esperado' : 'importe_previsto';
    const campoFechaConfirmacion = tipo === 'ingreso' ? 'fecha_cobrada' : 'fecha_pagada';

    const payloads = (b.filas as unknown[]).map((filaRaw, indice) => {
      if (typeof filaRaw !== 'object' || filaRaw === null) {
        throw new ErrorApi(400, `La fila ${indice + 1} debe ser un objeto`);
      }
      const fila = filaRaw as Record<string, unknown>;

      const cuerpoFila: Record<string, unknown> = {
        espacio_id: b.espacio_id,
        categoria_id: b.categoria_id ?? null,
        cuenta_id: b.cuenta_id ?? null,
        moneda: b.moneda ?? 'EUR',
        descripcion: fila.descripcion,
        fecha_prevista: fila.fecha_prevista,
        [campoImporte]: fila.importe,
      };
      if (confirmados) {
        cuerpoFila.importe_real = fila.importe;
        cuerpoFila[campoFechaConfirmacion] = fila.fecha_prevista;
      }

      try {
        return validarPayloadMovimiento(cuerpoFila, tipo as TipoMovimientoApi);
      } catch (err) {
        if (err instanceof ErrorApi) {
          throw new ErrorApi(400, `Fila ${indice + 1}: ${err.message}`);
        }
        throw err;
      }
    });

    const supabase = crearClienteSupabaseDeRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ErrorApi(401, 'No autenticado');

    const tabla = tipo === 'ingreso' ? 'ingresos' : 'gastos';
    const { data, error } = await supabase
      .from(tabla)
      .insert(payloads.map((p) => ({ ...p, created_by: user.id })))
      .select();

    if (error) {
      if (error.code === '42501') {
        throw new ErrorApi(403, `No tienes permiso para crear ${tabla} en este espacio`);
      }
      throw new ErrorApi(400, error.message);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return manejarError(err);
  }
}

function manejarError(err: unknown) {
  if (err instanceof ErrorApi) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('Error inesperado en /api/movimientos/carga-masiva:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
