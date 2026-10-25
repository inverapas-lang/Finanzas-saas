import type {
  DesgloseCategoria,
  ParametrosProyeccion,
  Periodicidad,
  ReglaRecurrente,
  ResultadoProyeccion,
} from './types';

function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function sumarIntervalo(fechaIso: string, periodicidad: Periodicidad): string {
  const fecha = new Date(fechaIso + 'T00:00:00Z');
  switch (periodicidad) {
    case 'semanal':
      fecha.setUTCDate(fecha.getUTCDate() + 7);
      break;
    case 'mensual':
      fecha.setUTCMonth(fecha.getUTCMonth() + 1);
      break;
    case 'bimestral':
      fecha.setUTCMonth(fecha.getUTCMonth() + 2);
      break;
    case 'trimestral':
      fecha.setUTCMonth(fecha.getUTCMonth() + 3);
      break;
    case 'semestral':
      fecha.setUTCMonth(fecha.getUTCMonth() + 6);
      break;
    case 'anual':
      fecha.setUTCFullYear(fecha.getUTCFullYear() + 1);
      break;
    case 'unico':
      return fechaIso; // no se repite; el llamador no debe iterar sobre 'unico'
  }
  return fecha.toISOString().slice(0, 10);
}

/**
 * Genera las fechas de ocurrencia de una regla recurrente entre
 * (fechaDesde, fechaHasta], usando fechaInicio de la regla como ancla
 * del ciclo (para no desalinear el día del mes/año en cada iteración).
 *
 * Convención importante: fechaDesde es EXCLUSIVA. Si una ocurrencia cae
 * exactamente en fechaDesde (normalmente "hoy"), se considera que ese día
 * ya ha transcurrido y por tanto ya debería existir como movimiento real
 * (materializado), no como proyección. Esto evita que el día de corte se
 * cuente dos veces si el job de materialización ya generó la fila de hoy.
 */
export function generarOcurrencias(
  regla: ReglaRecurrente,
  fechaDesde: string,
  fechaHasta: string
): string[] {
  if (regla.periodicidad === 'unico' || !regla.activa) return [];

  const ocurrencias: string[] = [];
  let cursor = regla.fechaInicio;
  const limiteInferior = regla.fechaInicio > fechaDesde ? regla.fechaInicio : fechaDesde;
  const limiteSuperior =
    regla.fechaFin && regla.fechaFin < fechaHasta ? regla.fechaFin : fechaHasta;

  let salvaguarda = 0;
  while (cursor <= limiteSuperior && salvaguarda < 2000) {
    if (cursor > fechaDesde && cursor >= limiteInferior) {
      ocurrencias.push(cursor);
    }
    cursor = sumarIntervalo(cursor, regla.periodicidad);
    salvaguarda += 1;
  }
  return ocurrencias;
}

/**
 * Calcula la proyección de ingresos/gastos entre fechaCorte y fechaObjetivo,
 * combinando:
 *  - Movimientos reales ya confirmados (cobrados/pagados) hasta fechaCorte.
 *  - Movimientos reales ya registrados pero aún pendientes (fecha futura, no cobrados).
 *  - Ocurrencias futuras de reglas recurrentes que todavía no se han
 *    materializado como fila de ingreso/gasto (se detectan por
 *    reglaRecurrenteId + fecha ya presente en movimientosReales).
 */
export function calcularProyeccion(params: ParametrosProyeccion): ResultadoProyeccion {
  const { fechaCorte, fechaObjetivo, reglasRecurrentes, movimientosReales } = params;

  if (fechaObjetivo < fechaCorte) {
    throw new Error('fechaObjetivo no puede ser anterior a fechaCorte');
  }

  let realConfirmadoIngresos = 0;
  let realConfirmadoGastos = 0;
  let pendienteIngresos = 0;
  let pendienteGastos = 0;

  const desglosePorCategoriaMap = new Map<string | null, DesgloseCategoria>();
  const materializadas = new Set<string>(); // clave `${reglaId}:${fecha}`

  const acumularCategoria = (
    categoriaId: string | null,
    tipo: 'ingreso' | 'gasto',
    importe: number
  ) => {
    const existente = desglosePorCategoriaMap.get(categoriaId) ?? {
      categoriaId,
      totalIngresos: 0,
      totalGastos: 0,
    };
    if (tipo === 'ingreso') existente.totalIngresos += importe;
    else existente.totalGastos += importe;
    desglosePorCategoriaMap.set(categoriaId, existente);
  };

  for (const mov of movimientosReales) {
    const importe = mov.importeReal ?? mov.importeEsperado;

    if (mov.reglaRecurrenteId) {
      materializadas.add(`${mov.reglaRecurrenteId}:${mov.fecha}`);
    }

    if (mov.cobradoOPagado && mov.fecha <= fechaCorte) {
      if (mov.tipo === 'ingreso') realConfirmadoIngresos += importe;
      else realConfirmadoGastos += importe;
      acumularCategoria(mov.categoriaId, mov.tipo, importe);
    } else if (!mov.cobradoOPagado && mov.fecha > fechaCorte && mov.fecha <= fechaObjetivo) {
      if (mov.tipo === 'ingreso') pendienteIngresos += importe;
      else pendienteGastos += importe;
      acumularCategoria(mov.categoriaId, mov.tipo, importe);
    }
  }

  let proyectadoRecurrenteIngresos = 0;
  let proyectadoRecurrenteGastos = 0;

  for (const regla of reglasRecurrentes) {
    const ocurrencias = generarOcurrencias(regla, fechaCorte, fechaObjetivo);
    for (const fecha of ocurrencias) {
      const clave = `${regla.id}:${fecha}`;
      if (materializadas.has(clave)) continue; // ya está contada como movimiento real/pendiente

      if (regla.tipo === 'ingreso') proyectadoRecurrenteIngresos += regla.importe;
      else proyectadoRecurrenteGastos += regla.importe;
      acumularCategoria(regla.categoriaId, regla.tipo, regla.importe);
    }
  }

  const proyectadoIngresos = redondear(pendienteIngresos + proyectadoRecurrenteIngresos);
  const proyectadoGastos = redondear(pendienteGastos + proyectadoRecurrenteGastos);
  const totalEstimadoIngresos = redondear(realConfirmadoIngresos + proyectadoIngresos);
  const totalEstimadoGastos = redondear(realConfirmadoGastos + proyectadoGastos);

  return {
    fechaCorte,
    fechaObjetivo,
    realConfirmadoIngresos: redondear(realConfirmadoIngresos),
    realConfirmadoGastos: redondear(realConfirmadoGastos),
    proyectadoIngresos,
    proyectadoGastos,
    totalEstimadoIngresos,
    totalEstimadoGastos,
    saldoEstimado: redondear(totalEstimadoIngresos - totalEstimadoGastos),
    desglosePorCategoria: Array.from(desglosePorCategoriaMap.values()).map((d) => ({
      categoriaId: d.categoriaId,
      totalIngresos: redondear(d.totalIngresos),
      totalGastos: redondear(d.totalGastos),
    })),
  };
}
