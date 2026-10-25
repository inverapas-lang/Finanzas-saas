export interface MovimientoParaVistaAnual {
  id: string;
  categoria_id: string | null;
  importe_esperado?: number; // ingresos
  importe_previsto?: number; // gastos
  importe_real: number | null;
  fecha_prevista: string; // YYYY-MM-DD
}

export interface CategoriaParaVistaAnual {
  id: string;
  nombre: string;
}

export const CATEGORIA_SIN_ASIGNAR_ANUAL = 'sin-categoria';

function importeDe(m: MovimientoParaVistaAnual): number {
  return m.importe_real ?? m.importe_esperado ?? m.importe_previsto ?? 0;
}

export interface CeldaVistaAnual {
  valor: number;
  /** El id del único movimiento de esa categoría/mes, o null si hay 0 o más de 1 (celda no editable en línea en ese caso). */
  movimientoId: string | null;
  cantidadMovimientos: number;
}

export interface FilaVistaAnualCategoria {
  categoriaId: string;
  categoriaNombre: string;
  total: number;
  porMes: Record<string, CeldaVistaAnual>;
}

/** Los 12 meses ('YYYY-MM') de un año dado, enero primero. */
export function mesesDelAnio(anio: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * Agrupa movimientos por categoría y mes para la vista en rejilla
 * (concepto en filas, meses en columnas, editable celda a celda). A
 * diferencia de agregaciones-informes.ts (que solo necesita el importe
 * agregado para mostrarlo), aquí hace falta saber además CUÁNTOS
 * movimientos componen cada celda y, si es solo uno, su id — para poder
 * editarlo en línea sin ambigüedad. Si hay más de un movimiento en la
 * misma categoría y mes, la celda muestra la suma pero no es editable
 * directamente (editarla a mano sería indeterminado: ¿cuál de los
 * varios movimientos se debería cambiar?).
 *
 * Se incluyen TODAS las categorías recibidas como fila, aunque no
 * tengan ningún movimiento todavía, para poder rellenarlas desde la
 * rejilla — por eso el resultado no se ordena por total (al contrario
 * que agruparPorCategoriaYMes), sino que respeta el orden de entrada
 * de `categorias`.
 */
export function agruparParaVistaAnual(
  movimientos: MovimientoParaVistaAnual[],
  categorias: CategoriaParaVistaAnual[],
  meses: string[]
): FilaVistaAnualCategoria[] {
  const celdaVacia = (): CeldaVistaAnual => ({ valor: 0, movimientoId: null, cantidadMovimientos: 0 });

  const filasPorCategoria = new Map<string, FilaVistaAnualCategoria>();
  for (const categoria of categorias) {
    filasPorCategoria.set(categoria.id, {
      categoriaId: categoria.id,
      categoriaNombre: categoria.nombre,
      total: 0,
      porMes: Object.fromEntries(meses.map((m) => [m, celdaVacia()])),
    });
  }

  for (const m of movimientos) {
    const categoriaId = m.categoria_id ?? CATEGORIA_SIN_ASIGNAR_ANUAL;
    const mes = m.fecha_prevista.slice(0, 7);
    if (!meses.includes(mes)) continue;

    let fila = filasPorCategoria.get(categoriaId);
    if (!fila) {
      fila = {
        categoriaId,
        categoriaNombre: 'Sin categoría',
        total: 0,
        porMes: Object.fromEntries(meses.map((mm) => [mm, celdaVacia()])),
      };
      filasPorCategoria.set(categoriaId, fila);
    }

    const importe = importeDe(m);
    const celda = fila.porMes[mes];
    celda.valor += importe;
    celda.cantidadMovimientos += 1;
    celda.movimientoId = celda.cantidadMovimientos === 1 ? m.id : null;
    fila.total += importe;
  }

  return [...filasPorCategoria.values()];
}
