import { NextRequest, NextResponse } from 'next/server';
import { crearClienteSupabaseDeRequest, ErrorApi } from '../../../lib/supabase-server';
import { generarCSV, generarXLSX, generarPDF, type RegistroExportable } from '../../../lib/exportar';

const FORMATOS_VALIDOS = ['csv', 'xlsx', 'pdf'];
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/exportar?espacio_id=...&formato=csv|xlsx&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * desde/hasta son opcionales — sin ellos, exporta todo el histórico.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const espacio_id = params.get('espacio_id');
    const formato = params.get('formato') ?? 'csv';
    const desde = params.get('desde');
    const hasta = params.get('hasta');

    if (!espacio_id) throw new ErrorApi(400, 'El parámetro espacio_id es obligatorio');
    if (!FORMATOS_VALIDOS.includes(formato)) {
      throw new ErrorApi(400, `formato debe ser uno de: ${FORMATOS_VALIDOS.join(', ')}`);
    }
    if (desde && !FECHA_REGEX.test(desde)) throw new ErrorApi(400, 'desde debe tener formato YYYY-MM-DD');
    if (hasta && !FECHA_REGEX.test(hasta)) throw new ErrorApi(400, 'hasta debe tener formato YYYY-MM-DD');

    const supabase = crearClienteSupabaseDeRequest(request);

    let queryIngresos = supabase
      .from('ingresos')
      .select(
        'descripcion, importe_esperado, importe_real, fecha_prevista, fecha_cobrada, categorias(nombre), cuentas_bancarias(nombre)'
      )
      .eq('espacio_id', espacio_id);
    let queryGastos = supabase
      .from('gastos')
      .select(
        'descripcion, importe_previsto, importe_real, fecha_prevista, fecha_pagada, categorias!gastos_categoria_id_fkey(nombre), cuentas_bancarias(nombre)'
      )
      .eq('espacio_id', espacio_id);

    if (desde) {
      queryIngresos = queryIngresos.gte('fecha_prevista', desde);
      queryGastos = queryGastos.gte('fecha_prevista', desde);
    }
    if (hasta) {
      queryIngresos = queryIngresos.lte('fecha_prevista', hasta);
      queryGastos = queryGastos.lte('fecha_prevista', hasta);
    }

    const [resIngresos, resGastos] = await Promise.all([queryIngresos, queryGastos]);
    if (resIngresos.error) throw new ErrorApi(500, resIngresos.error.message);
    if (resGastos.error) throw new ErrorApi(500, resGastos.error.message);

    type FilaConRelaciones = {
      descripcion: string;
      importe_esperado?: number;
      importe_previsto?: number;
      importe_real: number | null;
      fecha_prevista: string;
      fecha_cobrada?: string | null;
      fecha_pagada?: string | null;
      categorias: { nombre: string } | null;
      cuentas_bancarias: { nombre: string } | null;
    };

    const normalizar = (fila: FilaConRelaciones, tipo: 'Ingreso' | 'Gasto'): RegistroExportable => ({
      tipo,
      descripcion: fila.descripcion,
      categoria: fila.categorias?.nombre ?? '',
      cuenta: fila.cuentas_bancarias?.nombre ?? '',
      fechaPrevista: fila.fecha_prevista,
      fechaConfirmada: (tipo === 'Ingreso' ? fila.fecha_cobrada : fila.fecha_pagada) ?? '',
      importe: tipo === 'Ingreso' ? (fila.importe_esperado ?? 0) : (fila.importe_previsto ?? 0),
      importeReal: fila.importe_real,
    });

    const filas: RegistroExportable[] = [
      ...(resIngresos.data ?? []).map((f) => normalizar(f as unknown as FilaConRelaciones, 'Ingreso')),
      ...(resGastos.data ?? []).map((f) => normalizar(f as unknown as FilaConRelaciones, 'Gasto')),
    ].sort((a, b) => (a.fechaPrevista < b.fechaPrevista ? -1 : 1));

    const fechaHoy = new Date().toISOString().slice(0, 10);

    if (formato === 'csv') {
      const csv = generarCSV(filas);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="movimientos-${fechaHoy}.csv"`,
        },
      });
    }

    if (formato === 'xlsx') {
      const buffer = generarXLSX(filas);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="movimientos-${fechaHoy}.xlsx"`,
        },
      });
    }

    const pdf = await generarPDF(filas);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="movimientos-${fechaHoy}.pdf"`,
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
  console.error('Error inesperado en /api/exportar:', err);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
