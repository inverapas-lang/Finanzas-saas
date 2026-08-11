import { describe, expect, it } from 'vitest';
import {
  calcularCuotaFrancesa,
  calcularMesesRestantes,
  generarCuadroAmortizacion,
} from '../src/amortization';

describe('calcularCuotaFrancesa', () => {
  it('reproduce el valor de referencia estándar de mercado (100.000€, 3% TIN, 30 años)', () => {
    // Valor de referencia verificado con calculadoras de amortización francesa estándar: ~421,60 €/mes
    const cuota = calcularCuotaFrancesa(100000, 0.03 / 12, 360);
    expect(cuota).toBeCloseTo(421.6, 1);
  });

  it('con tipo de interés 0%, reparte el capital a partes iguales', () => {
    const cuota = calcularCuotaFrancesa(12000, 0, 12);
    expect(cuota).toBeCloseTo(1000, 6);
  });

  it('lanza error si nMeses es 0 o negativo', () => {
    expect(() => calcularCuotaFrancesa(1000, 0.01, 0)).toThrow();
    expect(() => calcularCuotaFrancesa(1000, 0.01, -5)).toThrow();
  });
});

describe('generarCuadroAmortizacion — préstamo simple sin amortizaciones extra', () => {
  const resultado = generarCuadroAmortizacion({
    capitalInicial: 23061.84,
    tipoInteresAnual: 0.0575,
    plazoMeses: 120,
    fechaPrimeraCuota: '2021-11-13',
  });

  it('genera exactamente el número de cuotas del plazo', () => {
    expect(resultado.cuadro).toHaveLength(120);
    expect(resultado.totales.numeroCuotasReales).toBe(120);
  });

  it('la cuota es constante en todas las filas excepto la última (que se ajusta para saldar exactamente)', () => {
    const cuotasSinUltima = resultado.cuadro.slice(0, -1).map((f) => f.cuota);
    const cuotasUnicas = new Set(cuotasSinUltima);
    expect(cuotasUnicas.size).toBe(1);
    // La última cuota puede diferir en céntimos: es el ajuste real que hace
    // cualquier banco para que el capital pendiente termine exactamente en 0.
  });

  it('el capital pendiente llega exactamente a 0 en la última cuota', () => {
    const ultima = resultado.cuadro[resultado.cuadro.length - 1];
    expect(ultima.capitalPendiente).toBe(0);
  });

  it('la suma de capital amortizado en el cuadro coincide con el capital inicial', () => {
    const sumaCapital = resultado.cuadro.reduce((acc, f) => acc + f.capital, 0);
    expect(sumaCapital).toBeCloseTo(23061.84, 1);
  });

  it('cada fila cumple cuota = capital + intereses (redondeo a céntimo)', () => {
    for (const fila of resultado.cuadro) {
      expect(fila.cuota).toBeCloseTo(fila.capital + fila.intereses, 2);
    }
  });

  it('las fechas avanzan un mes exacto en cada fila', () => {
    expect(resultado.cuadro[0].fecha).toBe('2021-11-13');
    expect(resultado.cuadro[1].fecha).toBe('2021-12-13');
    expect(resultado.cuadro[12].fecha).toBe('2022-11-13');
  });

  it('totales.totalPagado = totalCapitalAmortizado + totalIntereses', () => {
    const { totalCapitalAmortizado, totalIntereses, totalPagado } = resultado.totales;
    expect(totalPagado).toBeCloseTo(totalCapitalAmortizado + totalIntereses, 2);
  });
});

