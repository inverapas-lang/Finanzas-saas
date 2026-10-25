export type EntidadDocumental = 'ingreso' | 'gasto' | 'activo' | 'pasivo';

/**
 * Construye la ruta de Storage para un documento, siguiendo la convención
 * que exigen las políticas RLS del bucket "documentos" (ver migración
 * 0009): el primer segmento de la ruta debe ser el espacio_id.
 *
 * Sanea el nombre de archivo para evitar caracteres problemáticos en
 * rutas de Storage (espacios, tildes, símbolos) — Supabase Storage admite
 * casi cualquier carácter, pero mantenerlo simple evita sorpresas con
 * codificación de URLs al descargar.
 */
export function construirRutaDocumento(
  espacioId: string,
  entidadTipo: EntidadDocumental,
  entidadId: string,
  nombreArchivoOriginal: string
): string {
  const nombreSaneado = nombreArchivoOriginal
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes/diacríticos
    .replace(/[^a-zA-Z0-9.\-_]/g, '_') // sustituye cualquier otro carácter raro por _
    .slice(0, 100); // límite razonable de longitud

  const sufijoUnico = crypto.randomUUID().slice(0, 8);

  return `${espacioId}/${entidadTipo}/${entidadId}/${sufijoUnico}-${nombreSaneado}`;
}
