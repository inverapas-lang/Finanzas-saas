import { BLOQUES_PATRIMONIO, type BloquePatrimonio } from './validacion-patrimonio-historico-item';

export interface PatrimonioItemFila {
  id: string;
  bloque: BloquePatrimonio;
  concepto: string;
  mes: string; // 'YYYY-MM-DD' (siempre día 1) o 'YYYY-MM'
  valor: number;
}

export interface CeldaPatrimonioItem {
  valor: number;
  /** El id de la fila patrimonio_historico_item para ese concepto/mes, o null si aún no existe (la UI decide POST vs PATCH según esto). */
  id: string | null;
}

export interface FilaConceptoPatrimonioItem {
  concepto: string;
  porMes: Record<string, CeldaPatrimonioItem>;
}

export interface BloquePatrimonioAgregado {
  bloque: BloquePatrimonio;
  conceptos: FilaConceptoPatrimonioItem[];
  /** Suma de todos los conceptos de este bloque, por mes. */
  totalPorMes: Record<string, number>;
}

export interface PatrimonioItemAgregado {
  bloques: BloquePatrimonioAgregado[];
  /**
   * Patrimonio neto por mes, con la MISMA fórmula que
   * apps/web/app/dashboard/patrimonio/page.tsx (calcularPatrimonioNeto):
   * cuenta + inversion_liquida + inversion_intocable - deuda. Las
   * inversiones ilíquidas quedan fuera del neto "de cabecera" (son solo
   * informativas) para que esta vista de detalle sea consistente con la
   * definición ya usada en la vista de totales.
   */
  patrimonioNetoPorMes: Record<string, number>;
}

/** Normaliza un mes a 'YYYY-MM', acepte 'YYYY-MM-DD' o ya 'YYYY-MM'. */
function mesCorto(mes: string): string {
  return mes.slice(0, 7);
}

/**
 * Meses distintos ('YYYY-MM') presentes en las filas, ordenados
 * cronológicamente. Sirve para decidir qué columnas tiene la rejilla
 * editable de DetallePatrimonio: a diferencia de la vista anual de
 * movimientos (que fija los 12 meses de un año concreto), aquí el
 * histórico de patrimonio puede llevar años y no tiene por qué alinearse
 * con un año de calendario, así que las columnas se derivan de los datos
 * reales en vez de un rango fijo.
 */
export function mesesDistintos(filas: PatrimonioItemFila[]): string[] {
  return [...new Set(filas.map((f) => mesCorto(f.mes)))].sort();
}

/**
 * Agrupa las filas planas de patrimonio_historico_item en una estructura
 * lista para pivotar en la rejilla bloque > concepto x mes (ver
 * components/DetallePatrimonio.tsx). A diferencia de
 * agregaciones-vista-anual.ts no hay que lidiar con "varios movimientos en
 * la misma celda": la restricción unique(espacio_id, mes, bloque, concepto)
 * de la tabla garantiza como máximo una fila por concepto y mes, así que
 * cada celda es simple de construir.
 *
 * Los conceptos de cada bloque se calculan a partir de TODAS las filas
 * recibidas (no solo las de `meses`), para que un concepto siga apareciendo
 * en la rejilla aunque no tenga valor en el rango de meses visible — así se
 * puede seguir editando. `meses` solo decide qué columnas se construyen.
 */
export function agruparPatrimonioItem(filas: PatrimonioItemFila[], meses: string[]): PatrimonioItemAgregado {
  const celdaVacia = (): CeldaPatrimonioItem => ({ valor: 0, id: null });

  const conceptosPorBloque = new Map<BloquePatrimonio, Map<string, FilaConceptoPatrimonioItem>>();
  for (const bloque of BLOQUES_PATRIMONIO) {
    conceptosPorBloque.set(bloque, new Map());
  }

  function filaDe(bloque: BloquePatrimonio, concepto: string): FilaConceptoPatrimonioItem {
    const mapaConceptos = conceptosPorBloque.get(bloque)!;
    let fila = mapaConceptos.get(concepto);
    if (!fila) {
      fila = { concepto, porMes: Object.fromEntries(meses.map((m) => [m, celdaVacia()])) };
      mapaConceptos.set(concepto, fila);
    }
    return fila;
  }

  for (const f of filas) {
    const fila = filaDe(f.bloque, f.concepto);
    const mes = mesCorto(f.mes);
    if (!meses.includes(mes)) continue;
    fila.porMes[mes] = { valor: f.valor, id: f.id };
  }

  const bloques: BloquePatrimonioAgregado[] = BLOQUES_PATRIMONIO.map((bloque) => {
    const conceptos = [...conceptosPorBloque.get(bloque)!.values()].sort((a, b) =>
      a.concepto.localeCompare(b.concepto, 'es')
    );
    const totalPorMes = Object.fromEntries(
      meses.map((mes) => [mes, conceptos.reduce((acc, c) => acc + c.porMes[mes].valor, 0)])
    );
    return { bloque, conceptos, totalPorMes };
  });

  const totalPorBloque = Object.fromEntries(bloques.map((b) => [b.bloque, b.totalPorMes])) as Record<
    BloquePatrimonio,
    Record<string, number>
  >;

  const patrimonioNetoPorMes = Object.fromEntries(
    meses.map((mes) => [
      mes,
      totalPorBloque.cuenta[mes] + totalPorBloque.inversion_liquida[mes] + totalPorBloque.inversion_intocable[mes] -
        totalPorBloque.deuda[mes],
    ])
  );

  return { bloques, patrimonioNetoPorMes };
}
