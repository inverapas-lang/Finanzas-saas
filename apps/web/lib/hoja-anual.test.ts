import { describe, expect, it } from 'vitest';
import { CONFIG_HOJA_VACIA, calcularHojaAnual, normalizarConfigHoja, type CategoriaHoja, type MovimientoHoja } from './hoja-anual';
import { evaluarEntradaCelda } from './expresion-celda';
import { validarPayloadConfigHojaAnual } from './validacion-hoja-anual';

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const categorias: CategoriaHoja[] = [
  { id: ID(1), nombre: 'Nómina', tipo: 'ingreso', categoria_padre_id: null },
  { id: ID(2), nombre: 'Alquiler piso', tipo: 'ingreso', categoria_padre_id: null },
  { id: ID(10), nombre: 'Seguros', tipo: 'gasto', categoria_padre_id: null },
  { id: ID(11), nombre: 'Seguro salud', tipo: 'gasto', categoria_padre_id: ID(10) },
  { id: ID(12), nombre: 'Seguro coche', tipo: 'gasto', categoria_padre_id: ID(10) },
  { id: ID(20), nombre: 'Amortizaciones anticipadas', tipo: 'gasto', categoria_padre_id: null },
  { id: ID(30), nombre: 'Luz', tipo: 'gasto', categoria_padre_id: null },
];

let n = 0;
const ing = (cat: number, mes: string, importe: number): MovimientoHoja => ({
  id: `i${n++}`,
  categoria_id: ID(cat),
  importe_esperado: importe,
  importe_real: importe,
  fecha_prevista: `${mes}-01`,
});
const gas = (cat: number, mes: string, importe: number, formula: string | null = null): MovimientoHoja => ({
  id: `g${n++}`,
  categoria_id: ID(cat),
  importe_previsto: importe,
  importe_real: importe,
  fecha_prevista: `${mes}-01`,
  formula,
});

function hojaBase(config = CONFIG_HOJA_VACIA) {
  return calcularHojaAnual({
    anio: 2026,
    categorias,
    ingresos: [ing(1, '2026-01', 3000), ing(1, '2026-02', 3000), ing(2, '2026-01', 500)],
    gastos: [
      gas(11, '2026-01', 136.57, '=136,57'),
      gas(12, '2026-01', 50),
      gas(20, '2026-02', 1000),
      gas(30, '2026-01', 100),
      gas(30, '2026-02', -20), // devolución
    ],
    ingresosDiciembreAnterior: 2800,
    config,
  });
}

const resultado = (h: ReturnType<typeof hojaBase>, clave: string) =>
  h.resultados.flatMap((b) => b.filas).find((f) => f.clave === clave)!;

describe('calcularHojaAnual — filas', () => {
  it('pone los gastos en negativo, con subtotal por grupo y sus subcategorías debajo', () => {
    const h = hojaBase();
    expect(h.gastos.map((f) => [f.nombre, f.esSubtotal, f.nivel])).toEqual([
      ['Seguros', true, 0],
      ['Seguro salud', false, 1],
      ['Seguro coche', false, 1],
      ['Amortizaciones anticipadas', false, 0],
      ['Luz', false, 0],
    ]);
    const seguros = h.gastos[0];
    expect(seguros.celdas[0].valor).toBeCloseTo(-186.57);
    expect(seguros.total).toBeCloseTo(-186.57);
    expect(h.gastos[1].celdas[0].formula).toBe('=136,57');
    expect(h.gastos[1].celdas[0].movimientoId).not.toBeNull();
  });

  it('una devolución (gasto negativo) suma en positivo', () => {
    const luz = hojaBase().gastos.find((f) => f.nombre === 'Luz')!;
    expect(luz.celdas[1].valor).toBe(20);
    expect(luz.total).toBe(-80);
  });

  it('mensualizado es total / 12 y el % de un ingreso es sobre el total de ingresos', () => {
    const h = hojaBase();
    const nomina = h.ingresos[0];
    expect(nomina.total).toBe(6000);
    expect(nomina.mensualizado).toBe(500);
    expect(nomina.porcentaje).toBeCloseTo(6000 / 6500);
  });

  it('el % de un gasto es sobre los gastos sin amortizaciones anticipadas', () => {
    const h = hojaBase({ ...CONFIG_HOJA_VACIA, categoriasAmortizacion: [ID(20)] });
    const totalSinAmort = -186.57 - 80;
    const luz = h.gastos.find((f) => f.nombre === 'Luz')!;
    expect(luz.porcentaje).toBeCloseTo(-80 / totalSinAmort);
    expect(resultado(h, 'gastos-sin-amortizaciones').total).toBeCloseTo(totalSinAmort);
  });
});

