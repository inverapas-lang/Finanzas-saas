import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenerOCrearCategoria } from './categoria-cliente';

const TOKEN = 'token-123';
const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

describe('obtenerOCrearCategoria', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devuelve el id de una categoría ya existente sin crear una nueva', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'cat-1', nombre: 'Seguros', categoria_padre_id: null }] }),
    });

    const id = await obtenerOCrearCategoria(TOKEN, ESPACIO_ID, 'gasto', 'Seguros');

    expect(id).toBe('cat-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('crea la categoría si no existe todavía', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'cat-nueva' } }) });

    const id = await obtenerOCrearCategoria(TOKEN, ESPACIO_ID, 'gasto', 'Seguros');

    expect(id).toBe('cat-nueva');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, opciones] = fetchMock.mock.calls[1];
    expect(opciones.method).toBe('POST');
    expect(JSON.parse(opciones.body)).toMatchObject({ espacio_id: ESPACIO_ID, tipo: 'gasto', nombre: 'Seguros' });
  });

  it('distingue categorías con el mismo nombre pero distinto padre', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'cat-raiz', nombre: 'Otros', categoria_padre_id: null }],
      }),
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'cat-hija' } }) });

    const id = await obtenerOCrearCategoria(TOKEN, ESPACIO_ID, 'gasto', 'Otros', 'padre-1');

    expect(id).toBe('cat-hija');
  });

  it('lanza un error legible si la creación falla', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'No tienes permiso' }) });

    await expect(obtenerOCrearCategoria(TOKEN, ESPACIO_ID, 'gasto', 'Seguros')).rejects.toThrow('No tienes permiso');
  });
});
