import { ErrorApi } from './supabase-server';
import {
  validarCambiosMovimiento,
  validarPayloadMovimiento,
} from './validacion-movimientos';
import {
  validarCambiosPatrimonioHistoricoItem,
  validarPayloadPatrimonioHistoricoItem,
} from './validacion-patrimonio-historico-item';
import {
  CAMPOS_EDITABLES,
  type AccionCambio,
  type EntidadEditable,
  type ValorCampo,
} from './tipos-propuesta';

export interface CambioValidado {
  accion: AccionCambio;
  entidad: EntidadEditable;
  id: string | null;
  valores: Record<string, ValorCampo>;
}

export interface PropuestaValidada {
  resumen: string;
  cambios: CambioValidado[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCIONES: AccionCambio[] = ['modificar', 'crear', 'eliminar'];
const ENTIDADES: EntidadEditable[] = ['gasto', 'ingreso', 'patrimonio_item'];

/** Límite defensivo: una propuesta enorme es inmanejable de revisar a mano. */
export const MAX_CAMBIOS_POR_PROPUESTA = 50;

/**
 * Valida la propuesta que la IA manda con la herramienta proponer_cambios.
 * Función PURA (sin Supabase): comprueba forma, campos permitidos y
 * valores con los MISMOS validadores que usan las rutas de API, para que
 * una propuesta que se enseña al usuario no falle después al aplicarla
 * por un formato incorrecto. La existencia de los registros y la
 * pertenencia al espacio se comprueban aparte, contra la base de datos.
 *
 * Los errores se devuelven a la IA como resultado de la herramienta, para
 * que corrija la propuesta — por eso los mensajes son explícitos.
 */
export function validarPropuesta(input: unknown, espacioId: string): PropuestaValidada {
  if (typeof input !== 'object' || input === null) {
    throw new ErrorApi(400, 'La propuesta debe ser un objeto con "resumen" y "cambios"');
  }
  const p = input as Record<string, unknown>;

  if (typeof p.resumen !== 'string' || p.resumen.trim() === '') {
    throw new ErrorApi(400, 'resumen es obligatorio: una frase que explique los cambios');
  }
  if (!Array.isArray(p.cambios) || p.cambios.length === 0) {
    throw new ErrorApi(400, 'cambios debe ser una lista con al menos un cambio');
  }
  if (p.cambios.length > MAX_CAMBIOS_POR_PROPUESTA) {
    throw new ErrorApi(
      400,
      `Como máximo ${MAX_CAMBIOS_POR_PROPUESTA} cambios por propuesta; divídela en varias`
    );
  }

  const cambios = p.cambios.map((c, indice) => {
    try {
      return validarCambio(c, espacioId);
    } catch (err) {
      if (err instanceof ErrorApi) {
        throw new ErrorApi(err.status, `cambios[${indice}]: ${err.message}`);
      }
      throw err;
    }
  });

  return { resumen: p.resumen.trim(), cambios };
}

function validarCambio(input: unknown, espacioId: string): CambioValidado {
  if (typeof input !== 'object' || input === null) {
    throw new ErrorApi(400, 'cada cambio debe ser un objeto');
  }
  const c = input as Record<string, unknown>;

  if (!ACCIONES.includes(c.accion as AccionCambio)) {
    throw new ErrorApi(400, `accion debe ser una de: ${ACCIONES.join(', ')}`);
  }
  if (!ENTIDADES.includes(c.entidad as EntidadEditable)) {
    throw new ErrorApi(400, `entidad debe ser una de: ${ENTIDADES.join(', ')}`);
  }
  const accion = c.accion as AccionCambio;
  const entidad = c.entidad as EntidadEditable;

  let id: string | null = null;
  if (accion === 'crear') {
    if (c.id !== undefined && c.id !== null) {
      throw new ErrorApi(400, 'un cambio "crear" no lleva id');
    }
  } else {
    if (typeof c.id !== 'string' || !UUID_REGEX.test(c.id)) {
      throw new ErrorApi(400, `un cambio "${accion}" necesita el id (UUID) del registro`);
    }
    id = c.id;
  }

  if (accion === 'eliminar') {
    return { accion, entidad, id, valores: {} };
  }

  if (typeof c.valores !== 'object' || c.valores === null || Array.isArray(c.valores)) {
    throw new ErrorApi(400, 'valores debe ser un objeto con los campos a fijar');
  }
  const valores: Record<string, ValorCampo> = {};
  const permitidos = CAMPOS_EDITABLES[entidad][accion];
  for (const [campo, valor] of Object.entries(c.valores as Record<string, unknown>)) {
    if (!permitidos.includes(campo)) {
      throw new ErrorApi(
        400,
        `el campo "${campo}" no se puede ${accion === 'crear' ? 'fijar al crear' : 'modificar'} en ${entidad}. Permitidos: ${permitidos.join(', ')}`
      );
    }
    if (valor !== null && typeof valor !== 'string' && typeof valor !== 'number') {
      throw new ErrorApi(400, `el campo "${campo}" debe ser texto, número o null`);
    }
    valores[campo] = valor as ValorCampo;
  }
  if (Object.keys(valores).length === 0) {
    throw new ErrorApi(400, 'valores no puede estar vacío');
  }

  if (entidad === 'patrimonio_item') {
    if (accion === 'crear') {
      validarPayloadPatrimonioHistoricoItem({ ...valores, espacio_id: espacioId });
    } else {
      validarCambiosPatrimonioHistoricoItem(valores);
    }
  } else if (accion === 'crear') {
    validarPayloadMovimiento({ ...valores, espacio_id: espacioId }, entidad);
  } else {
    validarCambiosMovimiento(valores, entidad);
    if (valores.categoria_id !== undefined && valores.categoria_id !== null) {
      if (typeof valores.categoria_id !== 'string' || !UUID_REGEX.test(valores.categoria_id)) {
        throw new ErrorApi(400, 'categoria_id debe ser un UUID válido');
      }
    }
  }

  return { accion, entidad, id, valores };
}
