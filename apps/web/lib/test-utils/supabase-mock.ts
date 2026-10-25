/**
 * Mock mínimo del query builder de supabase-js para testear rutas que
 * encadenan varias llamadas a supabase.from(tabla)... sin depender de un
 * Supabase real. Las respuestas se configuran por clave "tabla:operacion"
 * como una cola FIFO: cada llamada real a esa combinación consume la
 * siguiente respuesta configurada, en el orden en que ocurren en la ruta.
 */
export interface RespuestaSupabase {
  data: unknown;
  error: { message: string; code?: string } | null;
}

type Operacion = 'select' | 'insert' | 'update' | 'delete';

export function crearSupabaseMock(respuestasPorClave: Record<string, RespuestaSupabase[]>) {
  const colas = new Map<string, RespuestaSupabase[]>(
    Object.entries(respuestasPorClave).map(([clave, respuestas]) => [clave, [...respuestas]])
  );

  function siguienteRespuesta(tabla: string, operacion: Operacion): RespuestaSupabase {
    const clave = `${tabla}:${operacion}`;
    const cola = colas.get(clave);
    if (!cola || cola.length === 0) {
      throw new Error(`crearSupabaseMock: no hay más respuestas configuradas para "${clave}"`);
    }
    return cola.shift()!;
  }

  function construirCadena(tabla: string, operacion: Operacion) {
    const cadena = {
      eq: () => cadena,
      order: () => cadena,
      select: () => cadena,
      single: () => Promise.resolve(siguienteRespuesta(tabla, operacion)),
      maybeSingle: () => Promise.resolve(siguienteRespuesta(tabla, operacion)),
      then: (onResolve: (r: RespuestaSupabase) => unknown, onReject?: (e: unknown) => unknown) =>
        Promise.resolve(siguienteRespuesta(tabla, operacion)).then(onResolve, onReject),
    };
    return cadena;
  }

  return {
    from: (tabla: string) => ({
      select: () => construirCadena(tabla, 'select'),
      insert: () => construirCadena(tabla, 'insert'),
      update: () => construirCadena(tabla, 'update'),
      delete: () => construirCadena(tabla, 'delete'),
    }),
  };
}
