import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const insertMock = vi.fn();
const authGetUserMock = vi.fn();
const selectMock = vi.fn();

let respuestaInsert: { data: unknown; error: unknown } = {
  data: { id: 'item-1' },
  error: null,
};
let respuestaSelect: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock('../../../lib/supabase-server', async () => {
  const actual =
    await vi.importActual<typeof import('../../../lib/supabase-server')>('../../../lib/supabase-server');
  return {
    ...actual,
    crearClienteSupabaseDeRequest: () => ({
      auth: { getUser: authGetUserMock },
      from: (tabla: string) => {
        selectMock(tabla);
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: () => ({
                  order: () => Promise.resolve(respuestaSelect),
                }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            insertMock(tabla, row);
            return {
              select: () => ({
                single: () => Promise.resolve(respuestaInsert),
              }),
            };
          },
        };
      },
    }),
  };
});

const { GET, POST } = await import('./route');

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

function crearRequestPost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/patrimonio-historico-item', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function crearRequestGet(espacioId: string): NextRequest {
  return new NextRequest(`http://localhost/api/patrimonio-historico-item?espacio_id=${espacioId}`);
}

beforeEach(() => {
  insertMock.mockClear();
  selectMock.mockClear();
  authGetUserMock.mockReset();
  authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  respuestaInsert = { data: { id: 'item-1' }, error: null };
  respuestaSelect = { data: [], error: null };
});

const BASE = {
  espacio_id: ESPACIO_ID,
  mes: '2026-01-01',
  bloque: 'cuenta',
  concepto: 'Cta Santander',
  valor: 1000,
};

describe('GET /api/patrimonio-historico-item', () => {
  it('lista los registros del espacio', async () => {
    respuestaSelect = { data: [{ id: 'i1', mes: '2026-01-01', bloque: 'cuenta', concepto: 'Cta Santander' }], error: null };
    const res = await GET(crearRequestGet(ESPACIO_ID));
    const cuerpo = await res.json();
    expect(res.status).toBe(200);
    expect(cuerpo.data).toHaveLength(1);
  });

  it('rechaza si falta espacio_id', async () => {
    const res = await GET(new NextRequest('http://localhost/api/patrimonio-historico-item'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/patrimonio-historico-item', () => {
  it('crea un registro de patrimonio', async () => {
    const res = await POST(crearRequestPost(BASE));
    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledOnce();
    const [, row] = insertMock.mock.calls[0];
    expect(row.created_by).toBe('user-1');
    expect(row.concepto).toBe('Cta Santander');
  });

  it('devuelve 401 si no hay usuario autenticado', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(crearRequestPost(BASE));
    expect(res.status).toBe(401);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('devuelve 409 si ya existe un valor para ese mes+bloque+concepto (violación de unicidad 23505)', async () => {
    respuestaInsert = { data: null, error: { code: '23505', message: 'duplicate key' } };
    const res = await POST(crearRequestPost(BASE));
    const cuerpo = await res.json();
    expect(res.status).toBe(409);
    expect(cuerpo.error).toMatch(/Ya existe un valor/);
  });

  it('devuelve 403 si RLS bloquea el insert (42501)', async () => {
    respuestaInsert = { data: null, error: { code: '42501', message: 'no permitido' } };
    const res = await POST(crearRequestPost(BASE));
    const cuerpo = await res.json();
    expect(res.status).toBe(403);
    expect(cuerpo.error).toMatch(/No tienes permiso/);
  });

  it('rechaza un payload inválido antes de llegar a insert', async () => {
    const res = await POST(crearRequestPost({ ...BASE, mes: '2026-01-15' }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rechaza un bloque inválido antes de llegar a insert', async () => {
    const res = await POST(crearRequestPost({ ...BASE, bloque: 'ahorro' }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
