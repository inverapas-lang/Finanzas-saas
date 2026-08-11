import { ErrorApi } from './supabase-server';

export type TipoMovimientoCategoria = 'ingreso' | 'gasto';

export interface PayloadCategoria {
  espacio_id: string;
  tipo: TipoMovimientoCategoria;
  nombre: string;
  categoria_padre_id: string | null;
  color: string | null;
  icono: string | null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarPayloadCategoria(body: unknown): PayloadCategoria {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }
  if (b.tipo !== 'ingreso' && b.tipo !== 'gasto') {
    throw new ErrorApi(400, 'tipo debe ser "ingreso" o "gasto"');
  }
  if (typeof b.nombre !== 'string' || b.nombre.trim().length === 0) {
    throw new ErrorApi(400, 'nombre no puede estar vacío');
  }
  if (
    b.categoria_padre_id !== undefined &&
    b.categoria_padre_id !== null &&
    (typeof b.categoria_padre_id !== 'string' || !UUID_REGEX.test(b.categoria_padre_id))
  ) {
    throw new ErrorApi(400, 'categoria_padre_id debe ser un UUID válido si se indica');
  }

  return {
    espacio_id: b.espacio_id,
    tipo: b.tipo,
    nombre: b.nombre.trim(),
    categoria_padre_id: (b.categoria_padre_id as string) ?? null,
    color: typeof b.color === 'string' ? b.color : null,
    icono: typeof b.icono === 'string' ? b.icono : null,
  };
}
