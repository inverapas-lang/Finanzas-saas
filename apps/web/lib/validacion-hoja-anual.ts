import { ErrorApi } from './supabase-server';
import type { ConfigHojaAnual } from './hoja-anual';

export interface PayloadConfigHojaAnual {
  espacio_id: string;
  anio: number;
  configuracion: ConfigHojaAnual;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_CATEGORIAS = 500;

function importesPorMes(valor: unknown, campo: string, anio: number): Record<string, number> {
  if (valor === undefined || valor === null) return {};
  if (typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErrorApi(400, `configuracion.${campo} debe ser un objeto { "YYYY-MM": importe }`);
  }
  const r: Record<string, number> = {};
  for (const [mes, n] of Object.entries(valor as Record<string, unknown>)) {
    if (!MES_REGEX.test(mes) || !mes.startsWith(`${anio}-`)) {
      throw new ErrorApi(400, `configuracion.${campo}: "${mes}" no es un mes de ${anio}`);
    }
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new ErrorApi(400, `configuracion.${campo}.${mes} debe ser un número`);
    }
    r[mes] = n;
  }
  return r;
}

function listaIds(valor: unknown, campo: string): string[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor) || valor.length > MAX_CATEGORIAS) {
    throw new ErrorApi(400, `configuracion.${campo} debe ser una lista de ids de categoría`);
  }
  for (const id of valor) {
    if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
      throw new ErrorApi(400, `configuracion.${campo} contiene un id no válido`);
    }
  }
  return [...new Set(valor as string[])];
}

export function validarPayloadConfigHojaAnual(body: unknown): PayloadConfigHojaAnual {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;
  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }
  if (typeof b.anio !== 'number' || !Number.isInteger(b.anio) || b.anio < 2000 || b.anio > 2100) {
    throw new ErrorApi(400, 'anio debe ser un año entre 2000 y 2100');
  }
  if (typeof b.configuracion !== 'object' || b.configuracion === null || Array.isArray(b.configuracion)) {
    throw new ErrorApi(400, 'configuracion es obligatoria');
  }
  const c = b.configuracion as Record<string, unknown>;
  const anio = b.anio;

  if (c.saldoInicial !== undefined && c.saldoInicial !== null) {
    if (typeof c.saldoInicial !== 'number' || !Number.isFinite(c.saldoInicial)) {
      throw new ErrorApi(400, 'configuracion.saldoInicial debe ser un número');
    }
  }

  return {
    espacio_id: b.espacio_id,
    anio,
    configuracion: {
      forecast: importesPorMes(c.forecast, 'forecast', anio),
      ingresosExtraordinarios: importesPorMes(c.ingresosExtraordinarios, 'ingresosExtraordinarios', anio),
      saldoInicial: (c.saldoInicial as number | null | undefined) ?? null,
      categoriasAmortizacion: listaIds(c.categoriasAmortizacion, 'categoriasAmortizacion'),
      categoriasIngresosSinTrabajo: listaIds(c.categoriasIngresosSinTrabajo, 'categoriasIngresosSinTrabajo'),
      categoriasGastosSinTrabajo: listaIds(c.categoriasGastosSinTrabajo, 'categoriasGastosSinTrabajo'),
    },
  };
}

/** Todos los ids de categoría que referencia la configuración, para comprobar que son del espacio. */
export function idsCategoriaDeConfig(c: ConfigHojaAnual): string[] {
  return [...new Set([...c.categoriasAmortizacion, ...c.categoriasIngresosSinTrabajo, ...c.categoriasGastosSinTrabajo])];
}
