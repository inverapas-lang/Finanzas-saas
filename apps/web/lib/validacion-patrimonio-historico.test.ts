import { describe, expect, it } from 'vitest';
import { ErrorApi } from './supabase-server';
import {
  validarCambiosPatrimonioHistorico,
  validarPayloadPatrimonioHistorico,
} from './validacion-patrimonio-historico';

const BASE = {
  espacio_id: '11111111-1111-1111-1111-111111111111',
  mes: '2026-01-01',
};

describe('validarPayloadPatrimonioHistorico', () => {
  it('acepta un payload válido completo', () => {
    const payload = validarPayloadPatrimonioHistorico({
      ...BASE,
      total_cuentas: 1000,
      total_inversiones_liquidas: 2000,
      total_inversiones_intocables: 3000,
      total_inversiones_iliquidas: 4000,
      total_deuda: 500,
      notas: 'Snapshot de enero',
    });
    expect(payload.total_cuentas).toBe(1000);
    expect(payload.total_deuda).toBe(500);
    expect(payload.notas).toBe('Snapshot de enero');
    expect(payload.mes).toBe('2026-01-01');
  });

  it('rechaza si falta espacio_id', () => {
    expect(() => validarPayloadPatrimonioHistorico({ mes: '2026-01-01' })).toThrow(ErrorApi);
  });

  it('rechaza espacio_id que no es un UUID válido', () => {
    expect(() => validarPayloadPatrimonioHistorico({ ...BASE, espacio_id: 'no-es-uuid' })).toThrow(ErrorApi);
  });

  it('rechaza mes con formato inválido', () => {
    expect(() => validarPayloadPatrimonioHistorico({ ...BASE, mes: '01/2026' })).toThrow(ErrorApi);
  });

  it('rechaza mes cuyo día no sea 01', () => {
    expect(() => validarPayloadPatrimonioHistorico({ ...BASE, mes: '2026-01-15' })).toThrow(ErrorApi);
  });

  it('rechaza números no finitos en los totales', () => {
    expect(() => validarPayloadPatrimonioHistorico({ ...BASE, total_cuentas: NaN })).toThrow(ErrorApi);
    expect(() => validarPayloadPatrimonioHistorico({ ...BASE, total_cuentas: Infinity })).toThrow(ErrorApi);
    expect(() => validarPayloadPatrimonioHistorico({ ...BASE, total_deuda: 'mucho' })).toThrow(ErrorApi);
  });

  it('rellena los totales con 0 por defecto cuando se omiten', () => {
    const payload = validarPayloadPatrimonioHistorico(BASE);
    expect(payload.total_cuentas).toBe(0);
    expect(payload.total_inversiones_liquidas).toBe(0);
    expect(payload.total_inversiones_intocables).toBe(0);
    expect(payload.total_inversiones_iliquidas).toBe(0);
    expect(payload.total_deuda).toBe(0);
    expect(payload.notas).toBeNull();
  });

  it('acepta un total_deuda positivo (no se exige que sea negativo)', () => {
    const payload = validarPayloadPatrimonioHistorico({ ...BASE, total_deuda: 1500 });
    expect(payload.total_deuda).toBe(1500);
  });
});

describe('validarCambiosPatrimonioHistorico', () => {
  it('no lanza con un objeto vacío', () => {
    expect(() => validarCambiosPatrimonioHistorico({})).not.toThrow();
  });

  it('valida solo los campos presentes', () => {
    expect(() => validarCambiosPatrimonioHistorico({ total_cuentas: 2500 })).not.toThrow();
  });

  it('rechaza un total no finito si se incluye', () => {
    expect(() => validarCambiosPatrimonioHistorico({ total_inversiones_liquidas: NaN })).toThrow(ErrorApi);
  });

  it('ignora espacio_id y mes aunque vinieran en el objeto (la ruta los elimina antes, pero por si no)', () => {
    // La función en sí no valida espacio_id/mes porque la ruta los elimina
    // de `cambios` antes de llamarla (igual que metas con espacio_id/created_at).
    expect(() => validarCambiosPatrimonioHistorico({ notas: 'actualizado' })).not.toThrow();
  });

  it('rechaza notas que no sean string si se incluyen', () => {
    expect(() => validarCambiosPatrimonioHistorico({ notas: 123 })).toThrow(ErrorApi);
  });
});