describe('generarCuadroAmortizacion — amortización anticipada: reducir cuota', () => {
  const resultado = generarCuadroAmortizacion({
    capitalInicial: 67561,
    tipoInteresAnual: 0.031,
    plazoMeses: 360,
    fechaPrimeraCuota: '2023-11-13',
    amortizacionesExtra: [
      { numeroCuota: 12, importe: 10000, estrategia: 'reducir_cuota' },
    ],
  });

  it('inserta una fila extra de amortización en la cuota indicada', () => {
    const filasExtra = resultado.cuadro.filter((f) => f.esAmortizacionExtra);
    expect(filasExtra).toHaveLength(1);
    expect(filasExtra[0].numeroCuota).toBe(12);
    expect(filasExtra[0].capital).toBe(10000);
  });

  it('la cuota baja después de la amortización extra, manteniendo el plazo total', () => {
    const cuotaAntes = resultado.cuadro[5].cuota;
    const cuotaDespues = resultado.cuadro[15].cuota;
    expect(cuotaDespues).toBeLessThan(cuotaAntes);
    // El plazo total (excluyendo filas de amortización extra) se mantiene en 360
    expect(resultado.totales.numeroCuotasReales).toBe(360);
  });
});

describe('generarCuadroAmortizacion — amortización anticipada: reducir plazo', () => {
  const resultado = generarCuadroAmortizacion({
    capitalInicial: 67561,
    tipoInteresAnual: 0.031,
    plazoMeses: 360,
    fechaPrimeraCuota: '2023-11-13',
    amortizacionesExtra: [
      { numeroCuota: 12, importe: 10000, estrategia: 'reducir_plazo' },
    ],
  });

  it('la cuota se mantiene igual tras la amortización extra', () => {
    const cuotaAntes = resultado.cuadro[5].cuota;
    const cuotaDespues = resultado.cuadro[15].cuota;
    expect(cuotaDespues).toBeCloseTo(cuotaAntes, 2);
  });

  it('el plazo total se reduce por debajo de 360 cuotas', () => {
    expect(resultado.totales.numeroCuotasReales).toBeLessThan(360);
  });

  it('paga menos intereses totales que sin amortización extra', () => {
    const sinExtra = generarCuadroAmortizacion({
      capitalInicial: 67561,
      tipoInteresAnual: 0.031,
      plazoMeses: 360,
      fechaPrimeraCuota: '2023-11-13',
    });
    expect(resultado.totales.totalIntereses).toBeLessThan(sinExtra.totales.totalIntereses);
  });
});

describe('generarCuadroAmortizacion — validaciones', () => {
  it('rechaza capital inicial <= 0', () => {
    expect(() =>
      generarCuadroAmortizacion({
        capitalInicial: 0,
        tipoInteresAnual: 0.03,
        plazoMeses: 12,
        fechaPrimeraCuota: '2026-01-01',
      })
    ).toThrow();
  });

  it('rechaza plazo <= 0', () => {
    expect(() =>
      generarCuadroAmortizacion({
        capitalInicial: 1000,
        tipoInteresAnual: 0.03,
        plazoMeses: 0,
        fechaPrimeraCuota: '2026-01-01',
      })
    ).toThrow();
  });

  it('rechaza tipo de interés negativo', () => {
    expect(() =>
      generarCuadroAmortizacion({
        capitalInicial: 1000,
        tipoInteresAnual: -0.01,
        plazoMeses: 12,
        fechaPrimeraCuota: '2026-01-01',
      })
    ).toThrow();
  });
});

describe('calcularMesesRestantes', () => {
  it('es coherente con calcularCuotaFrancesa (round-trip, con margen de ±1 mes por redondeo a mes entero)', () => {
    const capital = 50000;
    const tasaMensual = 0.04 / 12;
    const nOriginal = 180;
    const cuota = calcularCuotaFrancesa(capital, tasaMensual, nOriginal);
    const nRecalculado = calcularMesesRestantes(capital, tasaMensual, cuota);
    expect(nRecalculado).toBeGreaterThanOrEqual(nOriginal - 1);
    expect(nRecalculado).toBeLessThanOrEqual(nOriginal + 1);
  });
});