describe('calcularHojaAnual — resultados', () => {
  it('CF = ingresos + gastos (con signo) por mes', () => {
    const h = hojaBase();
    expect(resultado(h, 'cf-ingresos').valores.slice(0, 2)).toEqual([3500, 3000]);
    expect(resultado(h, 'cf-gastos').valores[0]).toBeCloseTo(-286.57);
    expect(resultado(h, 'cf').valores[0]).toBeCloseTo(3213.43);
  });

  it('forecast, real y diferencia', () => {
    const h = hojaBase({ ...CONFIG_HOJA_VACIA, forecast: { '2026-01': 3000 } });
    expect(resultado(h, 'forecast').valores[0]).toBe(3000);
    expect(resultado(h, 'diferencia').valores[0]).toBeCloseTo(213.43);
  });

  it('ingresos netos sin trabajo y sus %', () => {
    const h = hojaBase({ ...CONFIG_HOJA_VACIA, categoriasIngresosSinTrabajo: [ID(2)], categoriasGastosSinTrabajo: [ID(30)] });
    expect(resultado(h, 'ingresos-sin-trabajo').valores[0]).toBe(500);
    expect(resultado(h, 'netos-sin-trabajo').valores[0]).toBe(400);
    expect(resultado(h, 'pct-ingresos').valores[0]).toBeCloseTo(400 / 3500);
    expect(resultado(h, 'pct-gastos').valores[0]).toBeCloseTo(400 / 286.57);
  });

  it('elegir un grupo cuenta todas sus subcategorías una sola vez', () => {
    const h = hojaBase({ ...CONFIG_HOJA_VACIA, categoriasGastosSinTrabajo: [ID(10), ID(11)] });
    expect(resultado(h, 'netos-sin-trabajo').valores[0]).toBeCloseTo(-186.57);
  });

  it('ingresos sin préstamos descuenta los extraordinarios del mes', () => {
    const h = hojaBase({ ...CONFIG_HOJA_VACIA, ingresosExtraordinarios: { '2026-02': 1000 } });
    expect(resultado(h, 'ingresos-sin-prestamos').valores[1]).toBe(2000);
  });

  it('saldos: encadena el saldo final y usa los ingresos del mes anterior', () => {
    const h = hojaBase({ ...CONFIG_HOJA_VACIA, saldoInicial: 1000 });
    const inicio = resultado(h, 'saldo-inicio').valores;
    const fin = resultado(h, 'saldo-fin').valores;
    expect(resultado(h, 'ingresos-mes-anterior').valores.slice(0, 2)).toEqual([2800, 3500]);
    expect(fin[0]).toBeCloseTo(1000 + 2800 - 286.57);
    expect(inicio[1]).toBeCloseTo(fin[0]!);
  });

  it('sin saldo inicial los saldos quedan vacíos', () => {
    expect(resultado(hojaBase(), 'saldo-fin').valores[0]).toBeNull();
  });
});

describe('normalizarConfigHoja', () => {
  it('descarta categorías que ya no existen y valores raros', () => {
    const c = normalizarConfigHoja(
      { categoriasAmortizacion: [ID(20), ID(99)], forecast: { '2026-01': 5, malo: 3 }, saldoInicial: 'x' },
      new Set([ID(20)])
    );
    expect(c.categoriasAmortizacion).toEqual([ID(20)]);
    expect(c.forecast).toEqual({ '2026-01': 5 });
    expect(c.saldoInicial).toBeNull();
  });
});

describe('evaluarEntradaCelda', () => {
  it('números a la española y a la inglesa', () => {
    expect(evaluarEntradaCelda('1.234,56')?.valor).toBe(1234.56);
    expect(evaluarEntradaCelda('-136.57')).toEqual({ valor: -136.57, formula: null });
    expect(evaluarEntradaCelda('  ')).toBeNull();
  });

  it('fórmulas como en Excel', () => {
    expect(evaluarEntradaCelda('=2100,74+3379,32')).toEqual({ valor: 5480.06, formula: '=2100,74+3379,32' });
    expect(evaluarEntradaCelda('=-109,52*2-164,52')?.valor).toBe(-383.56);
    expect(evaluarEntradaCelda('=(0,12*1000*85%)/1,1599')?.valor).toBeCloseTo(87.94, 2);
    expect(evaluarEntradaCelda('=50')).toEqual({ valor: 50, formula: null });
  });

  it('rechaza lo que no es aritmética', () => {
    expect(() => evaluarEntradaCelda('=alert(1)')).toThrow();
    expect(() => evaluarEntradaCelda('=1/0')).toThrow();
    expect(() => evaluarEntradaCelda('=(1+2')).toThrow();
  });
});

describe('validarPayloadConfigHojaAnual', () => {
  const base = { espacio_id: ID(500), anio: 2026, configuracion: {} };

  it('acepta una configuración vacía', () => {
    expect(validarPayloadConfigHojaAnual(base).configuracion).toEqual(CONFIG_HOJA_VACIA);
  });

  it('rechaza meses de otro año, importes no finitos e ids no válidos', () => {
    expect(() => validarPayloadConfigHojaAnual({ ...base, configuracion: { forecast: { '2025-01': 1 } } })).toThrow();
    expect(() => validarPayloadConfigHojaAnual({ ...base, configuracion: { forecast: { '2026-01': Infinity } } })).toThrow();
    expect(() => validarPayloadConfigHojaAnual({ ...base, configuracion: { categoriasAmortizacion: ['x'] } })).toThrow();
    expect(() => validarPayloadConfigHojaAnual({ ...base, anio: 1999 })).toThrow();
  });
});

describe('calcularHojaAnual — diferencia', () => {
  it('solo se calcula en los meses con forecast', () => {
    const h = hojaBase({ ...CONFIG_HOJA_VACIA, forecast: { '2026-01': 3000 } });
    const d = resultado(h, 'diferencia');
    expect(d.valores[1]).toBeNull();
    expect(d.total).toBeCloseTo(213.43);
  });
});
