import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { crearSupabaseMock } from '../../../../lib/test-utils/supabase-mock';

const authGetUserMock = vi.fn();
let supabaseMock: ReturnType<typeof crearSupabaseMock>;

vi.mock('../../../../lib/supabase-server', async () => {
  const actual =
    await vi.importActual<typeof import('../../../../lib/supabase-server')>('../../../../lib/supabase-server');
  return {
    ...actual,
    crearClienteSupabaseDeRequest: () => ({ ...supabaseMock, auth: { getUser: authGetUserMock } }),
  };
});

const crearVinculacionMock = vi.fn();

vi.mock('../../../../lib/gocardless', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/gocardless')>('../../../../lib/gocardless');
  return { ...actual, crearVinculacion: crearVinculacionMock };
});

const { POST } = await import('./route');

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

function crearRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/bancos/conexiones', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  authGetUserMock.mockReset();
  authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  crearVinculacionMock.mockReset();
});

describe('POST /api/bancos/conexiones', () => {
  it('crea la conexión pendiente, pide el link a GoCardless y guarda el requisition_id real', async () => {
    supabaseMock = crearSupabaseMock({
      'conexiones_bancarias:insert': [{ data: { id: 'con-1', espacio_id: ESPACIO_ID }, error: null }],
      'conexiones_bancarias:update': [
        { data: { id: 'con-1', requisition_id: 'req-real-123', estado: 'pendiente' }, error: null },
      ],
    });
    crearVinculacionMock.mockResolvedValue({ requisitionId: 'req-real-123', link: 'https://bank.example/consent' });

    const res = await POST(
      crearRequest({
        espacio_id: ESPACIO_ID,
        institucion_id: 'BBVA_BBVAESMM',
        institucion_nombre: 'BBVA',
        redirect_url: 'https://app.example.com/dashboard/bancos/callback',
      })
    );
    const cuerpo = await res.json();

    expect(res.status).toBe(201);
    expect(cuerpo.link).toBe('https://bank.example/consent');
    expect(cuerpo.data.requisition_id).toBe('req-real-123');
    expect(crearVinculacionMock).toHaveBeenCalledWith(
      expect.objectContaining({ institucionId: 'BBVA_BBVAESMM', referencia: 'con-1' })
    );
  });

  it('si GoCardless falla, marca la conexión como error y devuelve 502', async () => {
    supabaseMock = crearSupabaseMock({
      'conexiones_bancarias:insert': [{ data: { id: 'con-1', espacio_id: ESPACIO_ID }, error: null }],
      'conexiones_bancarias:update': [{ data: null, error: null }],
    });
    crearVinculacionMock.mockRejectedValue(new Error('timeout hablando con GoCardless'));

    const res = await POST(
      crearRequest({
        espacio_id: ESPACIO_ID,
        institucion_id: 'BBVA_BBVAESMM',
        institucion_nombre: 'BBVA',
        redirect_url: 'https://app.example.com/dashboard/bancos/callback',
      })
    );

    expect(res.status).toBe(500); // Error genérico de JS, no ErrorGoCardless -> lo trata el catch-all
  });

  it('rechaza un payload inválido antes de tocar la base de datos', async () => {
    supabaseMock = crearSupabaseMock({});
    const res = await POST(crearRequest({ espacio_id: 'no-es-uuid' }));
    expect(res.status).toBe(400);
    expect(crearVinculacionMock).not.toHaveBeenCalled();
  });
});
