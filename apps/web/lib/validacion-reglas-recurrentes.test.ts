import { describe, expect, it } from 'vitest';
import { ErrorApi } from './supabase-server';
import { validarCambiosReglaRecurrente, validarPayloadReglaRecurrente } from './validacion-reglas-recurrentes';

const BASE = {
  espacio_id: '11111111-1111-1111-1111-111111111111',
  tipo: 'gasto',
  descripcion: 'Alquiler',
  importe: 800,
  periodicidad: 'mensual',
  fecha_inicio: '2026-01-01',
};

describe('validarPayloadReglaRecurrente', () => {
  it('acepta un payload mínimo válido y rellena los defaults', () => {
    const payload = validarPayloadReglaRecurrente(BASE);
    expect(payload.moneda).toBe('EUR');
    expect(payload.activa).toBe(true);
    expect(payload.categoria_id).toBeNull();
    expect(payload.fecha_fin).toBeNull();
  });

  it('rechaza espacio_id que no sea un UUID', () => {
    expect(() => validarPayloadReglaRecurrente({ ...BASE, espacio_id: 'no-es-uuid' })).toThrow(ErrorApi);
  });

  it('rechaza un tipo que no sea ingreso/gasto', () => {
    expect(() => validarPayloadReglaRecurrente({ ...BASE, tipo: 'transferencia' })).toThrow(ErrorApi);
  });

  it('rechaza periodicidad "unico" (una regla recurrente debe recurrir)', () => {
    expect(() => validarPayloadReglaRecurrente({ ...BASE, periodicidad: 'unico' })).toThrow(ErrorApi);
  });

  it('rechaza un importe <= 0', () => {
    expect(() => validarPayloadReglaRecurrente({ ...BASE, importe: 0 })).toThrow(ErrorApi);
    expect(() => validarPayloadReglaRecurrente({ ...BASE, importe: -10 })).toThrow(ErrorApi);
  });

  it('rechaza fecha_fin anterior a fecha_inicio', () => {
    expect(() =>
      validarPayloadReglaRecurrente({ ...BASE, fecha_inicio: '2026-06-01', fecha_fin: '2026-01-01' })
    ).toThrow(ErrorApi);
  });

  it('acepta fecha_fin posterior o igual a fecha_inicio', () => {
    const payload = validarPayloadReglaRecurrente({ ...BASE, fecha_fin: '2026-01-01' });
    expect(payload.fecha_fin).toBe('2026-01-01');
  });

  it('respeta activa: false explícito', () => {
    const payload = validarPayloadReglaRecurrente({ ...BASE, activa: false });
    expect(payload.activa).toBe(false);
  });

  it('rechaza cuenta_id que no sea un UUID válido', () => {
    expect(() => validarPayloadReglaRecurrente({ ...BASE, cuenta_id: 'no-es-uuid' })).toThrow(ErrorApi);
  });

  it('acepta cuenta_id null o ausente', () => {
    expect(() => validarPayloadReglaRecurrente({ ...BASE, cuenta_id: null })).not.toThrow();
    expect(() => validarPayloadReglaRecurrente(BASE)).not.toThrow();
  });
});

describe('validarCambiosReglaRecurrente', () => {
  it('no lanza con un objeto de cambios vacío', () => {
    expect(() => validarCambiosReglaRecurrente({})).not.toThrow();
  });

  it('rechaza importe <= 0 si se incluye', () => {
    expect(() => validarCambiosReglaRecurrente({ importe: 0 })).toThrow(ErrorApi);
  });

  it('rechaza periodicidad inválida si se incluye', () => {
    expect(() => validarCambiosReglaRecurrente({ periodicidad: 'unico' })).toThrow(ErrorApi);
    expect(() => validarCambiosReglaRecurrente({ periodicidad: 'diario' })).toThrow(ErrorApi);
  });

  it('rechaza activa que no sea booleano', () => {
    expect(() => validarCambiosReglaRecurrente({ activa: 'si' })).toThrow(ErrorApi);
  });

  it('acepta cambios parciales válidos', () => {
    expect(() => validarCambiosReglaRecurrente({ importe: 850, activa: false })).not.toThrow();
  });

  it('rechaza cuenta_id/categoria_id con formato inválido si se incluyen', () => {
    expect(() => validarCambiosReglaRecurrente({ cuenta_id: 'x' })).toThrow(ErrorApi);
    expect(() => validarCambiosReglaRecurrente({ categoria_id: 'x' })).toThrow(ErrorApi);
  });
});
