import type { TransaccionExterna } from './gocardless';

export interface MovimientoASincronizar {
  tipo: 'ingreso' | 'gasto';
  transaccionExternaId: string;
  descripcion: string;
  importe: number; // siempre positivo
  fecha: string;
}

/**
 * Decide qué transacciones traídas del banco son realmente nuevas (no
 * están ya en `yaImportadas`, el conjunto de transaccion_externa_id que
 * ya tienen fila en transacciones_externas) y las traduce al formato que
 * usan ingresos/gastos: signo del importe -> tipo, valor absoluto ->
 * importe. Función pura, sin I/O, para poder testear la parte con más
 * riesgo de bugs (deduplicación, signo) sin depender de la API de
 * GoCardless ni de Supabase.
 */
export function mapearTransaccionesNuevas(
  transacciones: TransaccionExterna[],
  yaImportadas: ReadonlySet<string>
): MovimientoASincronizar[] {
  const nuevas: MovimientoASincronizar[] = [];

  for (const t of transacciones) {
    if (yaImportadas.has(t.transaccionExternaId)) continue;
    if (t.importe === 0) continue; // p. ej. anotaciones informativas sin efecto en el saldo

    nuevas.push({
      tipo: t.importe > 0 ? 'ingreso' : 'gasto',
      transaccionExternaId: t.transaccionExternaId,
      descripcion: t.descripcion,
      importe: Math.abs(t.importe),
      fecha: t.fecha,
    });
  }

  return nuevas;
}
