export interface MovimientoParaInforme {
  categoria_id: string | null;
  importe_esperado?: number;
  importe_previsto?: number;
  importe_real: number | null;
  fecha_prevista: string; // YYYY-MM-DD
}

export interface CategoriaParaInforme {
  id: string;
  nombre: string;
}

export const CATEGORIA_SIN_ASIGNAR = 'sin-categoria';

/** Importe efectivo de un movimiento: el real si ya está confirmado, si no la previsión. */
export function importeDe(m: MovimientoParaInforme): number {
  return m.importe_real ?? m.importe_esperado ?? m.importe_previsto ?? 0;
}

export function sumaTotal(movimientos: MovimientoParaInforme[]): number {
  return movimientos.reduce((acc, m) => acc + importeDe(m), 0);
}

/**
 * Genera la lista de meses ('YYYY-MM') entre dos fechas ISO, ambos
 * inclusive. Si no hay movimientos (sin desde/hasta que ofrecer), el
 * llamador debe derivar desde/hasta de los propios datos antes de llamar
 * a esta función — aquí no se asume ningún rango por defecto.
 */
export function generarRangoMeses(desdeIso: string, hastaIso: string): string[] {
  const meses: string[] = [];
  let cursor = desdeIso.slice(0, 7);
  const limite = hastaIso.slice(0, 7);

  // Límite defensivo (100 años) para no colgar la pestaña si algún dato
  // trae una fecha corrupta y desdeIso/hastaIso terminan invertidos.
  let salvaguarda = 0;
  while (cursor <= limite && salvaguarda < 1200) {
    meses.push(cursor);
    const [anio, mes] = cursor.split('-').map(Number);
    const siguiente = mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, '0')}`;
    cursor = siguiente;
    salvaguarda++;
  }

  return meses;
}

/** Deriva el rango de meses directamente a partir de las fechas presentes en los movimientos. */
export function rangoMesesDesdeMovimientos(movimientos: MovimientoParaInforme[]): string[] {
  if (movimientos.length === 0) return [];
  const fechas = movimientos.map((m) => m.fecha_prevista).sort();
  return generarRangoMeses(fechas[0], fechas[fechas.length - 1]);
}

export interface FilaInformeCategoria {
  categoriaId: string;
  categoriaNombre: string;
  total: number;
  porMes: Record<string, number>;
}

/**
 * Agrupa movimientos por categoría y, dentro de cada una, por mes —
 * la estructura que necesita un informe con desglose expandible
 * (categoría -> detalle mes a mes). Las filas se devuelven ordenadas
 * de mayor a menor total, con "Sin categoría" siempre al final si
 * tiene movimientos (para no destacar visualmente lo no clasificado).
 */
export function agruparPorCategoriaYMes(
  movimientos: MovimientoParaInforme[],
  categorias: CategoriaParaInforme[],
  meses: string[]
): FilaInformeCategoria[] {
  const filasPorCategoria = new Map<string, FilaInformeCategoria>();

  for (const m of movimientos) {
    const categoriaId = m.categoria_id ?? CATEGORIA_SIN_ASIGNAR;
    const mes = m.fecha_prevista.slice(0, 7);
    const importe = importeDe(m);

    let fila = filasPorCategoria.get(categoriaId);
    if (!fila) {
      const nombre =
        categoriaId === CATEGORIA_SIN_ASIGNAR
          ? 'Sin categoría'
          : (categorias.find((c) => c.id === categoriaId)?.nombre ?? 'Categoría eliminada');
      fila = {
        categoriaId,
        categoriaNombre: nombre,
        total: 0,
        porMes: Object.fromEntries(meses.map((mm) => [mm, 0])),
      };
      filasPorCategoria.set(categoriaId, fila);
    }

    fila.total += importe;
    fila.porMes[mes] = (fila.porMes[mes] ?? 0) + importe;
  }

  const filas = [...filasPorCategoria.values()];
  filas.sort((a, b) => {
    if (a.categoriaId === CATEGORIA_SIN_ASIGNAR) return 1;
    if (b.categoriaId === CATEGORIA_SIN_ASIGNAR) return -1;
    return b.total - a.total;
  });
  return filas;
}

export interface FilaInformeMensual {
  mes: string;
  ingresos: number;
  gastos: number;
  saldo: number;
}

export function agruparIngresosYGastosPorMes(
  ingresos: MovimientoParaInforme[],
  gastos: MovimientoParaInforme[],
  meses: string[]
): FilaInformeMensual[] {
  return meses.map((mes) => {
    const totalIngresos = sumaTotal(ingresos.filter((i) => i.fecha_prevista.slice(0, 7) === mes));
    const totalGastos = sumaTotal(gastos.filter((g) => g.fecha_prevista.slice(0, 7) === mes));
    return { mes, ingresos: totalIngresos, gastos: totalGastos, saldo: totalIngresos - totalGastos };
  });
}
