import type { MovimientoReal, ReglaRecurrente } from '@finanzas-saas/projection-engine';

interface FilaReglaRecurrente {
  id: string;
  tipo: 'ingreso' | 'gasto';
  importe: number;
  periodicidad: ReglaRecurrente['periodicidad'];
  fecha_inicio: string;
  fecha_fin: string | null;
  activa: boolean;
  categoria_id: string | null;
}

interface FilaIngresoOGasto {
  id: string;
  categoria_id: string | null;
  importe_esperado?: number;
  importe_previsto?: number;
  importe_real: number | null;
  fecha_prevista: string;
  fecha_cobrada?: string | null;
  fecha_pagada?: string | null;
  regla_recurrente_id: string | null;
}

export function mapearReglaRecurrente(fila: FilaReglaRecurrente): ReglaRecurrente {
  return {
    id: fila.id,
    tipo: fila.tipo,
    importe: fila.importe,
    periodicidad: fila.periodicidad,
    fechaInicio: fila.fecha_inicio,
    fechaFin: fila.fecha_fin,
    activa: fila.activa,
    categoriaId: fila.categoria_id,
  };
}

export function mapearMovimiento(
  fila: FilaIngresoOGasto,
  tipo: 'ingreso' | 'gasto'
): MovimientoReal {
  const fechaConfirmacion = tipo === 'ingreso' ? fila.fecha_cobrada : fila.fecha_pagada;
  const importeEsperado =
    tipo === 'ingreso' ? fila.importe_esperado ?? 0 : fila.importe_previsto ?? 0;

  return {
    id: fila.id,
    tipo,
    importeReal: fila.importe_real,
    importeEsperado,
    fecha: fechaConfirmacion ?? fila.fecha_prevista,
    categoriaId: fila.categoria_id,
    cobradoOPagado: Boolean(fechaConfirmacion),
    reglaRecurrenteId: fila.regla_recurrente_id,
  };
}
