import { describe, expect, it } from 'vitest';
import { ErrorApi } from './supabase-server';
import {
  BLOQUES_PATRIMONIO,
  ETIQUETAS_BLOQUE,
  validarCambiosPatrimonioHistoricoItem,
  validarPayloadPatrimonioHistoricoItem,
} from './validacion-patrimonio-historico-item';

const BASE = {
  espacio_id: '11111111-1111-1111-1111-111111111111',
  mes: '2026-01-01',
  bloque: 'cuenta',
  concepto: 'Cta Santander',
  valor: 1000,
};

describe('BLOQUES_PATRIMONIO / ETIQUETAS_BLOQUE', () => {
  it('define los 5 bloques en el orden esperado', () => {
    expect(BLOQUES_PATRIMONIO).toEqual([
      'cuenta',
      'inversion_liquida',
      'inversion_intocable',
      'inversion_iliquida',
      'deuda',
    ]);
  });

  it('tiene una etiqueta legible para cada bloque', () => {
    for (const bloque of BLOQUES_PATRIMONIO) {
      expect(typeof ETIQUETAS_BLOQUE[bloque]).toBe('string');
      expect(ETIQUETAS_BLOQUE[bloque].length).toBeGreaterThan(0);
    }
  });
});

describe('validarPayloadPatrimonioHistoricoItem', () => {
  it('acepta un payload válido completo', () => {
    const payload = validarPayloadPatrimonioHistoricoItem({ ...BASE, notas: 'Cuenta principal' });
    expect(payload.espacio_id).toBe(BASE.espacio_id);
    expect(payload.mes).toBe('2026-01-01');
    expect(payload.bloque).toBe('cuenta');
    expect(payload.concepto).toBe('Cta Santander');
    expect(payload.valor).toBe(1000);
    expect(payload.notas).toBe('Cuenta principal');
  });

  it('recorta espacios del concepto', () => {
    const payload = validarPayloadPatrimonioHistoricoItem({ ...BASE, concepto: '  Revolut Piso Alicante  ' });
    expect(payload.concepto).toBe('Revolut Piso Alicante');
  });

  it('rechaza si falta espacio_id', () => {
    const { espacio_id, ...sinEspacio } = BASE;
    expect(() => validarPayloadPatrimonioHistoricoItem(sinEspacio)).toThrow(ErrorApi);
  });

  it('rechaza espacio_id que no es un UUID válido', () => {
    expect(() => validarPayloadPatrimonioHistoricoItem({ ...BASE, espacio_id: 'no-es-uuid' })).toThrow(ErrorApi);
  });

  it('rechaza mes con formato inválido', () => {
    expect(() => validarPayloadPatrimonioHistoricoItem({ ...BASE, mes: '01/2026' })).toThrow(ErrorApi);
  });

  it('rechaza mes cuyo día no sea 01', () => {
    expect(() => validarPayloadPatrimonioHistoricoItem({ ...BASE, mes: '2026-01-15' })).toThrow(ErrorApi);
  });

  it('rechaza bloque inválido y lista los valores aceptados en el mensaje', () => {
    try {
      validarPayloadPatrimonioHistoricoItem({ ...BASE, bloque: 'ahorro' });
      throw new Error('no debería llegar aquí');
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorApi);
      expect((e as ErrorApi).message).toMatch(/cuenta/);
      expect((e as ErrorApi).message).toMatch(/deuda/);
    }
  });

  it('rechaza concepto vacío o ausente', () => {
    expect(() => validarPayloadPatrimonioHistoricoItem({ ...BASE, concepto: '' })).toThrow(ErrorApi);
    expect(() => validarPayloadPatrimonioHistoricoItem({ ...BASE, concepto: '   ' })).toThrow(ErrorApi);
    const { concepto, ...sinConcepto } = BASE;
    expect(() => validarPayloadPatrimonioHistoricoItem(sinConcepto)).toThrow(ErrorApi);
  });

  it('rechaza valores no finitos', () => {
    expect(() => validarPayloadPatrimonioHistoricoItem({ ...BASE, valor: NaN })).toThrow(ErrorApi);
    expect(() => validarPayloadPatrimonioHistoricoItem({ ...BASE, valor: Infinity })).toThrow(ErrorApi);
    expect(() => validarPayloadPatrimonioHistoricoItem({ ...BASE, valor: 'mucho' })).toThrow(ErrorApi);
  });

  it('acepta un valor positivo para un concepto de deuda (sin restricción de signo)', () => {
    const payload = validarPayloadPatrimonioHistoricoItem({ ...BASE, bloque: 'deuda', concepto: 'Nissan', valor: 8000 });
    expect(payload.valor).toBe(8000);
  });

  it('usa 0 por defecto si se omite valor', () => {
    const { valor, ...sinValor } = BASE;
    const payload = validarPayloadPatrimonioHistoricoItem(sinValor);
    expect(payload.valor).toBe(0);
  });

  it('deja notas como null si se omite', () => {
    const payload = validarPayloadPatrimonioHistoricoItem(BASE);
    expect(payload.notas).toBeNull();
  });

  it('rechaza notas que no sean string', () => {
    expect(() => validarPayloadPatrimonioHistoricoItem({ ...BASE, notas: 123 })).toThrow(ErrorApi);
  });
});

describe('validarCambiosPatrimonioHistoricoItem', () => {
  it('no lanza con un objeto vacío', () => {
    expect(() => validarCambiosPatrimonioHistoricoItem({})).not.toThrow();
  });

  it('valida valor si está presente', () => {
    expect(() => validarCambiosPatrimonioHistoricoItem({ valor: 2500 })).not.toThrow();
    expect(() => validarCambiosPatrimonioHistoricoItem({ valor: NaN })).toThrow(ErrorApi);
  });

  it('valida notas si está presente', () => {
    expect(() => validarCambiosPatrimonioHistoricoItem({ notas: 'actualizado' })).not.toThrow();
    expect(() => validarCambiosPatrimonioHistoricoItem({ notas: 123 })).toThrow(ErrorApi);
  });

  it('ignora campos inmutables aunque vengan incluidos (la ruta los elimina antes, pero por si no)', () => {
    expect(() =>
      validarCambiosPatrimonioHistoricoItem({
        espacio_id: 'otro-espacio',
        mes: '2099-01-01',
        bloque: 'deuda',
        concepto: 'Otro concepto',
        valor: 10,
      })
    ).not.toThrow();
  });
});
