import { describe, expect, it } from 'vitest';
import { agruparPatrimonioItem, mesesDistintos } from './agregaciones-patrimonio-item';

const MESES = ['2026-01', '2026-02', '2026-03'];

describe('agruparPatrimonioItem', () => {
  it('agrupa por bloque (en el orden fijo) y por concepto dentro de cada bloque', () => {
    const resultado = agruparPatrimonioItem(
      [
        { id: 'i1', bloque: 'cuenta', concepto: 'Cta Santander', mes: '2026-01-01', valor: 1000 },
        { id: 'i2', bloque: 'deuda', concepto: 'Nissan', mes: '2026-01-01', valor: 8000 },
      ],
      MESES
    );
    expect(resultado.bloques.map((b) => b.bloque)).toEqual([
      'cuenta',
      'inversion_liquida',
      'inversion_intocable',
      'inversion_iliquida',
      'deuda',
    ]);
    const cuentas = resultado.bloques.find((b) => b.bloque === 'cuenta')!;
    expect(cuentas.conceptos).toHaveLength(1);
    expect(cuentas.conceptos[0].concepto).toBe('Cta Santander');
  });

  it('ordena los conceptos de cada bloque alfabéticamente', () => {
    const resultado = agruparPatrimonioItem(
      [
        { id: 'i1', bloque: 'cuenta', concepto: 'Revolut', mes: '2026-01-01', valor: 100 },
        { id: 'i2', bloque: 'cuenta', concepto: 'BBVA', mes: '2026-01-01', valor: 200 },
        { id: 'i3', bloque: 'cuenta', concepto: 'Caixabank', mes: '2026-01-01', valor: 300 },
      ],
      MESES
    );
    const cuentas = resultado.bloques.find((b) => b.bloque === 'cuenta')!;
    expect(cuentas.conceptos.map((c) => c.concepto)).toEqual(['BBVA', 'Caixabank', 'Revolut']);
  });

  it('cada celda trae el id de la fila (para decidir POST vs PATCH) y null si no hay fila ese mes', () => {
    const resultado = agruparPatrimonioItem(
      [{ id: 'i1', bloque: 'cuenta', concepto: 'Cta Santander', mes: '2026-01-01', valor: 1000 }],
      MESES
    );
    const fila = resultado.bloques.find((b) => b.bloque === 'cuenta')!.conceptos[0];
    expect(fila.porMes['2026-01']).toEqual({ valor: 1000, id: 'i1' });
    expect(fila.porMes['2026-02']).toEqual({ valor: 0, id: null });
    expect(fila.porMes['2026-03']).toEqual({ valor: 0, id: null });
  });

  it('un concepto sigue apareciendo aunque no tenga valor en el rango de meses visible', () => {
    const resultado = agruparPatrimonioItem(
      [{ id: 'i1', bloque: 'cuenta', concepto: 'Cta Santander', mes: '2025-06-01', valor: 1000 }],
      MESES
    );
    const cuentas = resultado.bloques.find((b) => b.bloque === 'cuenta')!;
    expect(cuentas.conceptos).toHaveLength(1);
    expect(cuentas.conceptos[0].porMes['2026-01']).toEqual({ valor: 0, id: null });
  });

  it('acepta mes en formato YYYY-MM-DD o ya YYYY-MM', () => {
    const resultado = agruparPatrimonioItem(
      [{ id: 'i1', bloque: 'cuenta', concepto: 'Cta Santander', mes: '2026-02', valor: 500 }],
      MESES
    );
    const cuentas = resultado.bloques.find((b) => b.bloque === 'cuenta')!;
    expect(cuentas.conceptos[0].porMes['2026-02'].valor).toBe(500);
  });

  it('calcula el total por bloque y por mes sumando sus conceptos', () => {
    const resultado = agruparPatrimonioItem(
      [
        { id: 'i1', bloque: 'cuenta', concepto: 'Cta Santander', mes: '2026-01-01', valor: 1000 },
        { id: 'i2', bloque: 'cuenta', concepto: 'Revolut', mes: '2026-01-01', valor: 500 },
      ],
      MESES
    );
    const cuentas = resultado.bloques.find((b) => b.bloque === 'cuenta')!;
    expect(cuentas.totalPorMes['2026-01']).toBe(1500);
    expect(cuentas.totalPorMes['2026-02']).toBe(0);
  });

  it('calcula el patrimonio neto por mes con la misma fórmula que la página de totales (excluye inversión ilíquida y resta deuda)', () => {
    const resultado = agruparPatrimonioItem(
      [
        { id: 'i1', bloque: 'cuenta', concepto: 'Cta Santander', mes: '2026-01-01', valor: 10000 },
        { id: 'i2', bloque: 'inversion_liquida', concepto: 'Indexa', mes: '2026-01-01', valor: 5000 },
        { id: 'i3', bloque: 'inversion_intocable', concepto: 'Fondo pensiones', mes: '2026-01-01', valor: 2000 },
        { id: 'i4', bloque: 'inversion_iliquida', concepto: 'Piso', mes: '2026-01-01', valor: 200000 },
        { id: 'i5', bloque: 'deuda', concepto: 'Nissan', mes: '2026-01-01', valor: 8000 },
      ],
      MESES
    );
    // 10000 + 5000 + 2000 - 8000 = 9000 (el piso, ilíquido, no entra)
    expect(resultado.patrimonioNetoPorMes['2026-01']).toBe(9000);
    expect(resultado.patrimonioNetoPorMes['2026-02']).toBe(0);
  });

  it('devuelve todos los bloques (aunque estén vacíos) con un array de conceptos vacío', () => {
    const resultado = agruparPatrimonioItem([], MESES);
    expect(resultado.bloques).toHaveLength(5);
    for (const b of resultado.bloques) {
      expect(b.conceptos).toEqual([]);
      expect(b.totalPorMes['2026-01']).toBe(0);
    }
    expect(resultado.patrimonioNetoPorMes['2026-01']).toBe(0);
  });

  it('ignora filas fuera del rango de meses pedido al construir los totales', () => {
    const resultado = agruparPatrimonioItem(
      [{ id: 'i1', bloque: 'cuenta', concepto: 'Cta Santander', mes: '2025-12-01', valor: 999 }],
      MESES
    );
    const cuentas = resultado.bloques.find((b) => b.bloque === 'cuenta')!;
    expect(cuentas.totalPorMes['2026-01']).toBe(0);
  });
});

describe('mesesDistintos', () => {
  it('devuelve los meses únicos ordenados cronológicamente, normalizando YYYY-MM-DD a YYYY-MM', () => {
    expect(
      mesesDistintos([
        { id: 'i1', bloque: 'cuenta', concepto: 'A', mes: '2026-03-01', valor: 1 },
        { id: 'i2', bloque: 'cuenta', concepto: 'A', mes: '2026-01-01', valor: 1 },
        { id: 'i3', bloque: 'deuda', concepto: 'B', mes: '2026-01-01', valor: 1 },
        { id: 'i4', bloque: 'cuenta', concepto: 'A', mes: '2026-02', valor: 1 },
      ])
    ).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('devuelve un array vacío si no hay filas', () => {
    expect(mesesDistintos([])).toEqual([]);
  });
});