describe('generarCuadroAmortizacion — hipoteca mixta (tramo fijo + variable)', () => {
  // 24 meses al 2% fijo, después pasa a 4,2% (Euribor 12M + diferencial ya
  // resuelto por la aplicación — el motor no conoce el Euribor).
  const resultado = generarCuadroAmortizacion({
    capitalInicial: 150000,
    tipoInteresAnual: 0.02,
    plazoMeses: 300,
    fechaPrimeraCuota: '2024-01-05',
    cambiosTipoInteres: [{ numeroCuota: 25, nuevoTipoInteresAnual: 0.042 }],
  });

  it('las primeras 24 cuotas usan el tipo fijo inicial', () => {
    for (let i = 0; i < 24; i++) {
      expect(resultado.cuadro[i].tipoInteresAnualAplicado).toBe(0.02);
    }
  });

  it('desde la cuota 25 en adelante usan el nuevo tipo', () => {
    for (let i = 24; i < resultado.cuadro.length; i++) {
      expect(resultado.cuadro[i].tipoInteresAnualAplicado).toBe(0.042);
    }
  });

  it('la cuota cambia en la revisión (sube, porque el nuevo tipo es mayor)', () => {
    expect(resultado.cuadro[24].cuota).toBeGreaterThan(resultado.cuadro[23].cuota);
  });

  it('el capital pendiente sigue llegando exactamente a 0 pese al cambio de tipo', () => {
    expect(resultado.cuadro[resultado.cuadro.length - 1].capitalPendiente).toBe(0);
  });

  it('la suma de capital sigue siendo exactamente el capital inicial', () => {
    const suma = resultado.cuadro.reduce((acc, f) => acc + f.capital, 0);
    expect(Math.round(suma * 100) / 100).toBe(150000);
  });

  it('cada fila sigue cumpliendo cuota = capital + intereses tras el cambio de tipo', () => {
    for (const fila of resultado.cuadro) {
      expect(fila.cuota).toBeCloseTo(fila.capital + fila.intereses, 2);
    }
  });
});

describe('generarCuadroAmortizacion — hipoteca variable con varias revisiones anuales', () => {
  const resultado = generarCuadroAmortizacion({
    capitalInicial: 100000,
    tipoInteresAnual: 0.035,
    plazoMeses: 240,
    fechaPrimeraCuota: '2023-06-01',
    cambiosTipoInteres: [
      { numeroCuota: 13, nuevoTipoInteresAnual: 0.038 },
      { numeroCuota: 25, nuevoTipoInteresAnual: 0.031 },
      { numeroCuota: 37, nuevoTipoInteresAnual: 0.029 },
    ],
  });

  it('aplica cada tramo de tipo en su cuota correspondiente', () => {
    expect(resultado.cuadro[0].tipoInteresAnualAplicado).toBe(0.035);
    expect(resultado.cuadro[12].tipoInteresAnualAplicado).toBe(0.038);
    expect(resultado.cuadro[24].tipoInteresAnualAplicado).toBe(0.031);
    expect(resultado.cuadro[36].tipoInteresAnualAplicado).toBe(0.029);
  });

  it('la cuota baja cuando el tipo baja en una revisión', () => {
    expect(resultado.cuadro[24].cuota).toBeLessThan(resultado.cuadro[23].cuota);
  });

  it('con varias revisiones, el capital pendiente sigue llegando exacto a 0', () => {
    expect(resultado.cuadro[resultado.cuadro.length - 1].capitalPendiente).toBe(0);
  });

  it('con varias revisiones, la suma de capital sigue siendo el capital inicial exacto', () => {
    const suma = resultado.cuadro.reduce((acc, f) => acc + f.capital, 0);
    expect(Math.round(suma * 100) / 100).toBe(100000);
  });
});

