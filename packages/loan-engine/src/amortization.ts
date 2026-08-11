import type {
  AmortizacionExtra,
  CambioTipoInteres,
  FilaAmortizacion,
  ParametrosPrestamo,
  ResultadoAmortizacion,
} from './types';

const EPSILON = 0.005; // margen para considerar el capital pendiente saldado (redondeo a céntimos)
const LIMITE_SEGURIDAD_CUOTAS = 1200; // 100 años mensuales: evita bucles infinitos ante datos inconsistentes

function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function sumarMeses(fechaIso: string, meses: number): string {
  const fecha = new Date(fechaIso + 'T00:00:00Z');
  fecha.setUTCMonth(fecha.getUTCMonth() + meses);
  return fecha.toISOString().slice(0, 10);
}

/**
 * Cuota constante del sistema de amortización francés.
 * Si el tipo de interés es 0, es simplemente capital / nMeses.
 */
export function calcularCuotaFrancesa(
  capitalPendiente: number,
  tasaMensual: number,
  nMeses: number
): number {
  if (nMeses <= 0) {
    throw new Error('nMeses debe ser mayor que 0');
  }
  if (tasaMensual === 0) {
    return capitalPendiente / nMeses;
  }
  return (capitalPendiente * tasaMensual) / (1 - Math.pow(1 + tasaMensual, -nMeses));
}

/**
 * Número de cuotas restantes necesarias para saldar capitalPendiente
 * manteniendo una cuota fija (usado en estrategia 'reducir_plazo').
 */
export function calcularMesesRestantes(
  capitalPendiente: number,
  tasaMensual: number,
  cuota: number
): number {
  if (tasaMensual === 0) {
    return Math.ceil(capitalPendiente / cuota);
  }
  const numerador = Math.log(1 - (capitalPendiente * tasaMensual) / cuota);
  const denominador = Math.log(1 + tasaMensual);
  const n = -numerador / denominador;
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      'La cuota fijada es insuficiente para amortizar el capital pendiente a este tipo de interés'
    );
  }
  return Math.ceil(n);
}

/**
 * Genera el cuadro de amortización completo de un préstamo a cuota
 * constante (sistema francés), aplicando amortizaciones anticipadas y
 * cambios de tipo de interés (revisiones de hipoteca variable/mixta) si
 * se especifican.
 */
