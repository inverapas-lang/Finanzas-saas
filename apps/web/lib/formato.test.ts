import { afterEach, describe, expect, it } from 'vitest';
import {
  agruparMesesPorAnio,
  formatearCifra,
  formatearMesCorto,
  formatearMoneda,
  guardarDecimalesPreferidos,
  leerDecimalesPreferidos,
} from './formato';

describe('preferencia de decimales', () => {
  afterEach(() => {
    guardarDecimalesPreferidos(2);
  });

  it('sin preferencia guardada (o en el servidor) usa 2 decimales', () => {
    expect(leerDecimalesPreferidos()).toBe(2);
    expect(formatearMoneda(1234.5)).toMatch(/^1\.234,50\s€$/);
  });

  it('formatearMoneda y formatearCifra respetan la preferencia si no se indica otra cosa', () => {
    guardarDecimalesPreferidos(0);
    expect(formatearMoneda(1234.56)).toMatch(/^1\.235\s€$/);
    expect(formatearCifra(1234.56)).toBe('1.235');
  });

  it('un número de decimales explícito manda sobre la preferencia', () => {
    guardarDecimalesPreferidos(0);
    expect(formatearMoneda(10, 2)).toMatch(/^10,00\s€$/);
  });
});

describe('formatearCifra', () => {
  it('agrupa miles también con 4 cifras y no lleva símbolo', () => {
    expect(formatearCifra(4798.57, 2)).toBe('4.798,57');
    expect(formatearCifra(-1061, 0)).toBe('-1.061');
  });
});

describe('meses en las tablas anuales', () => {
  it('formatearMesCorto da solo el mes', () => {
    expect(formatearMesCorto('2026-01')).toBe('Ene');
    expect(formatearMesCorto('2026-12')).toBe('Dic');
  });

  it('agruparMesesPorAnio junta los meses consecutivos de cada año', () => {
    expect(agruparMesesPorAnio(['2025-11', '2025-12', '2026-01'])).toEqual([
      { anio: '2025', meses: ['2025-11', '2025-12'] },
      { anio: '2026', meses: ['2026-01'] },
    ]);
    expect(agruparMesesPorAnio([])).toEqual([]);
  });
});
