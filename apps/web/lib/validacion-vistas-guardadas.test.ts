import { describe, expect, it } from 'vitest';
import { ErrorApi } from './supabase-server';
import { validarPayloadVistaGuardada } from './validacion-vistas-guardadas';

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

describe('validarPayloadVistaGuardada', () => {
  it('acepta una vista con rango relativo', () => {
    const payload = validarPayloadVistaGuardada({
      espacio_id: ESPACIO_ID,
      nombre: 'Gastos por categoría',
      configuracion: { metrica: 'gasto_por_categoria', tipoGrafico: 'barras', rango: 'ultimos_6_meses' },
    });
    expect(payload.configuracion.rango).toBe('ultimos_6_meses');
    expect(payload.configuracion.desde).toBeUndefined();
  });

  it('exige desde/hasta cuando rango es "fijo"', () => {
    expect(() =>
      validarPayloadVistaGuardada({
        espacio_id: ESPACIO_ID,
        nombre: 'X',
        configuracion: { metrica: 'ingresos_vs_gastos', tipoGrafico: 'barras', rango: 'fijo' },
      })
    ).toThrow(ErrorApi);
  });

  it('acepta rango "fijo" con desde/hasta válidos', () => {
    const payload = validarPayloadVistaGuardada({
      espacio_id: ESPACIO_ID,
      nombre: 'X',
      configuracion: {
        metrica: 'ingresos_vs_gastos',
        tipoGrafico: 'lineas',
        rango: 'fijo',
        desde: '2025-01-01',
        hasta: '2025-12-31',
      },
    });
    expect(payload.configuracion.desde).toBe('2025-01-01');
  });

  it('rechaza una métrica desconocida', () => {
    expect(() =>
      validarPayloadVistaGuardada({
        espacio_id: ESPACIO_ID,
        nombre: 'X',
        configuracion: { metrica: 'patrimonio', tipoGrafico: 'barras', rango: 'ano_actual' },
      })
    ).toThrow(ErrorApi);
  });

  it('rechaza nombre vacío', () => {
    expect(() =>
      validarPayloadVistaGuardada({
        espacio_id: ESPACIO_ID,
        nombre: '  ',
        configuracion: { metrica: 'ingresos_vs_gastos', tipoGrafico: 'barras', rango: 'ano_actual' },
      })
    ).toThrow(ErrorApi);
  });

  it('rechaza espacio_id inválido', () => {
    expect(() =>
      validarPayloadVistaGuardada({
        espacio_id: 'x',
        nombre: 'X',
        configuracion: { metrica: 'ingresos_vs_gastos', tipoGrafico: 'barras', rango: 'ano_actual' },
      })
    ).toThrow(ErrorApi);
  });
});
