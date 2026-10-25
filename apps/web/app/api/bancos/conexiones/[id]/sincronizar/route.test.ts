import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { crearSupabaseMock } from '../../../../../../lib/test-utils/supabase-mock';

const authGetUserMock = vi.fn();
let supabaseMock: ReturnType<typeof crearSupabaseMock>;

vi.mock('../../../../../../lib/supabase-server', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../lib/supabase-server')>(
    '../../../../../../lib/supabase-server'
  );
  return {
    ...actual,
    crearClienteSupabaseDeRequest: () => ({ ...supabaseMock, auth: { getUser: authGetUserMock } }),
  };
});

const obtenerTransaccionesMock = vi.fn();

vi.mock('../../../../../../lib/gocardless', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../lib/gocardless')>(
    '../../../../../../lib/gocardless'
  );
  return { ...actual, obtenerTransacciones: obtenerTransaccionesMock };
});

const { POST } = await import('./route');

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

function crearRequest(): NextRequest {
  return new NextRequest('http://localhost/api/bancos/conexiones/con-1/sincronizar', { method: 'POST' });
}

function contexto(id = 'con-1') {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  authGetUserMock.mockReset();
  authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  obtenerTransaccionesMock.mockReset();
});

describe('POST /api/bancos/conexiones/[id]/sincronizar', () => {
  it('crea un ingreso y un gasto nuevos, y registra ambos en transacciones_externas', async () => {
    supabaseMock = crearSupabaseMock({
      'conexiones_bancarias:select': [{ data: { id: 'con-1', estado: 'vinculada' }, error: null }],
      'cuentas_bancarias:select': [
        {
          data: [{ id: 'cuenta-1', cuenta_externa_id: 'ext-1', moneda: 'EUR', espacio_id: ESPACIO_ID }],
          error: null,
        },
      ],
      'transacciones_externas:select': [{ data: [], error: null }],
      'ingresos:insert': [{ data: { id: 'ingreso-creado' }, error: null }],
      'gastos:insert': [{ data: { id: 'gasto-creado' }, error: null }],
      'transacciones_externas:insert': [
        { data: null, error: null },
        { data: null, error: null },
      ],
      'cuentas_bancarias:update': [{ data: null, error: null }],
    });

    obtenerTransaccionesMock.mockResolvedValue([
      { transaccionExternaId: 'tx-in', importe: 1500, moneda: 'EUR', fecha: '2026-01-05', descripcion: 'Nómina' },
      { transaccionExternaId: 'tx-out', importe: -42.5, moneda: 'EUR', fecha: '2026-01-06', descripcion: 'Super' },
    ]);

    const res = await POST(crearRequest(), contexto());
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.data.totalCreados).toBe(2);
    expect(cuerpo.data.resumenPorCuenta).toEqual([{ cuentaId: 'cuenta-1', creados: 2 }]);
  });

  it('no crea nada si todas las transacciones ya estaban importadas', async () => {
    supabaseMock = crearSupabaseMock({
      'conexiones_bancarias:select': [{ data: { id: 'con-1', estado: 'vinculada' }, error: null }],
      'cuentas_bancarias:select': [
        {
          data: [{ id: 'cuenta-1', cuenta_externa_id: 'ext-1', moneda: 'EUR', espacio_id: ESPACIO_ID }],
          error: null,
        },
      ],
      'transacciones_externas:select': [{ data: [{ transaccion_externa_id: 'tx-in' }], error: null }],
      'cuentas_bancarias:update': [{ data: null, error: null }],
    });

    obtenerTransaccionesMock.mockResolvedValue([
      { transaccionExternaId: 'tx-in', importe: 1500, moneda: 'EUR', fecha: '2026-01-05', descripcion: 'Nómina' },
    ]);

    const res = await POST(crearRequest(), contexto());
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.data.totalCreados).toBe(0);
  });

  it('si falla registrar la transacción externa, deshace el movimiento creado en vez de dejarlo huérfano', async () => {
    supabaseMock = crearSupabaseMock({
      'conexiones_bancarias:select': [{ data: { id: 'con-1', estado: 'vinculada' }, error: null }],
      'cuentas_bancarias:select': [
        {
          data: [{ id: 'cuenta-1', cuenta_externa_id: 'ext-1', moneda: 'EUR', espacio_id: ESPACIO_ID }],
          error: null,
        },
      ],
      'transacciones_externas:select': [{ data: [], error: null }],
      'ingresos:insert': [{ data: { id: 'ingreso-creado' }, error: null }],
      'transacciones_externas:insert': [
        { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } },
      ],
      'ingresos:delete': [{ data: null, error: null }],
      'cuentas_bancarias:update': [{ data: null, error: null }],
    });

    obtenerTransaccionesMock.mockResolvedValue([
      { transaccionExternaId: 'tx-in', importe: 1500, moneda: 'EUR', fecha: '2026-01-05', descripcion: 'Nómina' },
    ]);

    const res = await POST(crearRequest(), contexto());
    const cuerpo = await res.json();

    // No debe contarse como creado: si se contara, la próxima sincronización
    // no volvería a intentarlo y el dinero de esa transacción se perdería.
    expect(res.status).toBe(200);
    expect(cuerpo.data.totalCreados).toBe(0);
  });

  it('rechaza sincronizar una conexión que no está vinculada', async () => {
    supabaseMock = crearSupabaseMock({
      'conexiones_bancarias:select': [{ data: { id: 'con-1', estado: 'pendiente' }, error: null }],
    });

    const res = await POST(crearRequest(), contexto());
    expect(res.status).toBe(409);
    expect(obtenerTransaccionesMock).not.toHaveBeenCalled();
  });
});
