/**
 * Tipos de las propuestas de cambio del asistente financiero. Archivo sin
 * dependencias a propósito: lo importan tanto la ruta /api/chat (servidor)
 * como la pantalla del chat (navegador).
 *
 * El asistente NUNCA escribe en la base de datos: solo propone cambios.
 * El usuario los ve (valor actual -> valor nuevo) y, si los acepta, el
 * navegador los aplica llamando a las rutas de API de siempre
 * (/api/gastos, /api/ingresos, /api/patrimonio-historico-item), con su
 * sesión y sus validaciones.
 */

export type EntidadEditable = 'gasto' | 'ingreso' | 'patrimonio_item';
export type AccionCambio = 'modificar' | 'crear' | 'eliminar';
export type ValorCampo = string | number | null;

export interface CambioPropuesto {
  accion: AccionCambio;
  entidad: EntidadEditable;
  /** null solo en 'crear'. */
  id: string | null;
  /** Campos nuevos ('modificar' y 'crear'); vacío en 'eliminar'. */
  valores: Record<string, ValorCampo>;
  /** Valores actuales leídos de la base de datos, no los que diga la IA. */
  antes: Record<string, ValorCampo> | null;
  /** Texto para identificar el registro en pantalla, p. ej. "Luz · 2026-03-01". */
  etiqueta: string;
}

export interface PropuestaCambios {
  resumen: string;
  cambios: CambioPropuesto[];
  /** Nombre de cada categoria_id que aparece en los cambios, para mostrarlo en vez del UUID. */
  categorias: Record<string, string>;
}

/** Campos que el asistente puede tocar en cada entidad. */
export const CAMPOS_EDITABLES: Record<EntidadEditable, { modificar: string[]; crear: string[] }> = {
  gasto: {
    modificar: [
      'descripcion',
      'importe_previsto',
      'importe_real',
      'fecha_prevista',
      'fecha_pagada',
      'categoria_id',
      'notas',
    ],
    crear: [
      'descripcion',
      'importe_previsto',
      'importe_real',
      'fecha_prevista',
      'fecha_pagada',
      'categoria_id',
      'notas',
    ],
  },
  ingreso: {
    modificar: [
      'descripcion',
      'importe_esperado',
      'importe_real',
      'fecha_prevista',
      'fecha_cobrada',
      'categoria_id',
      'observaciones',
    ],
    crear: [
      'descripcion',
      'importe_esperado',
      'importe_real',
      'fecha_prevista',
      'fecha_cobrada',
      'categoria_id',
      'observaciones',
    ],
  },
  // mes/bloque/concepto son inmutables en un registro existente (ver
  // PATCH /api/patrimonio-historico-item/[id]): cambiarlos es crear otro.
  patrimonio_item: {
    modificar: ['valor', 'notas'],
    crear: ['mes', 'bloque', 'concepto', 'valor', 'notas'],
  },
};

export const ETIQUETAS_ENTIDAD: Record<EntidadEditable, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  patrimonio_item: 'Patrimonio',
};
