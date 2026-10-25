import { describe, expect, it } from 'vitest';
import { agruparParaVistaAnual, mesesDelAnio } from './agregaciones-vista-anual';

const CATEGORIAS = [
  { id: 'cat-1', nombre: 'Nómina' },
  { id: 'cat-2', nombre: 'Dividendos' },
];

describe('mesesDelAnio', () => {
  it('genera los 12 meses del año en orden', () => {
    expect(mesesDelAnio(2026)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    ]);
  });
});

describe('agruparParaVistaAnual', () => {
  const meses = mesesDelAnio(2026);

  it('incluye todas las categorías como fila aunque no tengan movimientos', () => {
    const filas = agruparParaVistaAnual([], CATEGORIAS, meses);
    expect(filas).toHaveLength(2);
    expect(filas[0].total).toBe(0);
    expect(filas[0].porMes['2026-01']).toEqual({ valor: 0, movimientoId: null, cantidadMovimientos: 0 });
  });

  it('una celda con un único movimiento es editable (trae su id)', () => {
    const filas = agruparParaVistaAnual(
      [{ id: 'mov-1', categoria_id: 'cat-1', importe_real: 1500, fecha_prevista: '2026-01-15' }],
      CATEGORIAS,
      meses
    );
    const fila = filas.find((f) => f.categoriaId === 'cat-1')!;
    expect(fila.porMes['2026-01']).toEqual({ valor: 1500, movimientoId: 'mov-1', cantidadMovimientos: 1 });
    expect(fila.total).toBe(1500);
  });

  it('una celda con varios movimientos no es editable en línea (movimientoId null) pero suma el total', () => {
    const filas = agruparParaVistaAnual(
      [
        { id: 'mov-1', categoria_id: 'cat-1', importe_real: 100, fecha_prevista: '2026-03-01' },
        { id: 'mov-2', categoria_id: 'cat-1', importe_real: 50, fecha_prevista: '2026-03-20' },
      ],
      CATEGORIAS,
      meses
    );
    const fila = filas.find((f) => f.categoriaId === 'cat-1')!;
    expect(fila.porMes['2026-03']).toEqual({ valor: 150, movimientoId: null, cantidadMovimientos: 2 });
  });

  it('usa importe_esperado/previsto si no hay importe_real todavía', () => {
    const filas = agruparParaVistaAnual(
      [{ id: 'mov-1', categoria_id: 'cat-1', importe_esperado: 200, importe_real: null, fecha_prevista: '2026-05-01' }],
      CATEGORIAS,
      meses
    );
    expect(filas.find((f) => f.categoriaId === 'cat-1')!.porMes['2026-05'].valor).toBe(200);
  });

  it('agrupa los movimientos sin categoría en su propia fila', () => {
    const filas = agruparParaVistaAnual(
      [{ id: 'mov-1', categoria_id: null, importe_real: 300, fecha_prevista: '2026-02-01' }],
      CATEGORIAS,
      meses
    );
    const sinCategoria = filas.find((f) => f.categoriaNombre === 'Sin categoría');
    expect(sinCategoria?.porMes['2026-02'].valor).toBe(300);
  });

  it('ignora movimientos fuera del rango de meses pedido', () => {
    const filas = agruparParaVistaAnual(
      [{ id: 'mov-1', categoria_id: 'cat-1', importe_real: 999, fecha_prevista: '2025-12-01' }],
      CATEGORIAS,
      meses
    );
    expect(filas.find((f) => f.categoriaId === 'cat-1')!.total).toBe(0);
  });
});
