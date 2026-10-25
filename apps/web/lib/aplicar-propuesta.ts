import { formatearMoneda } from './formato';
import {
  ETIQUETAS_ENTIDAD,
  type CambioPropuesto,
  type EntidadEditable,
  type PropuestaCambios,
  type ValorCampo,
} from './tipos-propuesta';

/**
 * Lógica pura para aplicar una propuesta del asistente desde el navegador.
 * Sin fetch ni React: la pantalla del chat hace las llamadas, aquí solo se
 * decide QUÉ llamada corresponde a cada cambio y cómo se resume después.
 */

const RUTAS: Record<EntidadEditable, string> = {
  gasto: '/api/gastos',
  ingreso: '/api/ingresos',
  patrimonio_item: '/api/patrimonio-historico-item',
};

export interface PeticionCambio {
  metodo: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  cuerpo: Record<string, ValorCampo> | null;
}

/** Cada cambio se aplica con la ruta de API de siempre, con sus validaciones y RLS. */
export function construirPeticionCambio(cambio: CambioPropuesto, espacioId: string): PeticionCambio {
  const base = RUTAS[cambio.entidad];
  switch (cambio.accion) {
    case 'crear':
      return { metodo: 'POST', url: base, cuerpo: { ...cambio.valores, espacio_id: espacioId } };
    case 'modificar':
      return { metodo: 'PATCH', url: `${base}/${cambio.id}`, cuerpo: { ...cambio.valores } };
    case 'eliminar':
      return { metodo: 'DELETE', url: `${base}/${cambio.id}`, cuerpo: null };
  }
}

export interface ResultadoCambio {
  ok: boolean;
  error?: string;
}

export type EstadoPropuesta = 'pendiente' | 'aplicando' | 'aplicada' | 'descartada';

/**
 * Nota que se añade al mensaje del asistente en el historial que se manda
 * a /api/chat, para que en el siguiente turno la IA sepa qué propuso, con
 * qué ids, y qué hizo el usuario con ello. No se muestra en pantalla.
 */
export function notaParaHistorial(
  propuesta: PropuestaCambios,
  estado: EstadoPropuesta,
  resultados: ResultadoCambio[] = []
): string {
  const lineas = propuesta.cambios.map((c, i) => {
    const r = resultados[i];
    const sufijo = r ? (r.ok ? ' -> OK' : ` -> ERROR: ${r.error ?? 'desconocido'}`) : '';
    const valores = c.accion === 'eliminar' ? '' : ` ${JSON.stringify(c.valores)}`;
    return `- ${c.accion} ${c.entidad}${c.id ? ` ${c.id}` : ''} (${c.etiqueta})${valores}${sufijo}`;
  });

  let cabecera: string;
  if (estado === 'aplicada') {
    const fallidos = resultados.filter((r) => !r.ok).length;
    cabecera =
      fallidos === 0
        ? '[Propuesta aplicada por el usuario: todos los cambios se guardaron]'
        : `[Propuesta aplicada por el usuario: ${fallidos} de ${resultados.length} cambios fallaron]`;
  } else if (estado === 'descartada') {
    cabecera = '[Propuesta descartada por el usuario: no se aplicó nada]';
  } else {
    cabecera = '[Propuesta pendiente: el usuario aún no la ha aplicado]';
  }
  return [cabecera, ...lineas].join('\n');
}

const CAMPOS_IMPORTE = new Set(['importe_previsto', 'importe_esperado', 'importe_real', 'valor']);

/** Texto para mostrar un valor en la tarjeta de la propuesta. */
export function formatearValorCampo(
  campo: string,
  valor: ValorCampo | undefined,
  categorias: Record<string, string> = {}
): string {
  if (valor === undefined || valor === null || valor === '') return '—';
  if (campo === 'categoria_id' && typeof valor === 'string') return categorias[valor] ?? valor;
  // numeric de Postgres puede llegar como texto; se formatea igual.
  if (CAMPOS_IMPORTE.has(campo) && Number.isFinite(Number(valor))) {
    return formatearMoneda(Number(valor));
  }
  return String(valor);
}

const NOMBRES_CAMPO: Record<string, string> = {
  descripcion: 'Descripción',
  importe_previsto: 'Importe previsto',
  importe_esperado: 'Importe esperado',
  importe_real: 'Importe real',
  fecha_prevista: 'Fecha prevista',
  fecha_pagada: 'Fecha de pago',
  fecha_cobrada: 'Fecha de cobro',
  categoria_id: 'Categoría',
  notas: 'Notas',
  observaciones: 'Observaciones',
  mes: 'Mes',
  bloque: 'Bloque',
  concepto: 'Concepto',
  valor: 'Valor',
};

export function nombreCampo(campo: string): string {
  return NOMBRES_CAMPO[campo] ?? campo;
}

export function tituloCambio(cambio: CambioPropuesto): string {
  const verbo = { modificar: 'Modificar', crear: 'Crear', eliminar: 'Eliminar' }[cambio.accion];
  return `${verbo} ${ETIQUETAS_ENTIDAD[cambio.entidad].toLowerCase()}: ${cambio.etiqueta}`;
}
