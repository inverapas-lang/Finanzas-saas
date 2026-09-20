import { describe, expect, it } from 'vitest';
import { ErrorApi } from './supabase-server';
import {
  validarPayloadMovimiento,
  validarCambiosMovimiento,
  verificarCategoriaYCuenta,
} from './validacion-movimientos';
import { crearSupabaseMock } from './test-utils/supabase-mock';

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';
const OTRO_ESPACIO_ID = '22222222-2222-2222-2222-222222222222';
const CATEGORIA_ID = '33333333-3333-3333-3333-333333333333';
const CUENTA_ID = '44444444-4444-4444-4444-444444444444';

const BASE_INGRESO = {
  espacio_id: ESPACIO_ID,
  descripcion: 'Nómina',
  importe_esperado: 1500,
  fecha_prevista: '2026-01-01',
};

describe('validarPayloadMovimiento', () => {
  it('acepta un payload mínimo y rellena defaults', () => {
    const ingreso = validarPayloadMovimiento(BASE_INGRESO, 'ingreso');
    expect(ingreso.periodicidad).toBe('unico');
    expect(ingreso.moneda).toBe('EUR');
  });

  it('rechaza importe_esperado infinito', () => {
    expect(() =>
      validarPayloadMovimiento({ ...BASE_INGRESO, importe_esperado: Infinity }, 'ingreso')
    ).toThrow(ErrorApi);
  });

  it('rechaza importe_real infinito', () => {
    expect(() =>
      validarPayloadMovimiento({ ...BASE_INGRESO, importe_real: Infinity }, 'ingreso')
    ).toThrow(ErrorApi);
  });

  it('rechaza una periodicidad fuera del enum', () => {
    expect(() =>
      validarPayloadMovimiento({ ...BASE_INGRESO, periodicidad: 'quincenal' }, 'ingreso')
    ).toThrow(ErrorApi);
  });

  it('acepta una periodicidad válida', () => {
    const ingreso = validarPayloadMovimiento({ ...BASE_INGRESO, periodicidad: 'mensual' }, 'ingreso');
    expect(ingreso.periodicidad).toBe('mensual');
  });
});

describe('validarCambiosMovimiento', () => {
  it('rechaza importe_real infinito en un PATCH', () => {
    expect(() => validarCambiosMovimiento({ importe_real: Infinity }, 'gasto')).toThrow(ErrorApi);
  });

  it('rechaza una periodicidad inválida en un PATCH', () => {
    expect(() => validarCambiosMovimiento({ periodicidad: 'nunca' }, 'gasto')).toThrow(ErrorApi);
  });

  it('no exige nada si no llega ningún campo', () => {
    expect(() => validarCambiosMovimiento({}, 'gasto')).not.toThrow();
  });
});

describe('verificarCategoriaYCuenta', () => {
  it('no hace ninguna comprobación si no se informan campos', async () => {
    const supabase = crearSupabaseMock({});
    await expect(
      verificarCategoriaYCuenta(supabase as never, ESPACIO_ID, 'ingreso', {})
    ).resolves.toBeUndefined();
  });

  it('rechaza una categoria_id de otro espacio (aislamiento multi-tenant)', async () => {
    const supabase = crearSupabaseMock({
      'categorias:select': [{ data: { id: CATEGORIA_ID, tipo: 'ingreso', espacio_id: OTRO_ESPACIO_ID }, error: null }],
    });
    await expect(
      verificarCategoriaYCuenta(supabase as never, ESPACIO_ID, 'ingreso', { categoria_id: CATEGORIA_ID })
    ).rejects.toThrow('La categoría debe pertenecer al mismo espacio');
  });

  it('rechaza una categoria_id que no existe', async () => {
    const supabase = crearSupabaseMock({
      'categorias:select': [{ data: null, error: null }],
    });
    await expect(
      verificarCategoriaYCuenta(supabase as never, ESPACIO_ID, 'ingreso', { categoria_id: CATEGORIA_ID })
    ).rejects.toThrow('categoria_id no existe');
  });

  it('rechaza una categoria_id del espacio correcto pero del tipo equivocado', async () => {
    const supabase = crearSupabaseMock({
      'categorias:select': [{ data: { id: CATEGORIA_ID, tipo: 'gasto', espacio_id: ESPACIO_ID }, error: null }],
    });
    await expect(
      verificarCategoriaYCuenta(supabase as never, ESPACIO_ID, 'ingreso', { categoria_id: CATEGORIA_ID })
    ).rejects.toThrow('mismo tipo');
  });

  it('acepta una categoria_id del mismo espacio y tipo', async () => {
    const supabase = crearSupabaseMock({
      'categorias:select': [{ data: { id: CATEGORIA_ID, tipo: 'ingreso', espacio_id: ESPACIO_ID }, error: null }],
    });
    await expect(
      verificarCategoriaYCuenta(supabase as never, ESPACIO_ID, 'ingreso', { categoria_id: CATEGORIA_ID })
    ).resolves.toBeUndefined();
  });

  it('rechaza una cuenta_id de otro espacio (aislamiento multi-tenant)', async () => {
    const supabase = crearSupabaseMock({
      'cuentas_bancarias:select': [{ data: { id: CUENTA_ID, espacio_id: OTRO_ESPACIO_ID }, error: null }],
    });
    await expect(
      verificarCategoriaYCuenta(supabase as never, ESPACIO_ID, 'gasto', { cuenta_id: CUENTA_ID })
    ).rejects.toThrow('La cuenta debe pertenecer al mismo espacio');
  });

  it('rechaza una subcategoria_id de otro espacio', async () => {
    const supabase = crearSupabaseMock({
      'categorias:select': [{ data: { id: CATEGORIA_ID, tipo: 'gasto', espacio_id: OTRO_ESPACIO_ID }, error: null }],
    });
    await expect(
      verificarCategoriaYCuenta(supabase as never, ESPACIO_ID, 'gasto', { subcategoria_id: CATEGORIA_ID })
    ).rejects.toThrow('La subcategoría debe pertenecer al mismo espacio');
  });
});
