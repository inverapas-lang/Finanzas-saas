export type TipoMovimiento = 'ingreso' | 'gasto';

export type Periodicidad =
  | 'unico'
  | 'semanal'
  | 'mensual'
  | 'bimestral'
  | 'trimestral'
  | 'semestral'
  | 'anual';

/** Reflejo mínimo de la tabla reglas_recurrentes necesario para proyectar. */
export interface ReglaRecurrente {
  id: string;
  tipo: TipoMovimiento;
  importe: number;
  periodicidad: Periodicidad;
  fechaInicio: string; // ISO date
  fechaFin: string | null;
  activa: boolean;
  categoriaId: string | null;
}

/** Reflejo mínimo de un ingreso o gasto real ya registrado. */
export interface MovimientoReal {
  id: string;
  tipo: TipoMovimiento;
  importeReal: number | null;
  importeEsperado: number; // importe_esperado en ingresos, importe_previsto en gastos
  fecha: string; // fecha_cobrada/fecha_pagada si existe, si no fecha_prevista
  categoriaId: string | null;
  cobradoOPagado: boolean; // true si tiene fecha_cobrada / fecha_pagada
  /** Si este movimiento fue generado por una regla recurrente, su id (evita duplicar en la proyección). */
  reglaRecurrenteId: string | null;
}

export interface ParametrosProyeccion {
  /** Fecha desde la que se proyecta (normalmente "hoy"). */
  fechaCorte: string;
  /** Hasta qué fecha proyectar (inclusive). */
  fechaObjetivo: string;
  reglasRecurrentes: ReglaRecurrente[];
  movimientosReales: MovimientoReal[];
}

export interface DesgloseCategoria {
  categoriaId: string | null;
  totalIngresos: number;
  totalGastos: number;
}

export interface ResultadoProyeccion {
  fechaCorte: string;
  fechaObjetivo: string;
  /** Suma de ingresos/gastos ya confirmados (cobrados/pagados) hasta fechaCorte. */
  realConfirmadoIngresos: number;
  realConfirmadoGastos: number;
  /** Suma de ingresos/gastos generados por reglas recurrentes entre fechaCorte y fechaObjetivo. */
  proyectadoIngresos: number;
  proyectadoGastos: number;
  /** realConfirmado + proyectado. */
  totalEstimadoIngresos: number;
  totalEstimadoGastos: number;
  saldoEstimado: number;
  desglosePorCategoria: DesgloseCategoria[];
}