export function generarCuadroAmortizacion(
  params: ParametrosPrestamo
): ResultadoAmortizacion {
  const { capitalInicial, tipoInteresAnual, plazoMeses, fechaPrimeraCuota } = params;

  if (capitalInicial <= 0) throw new Error('capitalInicial debe ser mayor que 0');
  if (tipoInteresAnual < 0) throw new Error('tipoInteresAnual no puede ser negativo');
  if (plazoMeses <= 0) throw new Error('plazoMeses debe ser mayor que 0');

  for (const cambio of params.cambiosTipoInteres ?? []) {
    if (cambio.nuevoTipoInteresAnual < 0) {
      throw new Error(
        `cambiosTipoInteres: nuevoTipoInteresAnual no puede ser negativo (cuota ${cambio.numeroCuota})`
      );
    }
    if (cambio.numeroCuota < 1) {
      throw new Error('cambiosTipoInteres: numeroCuota debe ser mayor o igual a 1');
    }
  }

  let tipoInteresAnualActual = tipoInteresAnual;
  let tasaMensual = tipoInteresAnualActual / 12;

  const extrasPorCuota = new Map<number, AmortizacionExtra>();
  for (const extra of params.amortizacionesExtra ?? []) {
    extrasPorCuota.set(extra.numeroCuota, extra);
  }

  const cambiosPorCuota = new Map<number, CambioTipoInteres>();
  for (const cambio of params.cambiosTipoInteres ?? []) {
    cambiosPorCuota.set(cambio.numeroCuota, cambio);
  }

  // IMPORTANTE: capitalPendiente se mantiene SIEMPRE redondeado a céntimo
  // (igual que hace un banco en un extracto real). Los intereses de cada
  // cuota se calculan sobre ese saldo ya redondeado, y el capital de cada
  // fila se deriva de cuota - intereses (ambos ya redondeados). Así, por
  // construcción, se cumplen a la vez las dos condiciones que deben ser
  // ciertas en cualquier cuadro de amortización real:
  //   1) cuota = capital + intereses, exacto al céntimo, en cada fila.
  //   2) La suma de la columna "capital" de todas las filas = capital inicial.
  let capitalPendiente = redondear(capitalInicial);
  let mesesRestantes = plazoMeses;
  let cuotaFija = redondear(calcularCuotaFrancesa(capitalPendiente, tasaMensual, mesesRestantes));
  const cuotaInicial = cuotaFija;

  const cuadro: FilaAmortizacion[] = [];
  let numeroCuota = 1;

  while (capitalPendiente > EPSILON && numeroCuota <= LIMITE_SEGURIDAD_CUOTAS) {
    // Revisión de tipo de interés: si esta cuota coincide con una revisión
    // (fin de tramo fijo, o revisión periódica de variable), se recalcula
    // la cuota con el nuevo tipo ANTES de calcular los intereses de esta
    // misma cuota — así funciona en la práctica bancaria real: la cuota
    // revisada ya se cobra desde el primer pago tras la revisión.
    const cambio = cambiosPorCuota.get(numeroCuota);
    if (cambio) {
      tipoInteresAnualActual = cambio.nuevoTipoInteresAnual;
      tasaMensual = tipoInteresAnualActual / 12;
      cuotaFija = redondear(calcularCuotaFrancesa(capitalPendiente, tasaMensual, mesesRestantes));
    }

    const fecha = sumarMeses(fechaPrimeraCuota, numeroCuota - 1);
    const interesesRedondeados = redondear(capitalPendiente * tasaMensual);
    let capitalRedondeado = redondear(cuotaFija - interesesRedondeados);
    let cuotaFila = cuotaFija;

    // Última cuota: ajustamos para no dejar residuo por redondeo acumulado.
    // Dos condiciones, no solo una: además de "el cálculo ya supera el
    // pendiente", también forzamos el ajuste cuando esta es matemáticamente
    // la última cuota programada (mesesRestantes llega a 1). Sin esto,
    // en préstamos largos (ej. 300 cuotas) la acumulación de redondeo podía
    // dejar un residuo de algún céntimo que generaba una cuota 301 extra
    // — bug real que apareció al simular una amortización de 150.000€ a
    // 300 meses y 3,1%, detectado por los tests de este archivo.
    if (capitalRedondeado >= capitalPendiente || mesesRestantes <= 1) {
      capitalRedondeado = capitalPendiente;
      cuotaFila = redondear(capitalRedondeado + interesesRedondeados);
    }

    capitalPendiente = redondear(capitalPendiente - capitalRedondeado);

    cuadro.push({
      numeroCuota,
      fecha,
      cuota: cuotaFila,
      capital: capitalRedondeado,
      intereses: interesesRedondeados,
      capitalPendiente,
      esAmortizacionExtra: false,
      tipoInteresAnualAplicado: tipoInteresAnualActual,
    });

    mesesRestantes -= 1;

    const extra = extrasPorCuota.get(numeroCuota);
    if (extra && capitalPendiente > EPSILON) {
      const importeAplicado = redondear(Math.min(extra.importe, capitalPendiente));
      capitalPendiente = redondear(capitalPendiente - importeAplicado);

      cuadro.push({
        numeroCuota,
        fecha,
        cuota: importeAplicado,
        capital: importeAplicado,
        intereses: 0,
        capitalPendiente,
        esAmortizacionExtra: true,
        tipoInteresAnualAplicado: tipoInteresAnualActual,
      });

      if (capitalPendiente > EPSILON) {
        if (extra.estrategia === 'reducir_cuota') {
          cuotaFija = redondear(
            calcularCuotaFrancesa(capitalPendiente, tasaMensual, mesesRestantes)
          );
        } else {
          mesesRestantes = calcularMesesRestantes(capitalPendiente, tasaMensual, cuotaFija);
        }
      }
    }

    numeroCuota += 1;
  }

  const totalCapitalAmortizado = redondear(cuadro.reduce((acc, f) => acc + f.capital, 0));
  const totalIntereses = redondear(cuadro.reduce((acc, f) => acc + f.intereses, 0));
  const totalPagado = redondear(cuadro.reduce((acc, f) => acc + f.cuota, 0));

  return {
    cuotaInicial,
    cuadro,
    totales: {
      totalCapitalAmortizado,
      totalIntereses,
      totalPagado,
      numeroCuotasReales: cuadro.filter((f) => !f.esAmortizacionExtra).length,
    },
  };
}
