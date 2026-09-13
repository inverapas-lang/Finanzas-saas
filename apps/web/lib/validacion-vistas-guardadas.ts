import { ErrorApi } from './supabase-server';

export type Metrica = 'ingresos_vs_gastos' | 'gasto_por_categoria' | 'ingreso_por_categoria';
export type TipoGrafico = 'barras' | 'lineas';
export type PresetRango = 'ultimos_6_meses' | 'ultimos_12_meses' | 'ano_actual' | 'fijo';

export interface ConfiguracionVista {
  metrica: Metrica;
  tipoGrafico: TipoGrafico;
  rango: PresetRango;
  // Solo cuando rango === 'fijo': fechas absolutas, no recalculadas.
  desde?: string;
  hasta?: string;
}

export interface PayloadVistaGuardada {
  espacio_id: string;
  nombre: string;
  configuracion: ConfiguracionVista;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const METRICAS: Metrica[] = ['ingresos_vs_gastos', 'gasto_por_categoria', 'ingreso_por_categoria'];
const TIPOS_GRAFICO: TipoGrafico[] = ['barras', 'lineas'];
const RANGOS: PresetRango[] = ['ultimos_6_meses', 'ultimos_12_meses', 'ano_actual', 'fijo'];

export function validarPayloadVistaGuardada(body: unknown): PayloadVistaGuardada {
  if (typeof body !== 'object' || body === null) {
    throw new ErrorApi(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.espacio_id !== 'string' || !UUID_REGEX.test(b.espacio_id)) {
    throw new ErrorApi(400, 'espacio_id debe ser un UUID válido');
  }
  if (typeof b.nombre !== 'string' || b.nombre.trim().length === 0) {
    throw new ErrorApi(400, 'nombre no puede estar vacío');
  }
  if (typeof b.configuracion !== 'object' || b.configuracion === null) {
    throw new ErrorApi(400, 'configuracion es obligatoria');
  }
  const c = b.configuracion as Record<string, unknown>;

  if (typeof c.metrica !== 'string' || !METRICAS.includes(c.metrica as Metrica)) {
    throw new ErrorApi(400, `configuracion.metrica debe ser una de: ${METRICAS.join(', ')}`);
  }
  if (typeof c.tipoGrafico !== 'string' || !TIPOS_GRAFICO.includes(c.tipoGrafico as TipoGrafico)) {
    throw new ErrorApi(400, `configuracion.tipoGrafico debe ser uno de: ${TIPOS_GRAFICO.join(', ')}`);
  }
  if (typeof c.rango !== 'string' || !RANGOS.includes(c.rango as PresetRango)) {
    throw new ErrorApi(400, `configuracion.rango debe ser uno de: ${RANGOS.join(', ')}`);
  }

  const configuracion: ConfiguracionVista = {
    metrica: c.metrica as Metrica,
    tipoGrafico: c.tipoGrafico as TipoGrafico,
    rango: c.rango as PresetRango,
  };

  if (configuracion.rango === 'fijo') {
    if (typeof c.desde !== 'string' || !FECHA_REGEX.test(c.desde)) {
      throw new ErrorApi(400, 'configuracion.desde debe tener formato YYYY-MM-DD cuando rango es "fijo"');
    }
    if (typeof c.hasta !== 'string' || !FECHA_REGEX.test(c.hasta)) {
      throw new ErrorApi(400, 'configuracion.hasta debe tener formato YYYY-MM-DD cuando rango es "fijo"');
    }
    configuracion.desde = c.desde;
    configuracion.hasta = c.hasta;
  }

  return { espacio_id: b.espacio_id, nombre: b.nombre.trim(), configuracion };
}
