/**
 * Parámetros de un préstamo/hipoteca a sistema de amortización francés
 * (cuota constante), que es el sistema usado en las hojas de cálculo
 * originales (Nissan, Hipoteca ECajR).
 */
export interface ParametrosPrestamo {
  /** Capital inicial prestado. */
  capitalInicial: number;
  /** Tipo de interés nominal anual, como decimal (ej. 0.031 = 3.1%). */
  tipoInteresAnual: number;
  /** Número de cuotas mensuales del préstamo. */
  plazoMeses: number;
  /** Fecha de la primera cuota (ISO 8601, ej. "2026-01-13"). */
  fechaPrimeraCuota: string;
  /** Amortizaciones anticipadas opcionales a aplicar durante la vida del préstamo. */
  amortizacionesExtra?: AmortizacionExtra[];
  /**
   * Cambios de tipo de interés a aplicar (revisiones de hipoteca variable
   * o fin del tramo fijo en una mixta). El motor NO calcula ni conoce el
   * Euribor ni ningún índice — recibe el tipo total ya resuelto (índice +
   * diferencial) que la aplicación le pase, con el valor real publicado
   * el día de la revisión.
   */
  cambiosTipoInteres?: CambioTipoInteres[];
}

export interface CambioTipoInteres {
  /** Número de cuota (1-indexado) desde la que se aplica el nuevo tipo. */
  numeroCuota: number;
  /** Nuevo tipo de interés nominal anual, como decimal (ej. 0.045 = 4.5%). */
  nuevoTipoInteresAnual: number;
}

export interface AmortizacionExtra {
  /** Número de cuota (1-indexado) tras la cual se aplica la amortización extra. */
  numeroCuota: number;
  /** Importe adicional aplicado a capital en ese momento. */
  importe: number;
  /**
   * Estrategia tras la amortización extra:
   * - 'reducir_cuota': se mantiene el plazo restante, baja el importe de la cuota.
   * - 'reducir_plazo': se mantiene la cuota, se reduce el número de cuotas restantes.
   */
  estrategia: 'reducir_cuota' | 'reducir_plazo';
}

export interface FilaAmortizacion {
  numeroCuota: number;
  fecha: string;
  cuota: number;
  capital: number;
  intereses: number;
  capitalPendiente: number;
  esAmortizacionExtra: boolean;
  /** Tipo de interés nominal anual usado para calcular esta fila (decimal, ej. 0.031). */
  tipoInteresAnualAplicado: number;
}

export interface ResultadoAmortizacion {
  /** Cuota mensual inicial (antes de cualquier amortización extra). */
  cuotaInicial: number;
  /** Cuadro completo, una fila por cuota efectivamente pagada. */
  cuadro: FilaAmortizacion[];
  /** Totales acumulados a lo largo de toda la vida del préstamo. */
  totales: {
    totalCapitalAmortizado: number;
    totalIntereses: number;
    totalPagado: number;
    numeroCuotasReales: number;
  };
}
