import { describe, expect, it } from 'vitest';
import { calcularProyeccion, generarOcurrencias } from '../src/projection';
import type { MovimientoReal, ReglaRecurrente } from '../src/types';

describe('generarOcurrencias', () => {
  const reglaMensual: ReglaRecurrente = {
    id: 'r1',
    tipo: 'ingreso',
    importe: 2400,
    periodicidad: 'mensual',
    fechaInicio: '2026-01-05',
    fechaFin: null,
    activa: true,
    categoriaId: 'nomina',
  };

  it('genera una ocurrencia por mes manteniendo el día del mes', () => {
    const ocurrencias = generarOcurrencias(reglaMensual, '2026-06-01', '2026-09-30');
    expect(ocurrencias).toEqual(['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05']);
  });

  it('no genera nada para periodicidad "unico"', () => {
    const regla: ReglaRecurrente = { ...reglaMensual, periodicidad: 'unico' };
    expect(generarOcurrencias(regla, '2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('respeta fechaFin de la regla (incluye la ocurrencia del propio mes de fechaDesde)', () => {
    const regla: ReglaRecurrente = { ...reglaMensual, fechaFin: '2026-07-05' };
    const ocurrencias = generarOcurrencias(regla, '2026-06-01', '2026-12-31');
    // fechaDesde=06-01: la ocurrencia del 06-05 es posterior a esa fecha, así que sí se incluye.
    expect(ocurrencias).toEqual(['2026-06-05', '2026-07-05']);
  });

  it('no genera nada si la regla está inactiva', () => {
    const regla: ReglaRecurrente = { ...reglaMensual, activa: false };
    expect(generarOcurrencias(regla, '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

describe('calcularProyeccion', () => {
  const reglas: ReglaRecurrente[] = [
    {
      id: 'r-nomina',
      tipo: 'ingreso',
      importe: 2400,
      periodicidad: 'mensual',
      fechaInicio: '2026-01-05',
      fechaFin: null,
      activa: true,
      categoriaId: 'nomina',
    },
    {
      id: 'r-alquiler',
      tipo: 'gasto',
      importe: 1050,
      periodicidad: 'mensual',
      fechaInicio: '2026-01-01',
      fechaFin: null,
      activa: true,
      categoriaId: 'vivienda',
    },
  ];

  it('suma correctamente lo confirmado hasta fechaCorte', () => {
    const movimientos: MovimientoReal[] = [
      {
        id: 'i1',
        tipo: 'ingreso',
        importeReal: 2400,
        importeEsperado: 2400,
        fecha: '2026-06-05',
        categoriaId: 'nomina',
        cobradoOPagado: true,
        reglaRecurrenteId: 'r-nomina',
      },
      {
        id: 'g1',
        tipo: 'gasto',
        importeReal: 1050,
        importeEsperado: 1050,
        fecha: '2026-06-01',
        categoriaId: 'vivienda',
        cobradoOPagado: true,
        reglaRecurrenteId: 'r-alquiler',
      },
    ];

    const resultado = calcularProyeccion({
      fechaCorte: '2026-06-10',
      fechaObjetivo: '2026-06-30',
      reglasRecurrentes: reglas,
      movimientosReales: movimientos,
    });

    expect(resultado.realConfirmadoIngresos).toBe(2400);
    expect(resultado.realConfirmadoGastos).toBe(1050);
    // Ya no quedan ocurrencias de junio por proyectar (ambas ya materializadas y confirmadas)
    expect(resultado.proyectadoIngresos).toBe(0);
    expect(resultado.proyectadoGastos).toBe(0);
  });

  it('proyecta las ocurrencias futuras no materializadas hasta fin de año', () => {
    const movimientosEneroAJunio: MovimientoReal[] = [];
    for (let mes = 1; mes <= 6; mes++) {
      const mm = String(mes).padStart(2, '0');
      movimientosEneroAJunio.push({
        id: `i${mes}`,
        tipo: 'ingreso',
        importeReal: 2400,
        importeEsperado: 2400,
        fecha: `2026-${mm}-05`,
        categoriaId: 'nomina',
        cobradoOPagado: true,
        reglaRecurrenteId: 'r-nomina',
      });
      movimientosEneroAJunio.push({
        id: `g${mes}`,
        tipo: 'gasto',
        importeReal: 1050,
        importeEsperado: 1050,
        fecha: `2026-${mm}-01`,
        categoriaId: 'vivienda',
        cobradoOPagado: true,
        reglaRecurrenteId: 'r-alquiler',
      });
    }

    const resultado = calcularProyeccion({
      fechaCorte: '2026-06-30',
      fechaObjetivo: '2026-12-31',
      reglasRecurrentes: reglas,
      movimientosReales: movimientosEneroAJunio,
    });

    // Julio a diciembre: 6 ocurrencias de cada regla no materializadas
    expect(resultado.proyectadoIngresos).toBe(2400 * 6);
    expect(resultado.proyectadoGastos).toBe(1050 * 6);
    expect(resultado.realConfirmadoIngresos).toBe(2400 * 6);
    expect(resultado.totalEstimadoIngresos).toBe(2400 * 12);
    expect(resultado.saldoEstimado).toBe(2400 * 12 - 1050 * 12);
  });

  it('no duplica una ocurrencia que ya existe como movimiento pendiente (no cobrado)', () => {
    const movimientos: MovimientoReal[] = [
      {
        id: 'i-julio',
        tipo: 'ingreso',
        importeReal: null,
        importeEsperado: 2400,
        fecha: '2026-07-05',
        categoriaId: 'nomina',
        cobradoOPagado: false,
        reglaRecurrenteId: 'r-nomina',
      },
    ];

    const resultado = calcularProyeccion({
      fechaCorte: '2026-06-30',
      fechaObjetivo: '2026-07-31',
      reglasRecurrentes: reglas,
      movimientosReales: movimientos,
    });

    // El ingreso de julio se cuenta una sola vez (como pendiente), no otra vez desde la regla
    expect(resultado.proyectadoIngresos).toBe(2400);
  });

  it('rechaza fechaObjetivo anterior a fechaCorte', () => {
    expect(() =>
      calcularProyeccion({
        fechaCorte: '2026-06-30',
        fechaObjetivo: '2026-01-01',
        reglasRecurrentes: [],
        movimientosReales: [],
      })
    ).toThrow();
  });

  it('agrega correctamente el desglose por categoría', () => {
    const resultado = calcularProyeccion({
      fechaCorte: '2026-06-01',
      fechaObjetivo: '2026-08-31',
      reglasRecurrentes: reglas,
      movimientosReales: [],
    });

    const nomina = resultado.desglosePorCategoria.find((d) => d.categoriaId === 'nomina');
    const vivienda = resultado.desglosePorCategoria.find((d) => d.categoriaId === 'vivienda');
    // nómina cae el día 5: jun, jul, ago -> 3 ocurrencias tras fechaCorte
    expect(nomina?.totalIngresos).toBe(2400 * 3);
    // alquiler cae el día 1: la de junio coincide exactamente con fechaCorte (día ya transcurrido,
    // se asume cubierto por datos reales, no se proyecta) -> solo jul y ago, 2 ocurrencias
    expect(vivienda?.totalGastos).toBe(1050 * 2);
  });
});
