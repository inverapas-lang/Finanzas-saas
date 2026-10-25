import { describe, expect, it } from 'vitest';
import { mapearTransaccionesNuevas } from './sincronizar-banco';
import type { TransaccionExterna } from './gocardless';

function tx(overrides: Partial<TransaccionExterna>): TransaccionExterna {
  return {
    transaccionExternaId: 'tx-1',
    importe: 10,
    moneda: 'EUR',
    fecha: '2026-01-15',
    descripcion: 'Movimiento',
    ...overrides,
  };
}

describe('mapearTransaccionesNuevas', () => {
  it('clasifica un importe positivo como ingreso y uno negativo como gasto', () => {
    const resultado = mapearTransaccionesNuevas(
      [tx({ transaccionExternaId: 'a', importe: 1500 }), tx({ transaccionExternaId: 'b', importe: -42.5 })],
      new Set()
    );
    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({ tipo: 'ingreso', importe: 1500 });
    expect(resultado[1]).toMatchObject({ tipo: 'gasto', importe: 42.5 });
  });

  it('siempre devuelve el importe en positivo, sea ingreso o gasto', () => {
    const [gasto] = mapearTransaccionesNuevas([tx({ importe: -99.9 })], new Set());
    expect(gasto.importe).toBeGreaterThan(0);
  });

  it('excluye las transacciones cuyo id ya está en yaImportadas', () => {
    const resultado = mapearTransaccionesNuevas(
      [tx({ transaccionExternaId: 'ya-existe' }), tx({ transaccionExternaId: 'nueva' })],
      new Set(['ya-existe'])
    );
    expect(resultado).toHaveLength(1);
    expect(resultado[0].transaccionExternaId).toBe('nueva');
  });

  it('descarta transacciones con importe 0', () => {
    const resultado = mapearTransaccionesNuevas([tx({ importe: 0 })], new Set());
    expect(resultado).toHaveLength(0);
  });

  it('con todo ya importado, no devuelve nada', () => {
    const resultado = mapearTransaccionesNuevas(
      [tx({ transaccionExternaId: 'a' }), tx({ transaccionExternaId: 'b' })],
      new Set(['a', 'b'])
    );
    expect(resultado).toHaveLength(0);
  });

  it('conserva fecha y descripción tal cual vienen de GoCardless', () => {
    const [mov] = mapearTransaccionesNuevas(
      [tx({ fecha: '2025-12-24', descripcion: 'PAGO EN COMERCIO XYZ' })],
      new Set()
    );
    expect(mov.fecha).toBe('2025-12-24');
    expect(mov.descripcion).toBe('PAGO EN COMERCIO XYZ');
  });
});
