import { describe, expect, it } from 'vitest';
import { ErrorApi } from './supabase-server';
import { validarPayloadExportarTablas } from './validacion-exportar-tablas';

const BASE = {
  formato: 'xlsx',
  titulo: 'Informe',
  hojas: [{ titulo: 'Resumen', columnas: ['Concepto', 'Importe'], filas: [['Ingresos', 1000]] }],
};

describe('validarPayloadExportarTablas', () => {
  it('acepta un payload válido', () => {
    expect(() => validarPayloadExportarTablas(BASE)).not.toThrow();
  });

  it('rechaza un formato que no sea xlsx/pdf', () => {
    expect(() => validarPayloadExportarTablas({ ...BASE, formato: 'csv' })).toThrow(ErrorApi);
  });

  it('rechaza sin hojas', () => {
    expect(() => validarPayloadExportarTablas({ ...BASE, hojas: [] })).toThrow(ErrorApi);
  });

  it('rechaza más de 10 hojas', () => {
    const hojas = Array.from({ length: 11 }, (_, i) => ({ titulo: `H${i}`, columnas: ['A'], filas: [] }));
    expect(() => validarPayloadExportarTablas({ ...BASE, hojas })).toThrow(ErrorApi);
  });

  it('rechaza una hoja sin columnas de texto', () => {
    expect(() =>
      validarPayloadExportarTablas({ ...BASE, hojas: [{ titulo: 'X', columnas: [1, 2], filas: [] }] })
    ).toThrow(ErrorApi);
  });

  it('rechaza una fila con una celda que no es texto ni número', () => {
    expect(() =>
      validarPayloadExportarTablas({
        ...BASE,
        hojas: [{ titulo: 'X', columnas: ['A'], filas: [[{ raro: true }]] }],
      })
    ).toThrow(ErrorApi);
  });

  it('acepta celdas numéricas y de texto mezcladas en la misma fila', () => {
    expect(() =>
      validarPayloadExportarTablas({
        ...BASE,
        hojas: [{ titulo: 'X', columnas: ['A', 'B'], filas: [['texto', 42]] }],
      })
    ).not.toThrow();
  });
});
