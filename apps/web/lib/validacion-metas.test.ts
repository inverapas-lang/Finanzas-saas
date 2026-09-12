import { describe, expect, it } from 'vitest';
import { ErrorApi } from './supabase-server';
import { validarCambiosMeta, validarPayloadMeta } from './validacion-metas';

const BASE = {
  espacio_id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Fondo de emergencia',
  importe_objetivo: 6000,
};

describe('validarPayloadMeta', () => {
  it('acepta un payload mínimo y rellena defaults', () => {
    const meta = validarPayloadMeta(BASE);
    expect(meta.importe_actual).toBe(0);
    expect(meta.moneda).toBe('EUR');
    expect(meta.activa).toBe(true);
    expect(meta.fecha_objetivo).toBeNull();
    expect(meta.cuenta_id).toBeNull();
  });

  it('rechaza nombre vacío', () => {
    expect(() => validarPayloadMeta({ ...BASE, nombre: '   ' })).toThrow(ErrorApi);
  });

  it('rechaza importe_objetivo <= 0', () => {
    expect(() => validarPayloadMeta({ ...BASE, importe_objetivo: 0 })).toThrow(ErrorApi);
    expect(() => validarPayloadMeta({ ...BASE, importe_objetivo: -100 })).toThrow(ErrorApi);
  });

  it('rechaza importe_actual negativo', () => {
    expect(() => validarPayloadMeta({ ...BASE, importe_actual: -1 })).toThrow(ErrorApi);
  });

  it('acepta importe_actual igual o mayor que el objetivo (meta ya cumplida al crearla)', () => {
    const meta = validarPayloadMeta({ ...BASE, importe_actual: 6000 });
    expect(meta.importe_actual).toBe(6000);
  });

  it('rechaza fecha_objetivo con formato inválido', () => {
    expect(() => validarPayloadMeta({ ...BASE, fecha_objetivo: '01/01/2027' })).toThrow(ErrorApi);
  });
});

describe('validarCambiosMeta', () => {
  it('no lanza con un objeto vacío', () => {
    expect(() => validarCambiosMeta({})).not.toThrow();
  });

  it('rechaza importe_actual negativo si se incluye', () => {
    expect(() => validarCambiosMeta({ importe_actual: -5 })).toThrow(ErrorApi);
  });

  it('rechaza activa que no sea booleano', () => {
    expect(() => validarCambiosMeta({ activa: 1 })).toThrow(ErrorApi);
  });

  it('acepta un aporte (incremento de importe_actual)', () => {
    expect(() => validarCambiosMeta({ importe_actual: 1200 })).not.toThrow();
  });
});
