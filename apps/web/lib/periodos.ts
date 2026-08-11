export type PeriodoTipo = 'mensual' | 'anual';

/** Calcula la fecha de fin (exclusiva) de un periodo, para consultas de rango. */
export function finDePeriodo(periodoInicio: string, periodoTipo: PeriodoTipo): string {
  const fecha = new Date(periodoInicio + 'T00:00:00Z');
  if (periodoTipo === 'mensual') {
    fecha.setUTCMonth(fecha.getUTCMonth() + 1);
  } else {
    fecha.setUTCFullYear(fecha.getUTCFullYear() + 1);
  }
  return fecha.toISOString().slice(0, 10);
}