describe('generarCuadroAmortizacion — combinación de revisión de tipo + amortización extra', () => {
  const resultado = generarCuadroAmortizacion({
    capitalInicial: 80000,
    tipoInteresAnual: 0.03,
    plazoMeses: 180,
    fechaPrimeraCuota: '2025-01-01',
    cambiosTipoInteres: [{ numeroCuota: 13, nuevoTipoInteresAnual: 0.04 }],
    amortizacionesExtra: [{ numeroCuota: 13, importe: 5000, estrategia: 'reducir_cuota' }],
  });

  it('no rompe el cuadro: capital pendiente final en 0', () => {
    expect(resultado.cuadro[resultado.cuadro.length - 1].capitalPendiente).toBe(0);
  });

  it('no rompe el cuadro: suma de capital exacta', () => {
    const suma = resultado.cuadro.reduce((acc, f) => acc + f.capital, 0);
    expect(Math.round(suma * 100) / 100).toBe(80000);
  });

  it('no rompe el cuadro: todas las filas cuadran cuota=capital+intereses', () => {
    for (const fila of resultado.cuadro) {
      expect(fila.cuota).toBeCloseTo(fila.capital + fila.intereses, 2);
    }
  });
});

describe('generarCuadroAmortizacion — regresión: nunca debe generar más cuotas que el plazo pactado', () => {
  // Bug real encontrado: con 150.000€, 3,1%, 300 meses, la acumulación de
  // redondeo a lo largo de 300 periodos dejaba 1,56€ sin pagar en la cuota
  // 300, generando una cuota 301 extra. Arreglado forzando el pago exacto
  // cuando es matemáticamente la última cuota programada (no solo cuando
  // el cálculo ya supera el pendiente).
  it('caso exacto que falló: 150.000€, 3,1%, 300 meses', () => {
    const r = generarCuadroAmortizacion({
      capitalInicial: 150000,
      tipoInteresAnual: 0.031,
      plazoMeses: 300,
      fechaPrimeraCuota: '2024-01-05',
    });
    expect(r.totales.numeroCuotasReales).toBe(300);
    expect(r.cuadro).toHaveLength(300);
    expect(r.cuadro[299].capitalPendiente).toBe(0);
  });

  it('barrido de combinaciones: nunca más cuotas que plazoMeses (puede terminar hasta 1 antes por redondeo)', () => {
    const plazos = [12, 60, 120, 180, 240, 300, 360];
    const tipos = [0, 0.02, 0.031, 0.045, 0.06, 0.10];
    const capitales = [1000, 23061.84, 67561, 150000, 300000];

    for (const plazoMeses of plazos) {
      for (const tipoInteresAnual of tipos) {
        for (const capitalInicial of capitales) {
          const r = generarCuadroAmortizacion({ capitalInicial, tipoInteresAnual, plazoMeses, fechaPrimeraCuota: '2024-01-01' });
          expect(r.totales.numeroCuotasReales).toBeLessThanOrEqual(plazoMeses);
          expect(r.totales.numeroCuotasReales).toBeGreaterThanOrEqual(plazoMeses - 1);
          expect(r.cuadro[r.cuadro.length - 1].capitalPendiente).toBe(0);
        }
      }
    }
  });
});

describe('generarCuadroAmortizacion — validaciones de cambiosTipoInteres', () => {
  it('rechaza un nuevo tipo de interés negativo', () => {
    expect(() =>
      generarCuadroAmortizacion({
        capitalInicial: 1000,
        tipoInteresAnual: 0.03,
        plazoMeses: 12,
        fechaPrimeraCuota: '2026-01-01',
        cambiosTipoInteres: [{ numeroCuota: 5, nuevoTipoInteresAnual: -0.01 }],
      })
    ).toThrow();
  });

  it('rechaza numeroCuota menor que 1', () => {
    expect(() =>
      generarCuadroAmortizacion({
        capitalInicial: 1000,
        tipoInteresAnual: 0.03,
        plazoMeses: 12,
        fechaPrimeraCuota: '2026-01-01',
        cambiosTipoInteres: [{ numeroCuota: 0, nuevoTipoInteresAnual: 0.03 }],
      })
    ).toThrow();
  });
});
