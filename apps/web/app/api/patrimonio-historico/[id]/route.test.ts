import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const updateMock = vi.fn();
const deleteMock = vi.fn();

let respuestaUpdate: { data: unknown; error: unknown } = { data: { id: 'patrimonio-1' }, error: null };
let respuestaDelete: { error: unknown; count: number | null } = { error: null, count: 1 };

vi.mock('../../../../lib/supabase-server', async () => {
  const actual =
    await vi.importActual<typeof import('../../../../lib/supabase-server')>('../../../../lib/supabase-server');
  return {
    ...actual,
    crearClienteSupabaseDeRequest: () => ({
      from: (tabla: string) => ({
        update: (cambios: Record<string, unknown>) => {
          updateMock(tabla, cambios);
          return { eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve(respuestaUpdate) }) }) };
        },
        delete: () => {
          deleteMock(tabla);
          return { eq: () => Promise.resolve(respuestaDelete) };
        },
      }),
    }),
  };
});

const { PATCH, DELETE } = await import('./route');

function crearRequestPatch(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/patrimonio-historico/patrimonio-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function crearRequestDelete(): NextRequest {
  return new NextRequest('http://localhost/api/patrimonio-historico/patrimonio-1', { method: 'DELETE' });
}

function contexto() {
  return { params: Promise.resolve({ id: 'patrimonio-1' }) };
}

beforeEach(() => {
  updateMock.mockClear();
  deleteMock.mockClear();
  respuestaUpdate = { data: { id: 'patrimonio-1' }, error: null };
  respuestaDelete = { error: null, count: 1 };
});

describe('PATCH /api/patrimonio-historico/[id]', () => {
  it('actualiza los campos permitidos', async () => {
    const res = await PATCH(crearRequestPatch({ total_cuentas: 5000 }), contexto());
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
    const [, cambios] = updateMock.mock.calls[0];
    expect(cambios.total_cuentas).toBe(5000);
  });

  it('elimina espacio_id y mes del cuerpo aunque vengan incluidos', async () => {
    const res = await PATCH(
      crearRequestPatch({ espacio_id: 'otro-espacio', mes: '2099-01-01', total_cuentas: 10 }),
      contexto()
    );
    expect(res.status).toBe(200);
    const [, cambios] = updateMock.mock.calls[0];
    expect(cambios.espacio_id).toBeUndefined();
    expect(cambios.mes).toBeUndefined();
  });

  it('devuelve 404 si el registro no existe o no hay acceso', async () => {
    respuestaUpdate = { data: null, error: null };
    const res = await PATCH(crearRequestPatch({ total_cuentas: 10 }), contexto());
    expect(res.status).toBe(404);
  });

  it('devuelve 403 si RLS bloquea el update (42501)', async () => {
    respuestaUpdate = { data: null, error: { code: '42501', message: 'no permitido' } };
    const res = await PATCH(crearRequestPatch({ total_cuentas: 10 }), contexto());
    expect(res.status).toBe(403);
  });

  it('rechaza un cambio inválido', async () => {
    const res = await PATCH(crearRequestPatch({ total_cuentas: NaN }), contexto());
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/patrimonio-historico/[id]', () => {
  it('elimina el registro', async () => {
    const res = await DELETE(crearRequestDelete(), contexto());
    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalledOnce();
  });

  it('devuelve 404 si no existe o no hay acceso', async () => {
    respuestaDelete = { error: null, count: 0 };
    const res = await DELETE(crearRequestDelete(), contexto());
    expect(res.status).toBe(404);
  });

  it('devuelve 403 si RLS bloquea el delete (42501)', async () => {
    respuestaDelete = { error: { code: '42501', message: 'no permitido' }, count: null };
    const res = await DELETE(crearRequestDelete(), contexto());
    expect(res.status).toBe(403);
  });
});
