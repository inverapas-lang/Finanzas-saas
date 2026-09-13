import { describe, expect, it } from 'vitest';
import { ErrorApi } from './supabase-server';
import { validarPayloadConexionBancaria } from './validacion-bancos';

const BASE = {
  espacio_id: '11111111-1111-1111-1111-111111111111',
  institucion_id: 'BBVA_BBVAESMM',
  institucion_nombre: 'BBVA',
  redirect_url: 'https://app.example.com/dashboard/bancos/callback',
};

describe('validarPayloadConexionBancaria', () => {
  it('acepta un payload válido', () => {
    expect(() => validarPayloadConexionBancaria(BASE)).not.toThrow();
  });

  it('rechaza espacio_id que no sea UUID', () => {
    expect(() => validarPayloadConexionBancaria({ ...BASE, espacio_id: 'x' })).toThrow(ErrorApi);
  });

  it('rechaza institucion_id vacío', () => {
    expect(() => validarPayloadConexionBancaria({ ...BASE, institucion_id: '' })).toThrow(ErrorApi);
  });

  it('rechaza redirect_url que no sea una URL absoluta', () => {
    expect(() => validarPayloadConexionBancaria({ ...BASE, redirect_url: '/dashboard/bancos' })).toThrow(ErrorApi);
  });
});
