import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const insertMock = vi.fn();
const authGetUserMock = vi.fn();

// Respuestas configurables para las consultas de validación cruzada
// (categoria_id/cuenta_id contra espacio_id) — null por defecto.
let respuestaCategoria: { data: unknown; error: unknown } = { data: null, error: null };
let respuestaCuenta: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('../../../lib/supabase-server', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/supabase-server')>('../../../lib/supabase-server');
  return {
    ...actual,
    crearClienteSupabaseDeRequest: () => ({
      auth: { getUser: authGetUserMock },
      from: (tabla: string) => {
        if (tabla === 'categorias') {
          return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(respuestaCategoria) }) }) };
        }
        if (tabla === 'cuentas_bancarias') {
          return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(respuestaCuenta) }) }) };
        }
        return {
          insert: (row: Record<string, unknown>) => {
            insertMock(tabla, row);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'ingreso-1', ...row }, error: null }),
              }),
            };
          },
        };
      },
    }),
  };
});

const { POST } = await import('./route');

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

function crearRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ingresos', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  insertMock.mockClear();
  authGetUserMock.mockReset();
  authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  respuestaCategoria = { data: null, error: null };
  respuestaCuenta = { data: null, error: null };
});

const BASE = {
  espacio_id: ESPACIO_ID,
  descripcion: 'Nómina',
  importe_esperado: 1500,
  fecha_prevista: '2026-01-01',
};

describe('POST /api/ingresos', () => {
  it('crea un ingreso sin categoria_id ni cuenta_id sin hacer comprobaciones cruzadas', async () => {
    const res = await POST(crearRequest(BASE));
    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledOnce();
  });

  it('rechaza una categoria_id de otro espacio financiero', async () => {
    respuestaCategoria = { data: { id: 'cat-1', tipo: 'ingreso', espacio_id: 'otro-espacio' }, error: null };
    const res = await POST(crearRequest({ ...BASE, categoria_id: 'cat-1' }));
    const cuerpo = await res.json();
    expect(res.status).toBe(400);
    expect(cuerpo.error).toMatch(/mismo espacio/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rechaza una cuenta_id de otro espacio financiero', async () => {
    respuestaCuenta = { data: { id: 'cuenta-1', espacio_id: 'otro-espacio' }, error: null };
    const res = await POST(crearRequest({ ...BASE, cuenta_id: 'cuenta-1' }));
    const cuerpo = await res.json();
    expect(res.status).toBe(400);
    expect(cuerpo.error).toMatch(/mismo espacio/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rechaza una categoria_id que no existe', async () => {
    const res = await POST(crearRequest({ ...BASE, categoria_id: 'cat-inexistente' }));
    expect(res.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('crea el ingreso cuando categoria_id y cuenta_id pertenecen al mismo espacio', async () => {
    respuestaCategoria = { data: { id: 'cat-1', tipo: 'ingreso', espacio_id: ESPACIO_ID }, error: null };
    respuestaCuenta = { data: { id: 'cuenta-1', espacio_id: ESPACIO_ID }, error: null };
    const res = await POST(crearRequest({ ...BASE, categoria_id: 'cat-1', cuenta_id: 'cuenta-1' }));
    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledOnce();
  });
});
