import { ErrorApi } from './supabase-server';
import type { HojaExportable } from './exportar-tablas';

export interface PayloadExportarTablas {
  formato: 'xlsx' | 'pdf';
  titulo: string;
  hojas: HojaExportable[];
}

const MAX_HOJAS = 10;
const MAX_FILAS_POR_HOJA = 5000;

export function validarPayloadExportarTablas(body: unknown): PayloadExportarTablas {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (b.formato !== 'xlsx' && b.formato !== 'pdf') {
    throw new ErrorApi(400, 'formato debe ser "xlsx" o "pdf"');
  }
  if (typeof b.titulo !== 'string' || b.titulo.trim().length === 0) {
    throw new ErrorApi(400, 'titulo es obligatorio');
  }
  if (!Array.isArray(b.hojas) || b.hojas.length === 0) {
    throw new ErrorApi(400, 'hojas debe ser un array con al menos un elemento');
  }
  if (b.hojas.length > MAX_HOJAS) {
    throw new ErrorApi(400, `No se pueden exportar más de ${MAX_HOJAS} tablas de golpe`);
  }

  const hojas = b.hojas.map((hojaRaw, indice) => {
    if (typeof hojaRaw !== 'object' || hojaRaw === null) {
      throw new ErrorApi(400, `La hoja ${indice + 1} debe ser un objeto`);
    }
    const hoja = hojaRaw as Record<string, unknown>;

    if (typeof hoja.titulo !== 'string' || hoja.titulo.trim().length === 0) {
      throw new ErrorApi(400, `La hoja ${indice + 1} necesita un titulo`);
    }
    if (!Array.isArray(hoja.columnas) || hoja.columnas.some((c) => typeof c !== 'string')) {
      throw new ErrorApi(400, `La hoja ${indice + 1} necesita columnas (array de texto)`);
    }
    if (!Array.isArray(hoja.filas)) {
      throw new ErrorApi(400, `La hoja ${indice + 1} necesita filas (array de arrays)`);
    }
    if (hoja.filas.length > MAX_FILAS_POR_HOJA) {
      throw new ErrorApi(400, `La hoja ${indice + 1} supera el máximo de ${MAX_FILAS_POR_HOJA} filas`);
    }
    for (const fila of hoja.filas) {
      if (!Array.isArray(fila) || fila.some((celda) => typeof celda !== 'string' && typeof celda !== 'number')) {
        throw new ErrorApi(400, `La hoja ${indice + 1} tiene una fila con celdas que no son texto ni número`);
      }
    }

    return {
      titulo: hoja.titulo,
      columnas: hoja.columnas as string[],
      filas: hoja.filas as (string | number)[][],
    };
  });

  return { formato: b.formato, titulo: b.titulo.trim(), hojas };
}
