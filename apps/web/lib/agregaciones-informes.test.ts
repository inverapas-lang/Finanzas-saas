import { describe, expect, it } from 'vitest';
import {
  CATEGORIA_SIN_ASIGNAR,
  agruparIngresosYGastosPorMes,
  agruparPorCategoriaYMes,
  generarRangoMeses,
  importeDe,
  rangoMesesDesdeMovimientos,
  sumaTotal,
  type MovimientoParaInforme,
} from './agregaciones-informes';

function mov(overrides: Partial<MovimientoParaInforme>): MovimientoParaInforme {
  return {
    categoria_id: null,
    importe_esperado: 100,
    importe_real: null,
    fecha_prevista: '2026-01-15',
    ...overrides,
  };
}

describe('importeDe', () => {
  it('usa importe_real si existe, aunque haya también importe_esperado/previsto', () => {
    expect(importeDe(mov({ importe_esperado: 100, importe_real: 80 }))).toBe(80);
  });
  it('usa importe_esperado si no hay importe_real', () => {
    expect(importeDe(mov({ importe_esperado: 100, importe_real: null }))).toBe(100);
  });
  it('usa importe_previsto si no hay esperado ni real (caso gasto)', () => {
    expect(importeDe({ categoria_id: null, importe_previsto: 50, importe_real: null, fecha_prevista: '2026-01-01' })).toBe(50);
  });
});

describe('sumaTotal', () => {
  it('suma el importe efectivo de todos los movimientos', () => {
    const total = sumaTotal([mov({ importe_esperado: 100 }), mov({ importe_real: 50, importe_esperado: 999 })]);
    expect(total).toBe(150);
  });
  it('devuelve 0 con una lista vacía', () => {
    expect(sumaTotal([])).toBe(0);
  });
});

describe('generarRangoMeses', () => {
  it('genera el rango completo entre dos fechas del mismo año', () => {
    expect(generarRangoMeses('2026-01-05', '2026-04-20')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
  });
  it('cruza el fin de año correctamente', () => {
    expect(generarRangoMeses('2025-11-01', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('con desde y hasta en el mismo mes, devuelve solo ese mes', () => {
    expect(generarRangoMeses('2026-06-01', '2026-06-28')).toEqual(['2026-06']);
  });
});

describe('rangoMesesDesdeMovimientos', () => {
  it('devuelve un array vacío si no hay movimientos', () => {
    expect(rangoMesesDesdeMovimientos([])).toEqual([]);
  });
  it('deriva el rango del más antiguo al más reciente, sin importar el orden de entrada', () => {
    const meses = rangoMesesDesdeMovimientos([
      mov({ fecha_prevista: '2026-03-01' }),
      mov({ fecha_prevista: '2026-01-01' }),
      mov({ fecha_prevista: '2026-02-15' }),
    ]);
    expect(meses).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

describe('agruparPorCategoriaYMes', () => {
  const categorias = [
    { id: 'cat-nomina', nombre: 'Nómina' },
    { id: 'cat-dividendos', nombre: 'Dividendos' },
  ];
  const meses = ['2026-01', '2026-02'];

  it('agrupa por categoría y reparte el importe en el mes correcto', () => {
    const filas = agruparPorCategoriaYMes(
      [
        mov({ categoria_id: 'cat-nomina', importe_esperado: 1500, fecha_prevista: '2026-01-31' }),
        mov({ categoria_id: 'cat-nomina', importe_esperado: 1500, fecha_prevista: '2026-02-28' }),
      ],
      categorias,
      meses
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      categoriaId: 'cat-nomina',
      categoriaNombre: 'Nómina',
      total: 3000,
      porMes: { '2026-01': 1500, '2026-02': 1500 },
    });
  });

  it('rellena con 0 los meses del rango sin movimientos de esa categoría', () => {
    const [fila] = agruparPorCategoriaYMes(
      [mov({ categoria_id: 'cat-nomina', importe_esperado: 1500, fecha_prevista: '2026-01-31' })],
      categorias,
      meses
    );
    expect(fila.porMes['2026-02']).toBe(0);
  });

  it('agrupa los movimientos sin categoria_id bajo "Sin categoría" y la deja siempre al final', () => {
    const filas = agruparPorCategoriaYMes(
      [
        mov({ categoria_id: null, importe_esperado: 9999, fecha_prevista: '2026-01-01' }),
        mov({ categoria_id: 'cat-nomina', importe_esperado: 10, fecha_prevista: '2026-01-01' }),
      ],
      categorias,
      meses
    );
    expect(filas[filas.length - 1].categoriaId).toBe(CATEGORIA_SIN_ASIGNAR);
    expect(filas[filas.length - 1].total).toBe(9999);
  });

  it('ordena las categorías de mayor a menor total', () => {
    const filas = agruparPorCategoriaYMes(
      [
        mov({ categoria_id: 'cat-nomina', importe_esperado: 100, fecha_prevista: '2026-01-01' }),
        mov({ categoria_id: 'cat-dividendos', importe_esperado: 500, fecha_prevista: '2026-01-01' }),
      ],
      categorias,
      meses
    );
    expect(filas.map((f) => f.categoriaId)).toEqual(['cat-dividendos', 'cat-nomina']);
  });

  it('etiqueta como "Categoría eliminada" un categoria_id que ya no existe en la lista de categorías', () => {
    const [fila] = agruparPorCategoriaYMes(
      [mov({ categoria_id: 'cat-borrada', importe_esperado: 100, fecha_prevista: '2026-01-01' })],
      categorias,
      meses
    );
    expect(fila.categoriaNombre).toBe('Categoría eliminada');
  });
});

describe('agruparIngresosYGastosPorMes', () => {
  it('calcula ingresos, gastos y saldo por mes', () => {
    const filas = agruparIngresosYGastosPorMes(
      [mov({ importe_esperado: 2000, fecha_prevista: '2026-01-01' })],
      [{ categoria_id: null, importe_previsto: 500, importe_real: null, fecha_prevista: '2026-01-01' }],
      ['2026-01', '2026-02']
    );
    expect(filas[0]).toEqual({ mes: '2026-01', ingresos: 2000, gastos: 500, saldo: 1500 });
    expect(filas[1]).toEqual({ mes: '2026-02', ingresos: 0, gastos: 0, saldo: 0 });
  });
});
