import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const updateMock = vi.fn();

let respuestaIngresoActual: { data: unknown; error: unknown } = {
  data: { espacio_id: '11111111-1111-1111-1111-111111111111' },
  error: null,
};
let respuestaCategoria: { data: unknown; error: unknown } = { data: null, error: null };
let respuestaCuenta: { data: unknown; error: unknown } = { data: null, error: null };
let respuestaUpdate: { data: unknown; error: unknown } = { data: { id: 'ingreso-1' }, error: null };

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
        if (tabla === 'cuentas_bancarias') {
          return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(respuestaCuenta) }) }) };
        }
        // tabla 'ingresos': select() para leer el espacio_id actual, update() para el PATCH
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(respuestaIngresoActual) }) }),
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
  return new NextRequest('http://localhost/api/ingresos/ingreso-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function contexto() {
  return { params: Promise.resolve({ id: 'ingreso-1' }) };
}

beforeEach(() => {
  updateMock.mockClear();
  respuestaIngresoActual = { data: { espacio_id: '11111111-1111-1111-1111-111111111111' }, error: null };
  respuestaCategoria = { data: null, error: null };
  respuestaCuenta = { data: null, error: null };
  respuestaUpdate = { data: { id: 'ingreso-1' }, error: null };
});

describe('PATCH /api/ingresos/[id]', () => {
  it('no comprueba nada si no se cambia categoria_id ni cuenta_id', async () => {
    const res = await PATCH(crearRequest({ descripcion: 'Nueva descripción' }), contexto());
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it('rechaza repuntar cuenta_id a una cuenta de otro espacio', async () => {
    respuestaCuenta = { data: { id: 'cuenta-otro', espacio_id: 'otro-espacio' }, error: null };
    const res = await PATCH(crearRequest({ cuenta_id: 'cuenta-otro' }), contexto());
    const cuerpo = await res.json();
    expect(res.status).toBe(400);
    expect(cuerpo.error).toMatch(/mismo espacio/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rechaza repuntar categoria_id a una categoría de otro espacio', async () => {
    respuestaCategoria = { data: { id: 'cat-otro', tipo: 'ingreso', espacio_id: 'otro-espacio' }, error: null };
    const res = await PATCH(crearRequest({ categoria_id: 'cat-otro' }), contexto());
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('acepta repuntar a una categoría/cuenta del mismo espacio', async () => {
    const espacioId = '11111111-1111-1111-1111-111111111111';
    respuestaCategoria = { data: { id: 'cat-1', tipo: 'ingreso', espacio_id: espacioId }, error: null };
    respuestaCuenta = { data: { id: 'cuenta-1', espacio_id: espacioId }, error: null };
    const res = await PATCH(crearRequest({ categoria_id: 'cat-1', cuenta_id: 'cuenta-1' }), contexto());
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it('devuelve 404 si el ingreso no existe o no hay acceso a él', async () => {
    respuestaIngresoActual = { data: null, error: null };
    const res = await PATCH(crearRequest({ cuenta_id: 'cuenta-1' }), contexto());
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
