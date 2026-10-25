import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { crearSupabaseMock } from '../../../../../../lib/test-utils/supabase-mock';

let supabaseMock: ReturnType<typeof crearSupabaseMock>;

vi.mock('../../../../../../lib/supabase-server', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../lib/supabase-server')>(
    '../../../../../../lib/supabase-server'
  );
  return { ...actual, crearClienteSupabaseDeRequest: () => supabaseMock };
});

const obtenerRequisitionMock = vi.fn();
const obtenerDetalleCuentaMock = vi.fn();

vi.mock('../../../../../../lib/gocardless', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../lib/gocardless')>(
    '../../../../../../lib/gocardless'
  );
  return { ...actual, obtenerRequisition: obtenerRequisitionMock, obtenerDetalleCuenta: obtenerDetalleCuentaMock };
});

const { POST } = await import('./route');

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

function crearRequest(): NextRequest {
  return new NextRequest('http://localhost/api/bancos/conexiones/con-1/finalizar', { method: 'POST' });
}

function contexto(id = 'con-1') {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  obtenerRequisitionMock.mockReset();
  obtenerDetalleCuentaMock.mockReset();
});

describe('POST /api/bancos/conexiones/[id]/finalizar', () => {
  it('reutiliza una cuenta existente por IBAN y crea una nueva para la cuenta sin coincidencia', async () => {
    supabaseMock = crearSupabaseMock({
      'conexiones_bancarias:select': [
        {
          data: { id: 'con-1', espacio_id: ESPACIO_ID, requisition_id: 'req-1' },
          error: null,
        },
      ],
      'cuentas_bancarias:select': [
        { data: [{ id: 'cuenta-existente', iban: 'ES1234567890' }], error: null },
      ],
      'cuentas_bancarias:update': [{ data: { id: 'cuenta-existente', iban: 'ES1234567890' }, error: null }],
      'cuentas_bancarias:insert': [{ data: { id: 'cuenta-nueva', nombre: 'Cuenta Nómina' }, error: null }],
      'conexiones_bancarias:update': [{ data: { id: 'con-1', estado: 'vinculada' }, error: null }],
    });

    obtenerRequisitionMock.mockResolvedValue({
      id: 'req-1',
      status: 'LN',
      accounts: ['ext-existente', 'ext-nueva'],
    });
    obtenerDetalleCuentaMock.mockImplementation((cuentaExternaId: string) => {
      if (cuentaExternaId === 'ext-existente') {
        return Promise.resolve({ iban: 'ES1234567890', nombre: 'Cuenta ya conocida', moneda: 'EUR' });
      }
      return Promise.resolve({ iban: 'ES9999999999', nombre: 'Cuenta Nómina', moneda: 'EUR' });
    });

    const res = await POST(crearRequest(), contexto());
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.data.conexion.estado).toBe('vinculada');
    expect(cuerpo.data.cuentas).toHaveLength(2);
    expect(cuerpo.data.cuentas.map((c: { id: string }) => c.id)).toEqual(['cuenta-existente', 'cuenta-nueva']);
  });

  it('si la requisition no quedó vinculada (ej. usuario rechazó), devuelve 409 y no toca cuentas_bancarias', async () => {
    supabaseMock = crearSupabaseMock({
      'conexiones_bancarias:select': [
        { data: { id: 'con-1', espacio_id: ESPACIO_ID, requisition_id: 'req-1' }, error: null },
      ],
      'conexiones_bancarias:update': [{ data: null, error: null }],
    });
    obtenerRequisitionMock.mockResolvedValue({ id: 'req-1', status: 'RJ', accounts: [] });

    const res = await POST(crearRequest(), contexto());
    expect(res.status).toBe(409);
    expect(obtenerDetalleCuentaMock).not.toHaveBeenCalled();
  });

  it('devuelve 404 si la conexión no existe o no es del usuario', async () => {
    supabaseMock = crearSupabaseMock({
      'conexiones_bancarias:select': [{ data: null, error: null }],
    });
    const res = await POST(crearRequest(), contexto());
    expect(res.status).toBe(404);
  });
});
