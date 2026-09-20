import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const updateMock = vi.fn();

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

let respuestaGastoActual: { data: unknown; error: unknown } = { data: { espacio_id: ESPACIO_ID }, error: null };
let respuestaCategoria: { data: unknown; error: unknown } = { data: null, error: null };
let respuestaUpdate: { data: unknown; error: unknown } = { data: { id: 'gasto-1' }, error: null };

vi.mock('../../../../lib/supabase-server', async () => {
  const actual =
    await vi.importActual<typeof import('../../../../lib/supabase-server')>('../../../../lib/supabase-server');
  return {
    ...actual,
    crearClienteSupabaseDeRequest: () => ({
      from: (tabla: string) => {
        if (tabla === 'categorias') {
          return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(respuestaCategoria) }) }) };
        }
        // tabla 'gastos': select() para leer el espacio_id actual, update() para el PATCH
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(respuestaGastoActual) }) }),
          update: (cambios: Record<string, unknown>) => {
            updateMock(cambios);
            return { eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve(respuestaUpdate) }) }) };
          },
        };
      },
    }),
  };
});

const { PATCH } = await import('./route');

function crearRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/gastos/gasto-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function contexto() {
  return { params: Promise.resolve({ id: 'gasto-1' }) };
}

beforeEach(() => {
  updateMock.mockClear();
  respuestaGastoActual = { data: { espacio_id: ESPACIO_ID }, error: null };
  respuestaCategoria = { data: null, error: null };
  respuestaUpdate = { data: { id: 'gasto-1' }, error: null };
});

describe('PATCH /api/gastos/[id]', () => {
  it('rechaza repuntar subcategoria_id a una categoría de otro espacio', async () => {
    respuestaCategoria = { data: { id: 'sub-1', tipo: 'gasto', espacio_id: 'otro-espacio' }, error: null };
    const res = await PATCH(crearRequest({ subcategoria_id: 'sub-1' }), contexto());
    const cuerpo = await res.json();
    expect(res.status).toBe(400);
    expect(cuerpo.error).toMatch(/subcategoría.*mismo espacio/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('acepta repuntar subcategoria_id a una categoría de tipo gasto del mismo espacio', async () => {
    respuestaCategoria = { data: { id: 'sub-1', tipo: 'gasto', espacio_id: ESPACIO_ID }, error: null };
    const res = await PATCH(crearRequest({ subcategoria_id: 'sub-1' }), contexto());
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
  });
});
