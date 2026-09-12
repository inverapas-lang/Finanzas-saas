import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const insertMock = vi.fn();
const authGetUserMock = vi.fn();

vi.mock('../../../../lib/supabase-server', async () => {
  const actual =
    await vi.importActual<typeof import('../../../../lib/supabase-server')>('../../../../lib/supabase-server');
  return {
    ...actual,
    crearClienteSupabaseDeRequest: () => ({
      auth: { getUser: authGetUserMock },
      from: (tabla: string) => ({
        insert: (rows: Record<string, unknown>[]) => {
          insertMock(tabla, rows);
          return {
            select: () =>
              Promise.resolve({
                data: rows.map((fila, i) => ({ id: `id-${i}`, ...fila })),
                error: null,
              }),
          };
        },
      }),
    }),
  };
});

const { POST } = await import('./route');

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

function crearRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/movimientos/carga-masiva', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  insertMock.mockClear();
  authGetUserMock.mockReset();
  authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('POST /api/movimientos/carga-masiva', () => {
  it('rechaza un tipo que no sea ingreso/gasto', async () => {
    const res = await POST(crearRequest({ tipo: 'invalido', filas: [] }));
    expect(res.status).toBe(400);
  });

  it('rechaza un array de filas vacío', async () => {
    const res = await POST(crearRequest({ tipo: 'gasto', filas: [] }));
    expect(res.status).toBe(400);
  });

  it('rechaza más filas del límite permitido', async () => {
    const filas = Array.from({ length: 121 }, (_, i) => ({
      descripcion: `fila ${i}`,
      fecha_prevista: '2026-01-01',
      importe: 10,
    }));
    const res = await POST(crearRequest({ tipo: 'gasto', espacio_id: ESPACIO_ID, filas }));
    expect(res.status).toBe(400);
  });

  it('rechaza una fila inválida indicando su número', async () => {
    const res = await POST(
      crearRequest({
        tipo: 'gasto',
        espacio_id: ESPACIO_ID,
        filas: [
          { descripcion: 'Enero', fecha_prevista: '2026-01-01', importe: 100 },
          { descripcion: 'Febrero', fecha_prevista: '2026-02-01', importe: -5 },
        ],
      })
    );
    const cuerpo = await res.json();
    expect(res.status).toBe(400);
    expect(cuerpo.error).toMatch(/^Fila 2:/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('crea ingresos futuros no confirmados sin importe_real ni fecha_cobrada', async () => {
    const res = await POST(
      crearRequest({
        tipo: 'ingreso',
        espacio_id: ESPACIO_ID,
        categoria_id: null,
        cuenta_id: null,
        confirmados: false,
        filas: [{ descripcion: 'Dividendos — Enero 2027', fecha_prevista: '2027-01-05', importe: 200 }],
      })
    );
    expect(res.status).toBe(201);

    const [tabla, filas] = insertMock.mock.calls[0];
    expect(tabla).toBe('ingresos');
    expect(filas[0]).toMatchObject({
      espacio_id: ESPACIO_ID,
      importe_esperado: 200,
      fecha_prevista: '2027-01-05',
      created_by: 'user-1',
    });
    expect(filas[0].importe_real).toBeNull();
    expect(filas[0].fecha_cobrada).toBeNull();
  });

  it('crea gastos confirmados (histórico) con importe_real y fecha_pagada = fecha_prevista', async () => {
    const res = await POST(
      crearRequest({
        tipo: 'gasto',
        espacio_id: ESPACIO_ID,
        confirmados: true,
        filas: [
          { descripcion: 'Nómina — Enero 2025', fecha_prevista: '2025-01-31', importe: 1500 },
          { descripcion: 'Nómina — Febrero 2025', fecha_prevista: '2025-02-28', importe: 1500 },
        ],
      })
    );
    expect(res.status).toBe(201);

    const [tabla, filas] = insertMock.mock.calls[0];
    expect(tabla).toBe('gastos');
    expect(filas).toHaveLength(2);
    for (const fila of filas) {
      expect(fila.importe_real).toBe(1500);
      expect(fila.fecha_pagada).toBe(fila.fecha_prevista);
    }
  });

  it('rechaza la petición si no hay usuario autenticado', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      crearRequest({
        tipo: 'gasto',
        espacio_id: ESPACIO_ID,
        filas: [{ descripcion: 'x', fecha_prevista: '2026-01-01', importe: 10 }],
      })
    );
    expect(res.status).toBe(401);
  });
});
