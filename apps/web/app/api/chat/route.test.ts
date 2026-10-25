import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';

const ESPACIO_ID = '11111111-1111-1111-1111-111111111111';

const createMock = vi.fn();
const ejecutarHerramientaMock = vi.fn();

// SDK real (para que Anthropic.APIError y compañía existan) pero sin red:
// beta.messages.create se sustituye por un mock.
vi.mock('@anthropic-ai/sdk', async () => {
  const actual = await vi.importActual<typeof import('@anthropic-ai/sdk')>('@anthropic-ai/sdk');
  class AnthropicFalso extends actual.default {
    constructor() {
      super({ apiKey: 'clave-de-prueba' });
      Object.defineProperty(this, 'beta', { value: { messages: { create: createMock } } });
    }
  }
  return { ...actual, default: AnthropicFalso };
});

vi.mock('../../../lib/supabase-server', async () => {
  const actual =
    await vi.importActual<typeof import('../../../lib/supabase-server')>('../../../lib/supabase-server');
  return {
    ...actual,
    crearClienteSupabaseDeRequest: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: ESPACIO_ID }, error: null }) }),
        }),
      }),
    }),
  };
});

vi.mock('../../../lib/obtener-datos-financieros', () => ({
  obtenerDatosFinancieros: async () => ({
    fecha: '2026-10-26',
    patrimonio: { totalActivos: 0, totalPasivos: 0, patrimonioNeto: 0 },
    activos: [],
    pasivos: [],
    proyeccionMes: { totalEstimadoIngresos: 0, totalEstimadoGastos: 0, saldoEstimado: 0 },
    gastosPorCategoriaUltimos3Meses: [],
    presupuestos: [],
  }),
}));

vi.mock('../../../lib/herramientas-asistente', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/herramientas-asistente')>(
    '../../../lib/herramientas-asistente'
  );
  return { ...actual, ejecutarHerramienta: ejecutarHerramientaMock };
});

const { POST } = await import('./route');

function peticion(mensajes: { rol: string; contenido: string }[]) {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify({ espacio_id: ESPACIO_ID, mensajes }),
    headers: { 'content-type': 'application/json' },
  });
}

function respuestaModelo(
  stop_reason: string,
  content: unknown[]
): Partial<Anthropic.Beta.BetaMessage> {
  return { stop_reason: stop_reason as Anthropic.Beta.BetaMessage['stop_reason'], content: content as Anthropic.Beta.BetaMessage['content'] };
}

const PROPUESTA = {
  resumen: 'Ajusto la luz',
  cambios: [
    {
      accion: 'modificar',
      entidad: 'gasto',
      id: '22222222-2222-2222-2222-222222222222',
      valores: { importe_previsto: 85 },
      antes: { importe_previsto: 92.4 },
      etiqueta: 'Luz · 2026-10-01',
    },
  ],
  categorias: {},
};

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'clave-de-prueba');
    createMock.mockReset();
    ejecutarHerramientaMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('responde 503 controlado si falta ANTHROPIC_API_KEY', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = await POST(peticion([{ rol: 'usuario', contenido: 'hola' }]));
    expect(res.status).toBe(503);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('responde con texto cuando el modelo no usa herramientas', async () => {
    createMock.mockResolvedValueOnce(
      respuestaModelo('end_turn', [{ type: 'text', text: 'Tu patrimonio neto es 0 €.' }])
    );

    const res = await POST(peticion([{ rol: 'usuario', contenido: '¿Patrimonio?' }]));
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.data).toEqual({ rol: 'asistente', contenido: 'Tu patrimonio neto es 0 €.', propuesta: null });
    const params = createMock.mock.calls[0][0];
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.tools.map((t: { name: string }) => t.name)).toContain('proponer_cambios');
  });

  it('ejecuta las herramientas, devuelve sus resultados al modelo y entrega la propuesta', async () => {
    createMock
      .mockResolvedValueOnce(
        respuestaModelo('tool_use', [
          { type: 'tool_use', id: 'tu_1', name: 'buscar_movimientos', input: { tipo: 'gasto' } },
          { type: 'tool_use', id: 'tu_2', name: 'proponer_cambios', input: { resumen: 'x', cambios: [] } },
        ])
      )
      .mockResolvedValueOnce(
        respuestaModelo('end_turn', [{ type: 'text', text: 'Te propongo bajar la luz a 85 €.' }])
      );
    ejecutarHerramientaMock
      .mockResolvedValueOnce({ contenido: '{"movimientos":[]}', esError: false })
      .mockResolvedValueOnce({ contenido: 'Propuesta mostrada', esError: false, propuesta: PROPUESTA });

    const res = await POST(peticion([{ rol: 'usuario', contenido: 'Pon la luz a 85' }]));
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.data.contenido).toBe('Te propongo bajar la luz a 85 €.');
    expect(cuerpo.data.propuesta).toEqual(PROPUESTA);

    // Segunda llamada: assistant con los tool_use y UN mensaje user con ambos resultados.
    const mensajes = createMock.mock.calls[1][0].messages;
    expect(mensajes).toHaveLength(3);
    expect(mensajes[2].role).toBe('user');
    expect(mensajes[2].content.map((b: { tool_use_id: string }) => b.tool_use_id)).toEqual(['tu_1', 'tu_2']);
  });

  it('marca como error el resultado de una herramienta que falla, para que el modelo corrija', async () => {
    createMock
      .mockResolvedValueOnce(
        respuestaModelo('tool_use', [
          { type: 'tool_use', id: 'tu_1', name: 'totales_movimientos', input: {} },
        ])
      )
      .mockResolvedValueOnce(respuestaModelo('end_turn', [{ type: 'text', text: 'Corregido.' }]));
    ejecutarHerramientaMock.mockResolvedValueOnce({ contenido: 'tipo debe ser...', esError: true });

    await POST(peticion([{ rol: 'usuario', contenido: 'Totales' }]));

    const resultado = createMock.mock.calls[1][0].messages[2].content[0];
    expect(resultado).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_1', is_error: true });
  });

  it('corta el bucle si el modelo encadena demasiadas consultas', async () => {
    createMock.mockResolvedValue(
      respuestaModelo('tool_use', [{ type: 'tool_use', id: 'tu', name: 'listar_categorias', input: {} }])
    );
    ejecutarHerramientaMock.mockResolvedValue({ contenido: '[]', esError: false });

    const res = await POST(peticion([{ rol: 'usuario', contenido: 'bucle' }]));

    expect(res.status).toBe(502);
    expect(createMock).toHaveBeenCalledTimes(10);
  });
});
