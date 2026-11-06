/**
 * Crea un formateador de moneda es-ES con el número de decimales indicado.
 * No se cachea entre llamadas porque las opciones cambian según la
 * preferencia del usuario (0, 2 o 4 decimales).
 */
function crearFormateadorMoneda(decimales: number): Intl.NumberFormat {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: true, // fijado explícito: el valor por defecto 'auto' no agrupa miles para es-ES en entornos con datos ICU reducidos
  });
}

const formateadoresMoneda = new Map<number, Intl.NumberFormat>();

export type DecimalesMoneda = 0 | 2 | 4;

const CLAVE_DECIMALES = 'finanzas:decimales-mostrados';
let decimalesPreferidos: DecimalesMoneda | null = null;

/**
 * Decimales que el usuario eligió en el Panel. Es una preferencia visual
 * de este navegador (localStorage), no un dato de la base de datos. En el
 * servidor, o si el almacenamiento está bloqueado, vale 2.
 */
export function leerDecimalesPreferidos(): DecimalesMoneda {
  if (decimalesPreferidos !== null) return decimalesPreferidos;
  if (typeof window === 'undefined') return 2;
  try {
    const guardado = window.localStorage.getItem(CLAVE_DECIMALES);
    decimalesPreferidos = guardado === '0' || guardado === '4' ? (Number(guardado) as DecimalesMoneda) : 2;
  } catch {
    decimalesPreferidos = 2;
  }
  return decimalesPreferidos;
}

export function guardarDecimalesPreferidos(decimales: DecimalesMoneda): void {
  decimalesPreferidos = decimales;
  try {
    window.localStorage.setItem(CLAVE_DECIMALES, String(decimales));
  } catch {
    // Sin almacenamiento (modo privado): vale para esta visita.
  }
}

/**
 * Formatea un número como cifra en español: 1.234,56 €
 * @param decimales Número de decimales a mostrar (0, 2 o 4). Si no se
 *   indica, los que el usuario eligió en el Panel, para que la preferencia
 *   se respete en todas las pantallas.
 *   IMPORTANTE: la base de datos guarda los importes con 2 decimales reales
 *   (numeric(14,2)). Pedir 4 decimales no añade precisión real, solo ceros
 *   de relleno — es una decisión de visualización, no de almacenamiento.
 */
export function formatearMoneda(valor: number, decimales: number = leerDecimalesPreferidos()): string {
  let formateador = formateadoresMoneda.get(decimales);
  if (!formateador) {
    formateador = crearFormateadorMoneda(decimales);
    formateadoresMoneda.set(decimales, formateador);
  }
  return formateador.format(valor);
}

/**
 * Importe sin el símbolo €, para tablas densas (mes a mes) donde el
 * símbolo en cada celda no deja que quepa el año entero; la tabla indica
 * una vez que los importes son en euros.
 */
export function formatearCifra(valor: number, decimales: number = leerDecimalesPreferidos()): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: true,
  }).format(valor);
}

/**
 * Cuando se muestra un importe redondeado (0 decimales), este helper da el
 * texto a poner en el atributo `title` para que, al pasar el cursor por
 * encima, se vea el importe exacto con 2 decimales (la precisión real
 * almacenada). Devuelve undefined si no hace falta tooltip (ya se están
 * mostrando 2 decimales o más, no hay nada que "revelar").
 */
export function tituloImporteExacto(valor: number, decimalesMostrados: number): string | undefined {
  if (decimalesMostrados >= 2) return undefined;
  return `Importe exacto: ${formatearMoneda(valor, 2)}`;
}

/**
 * Formatea un tipo de interés/porcentaje. El valor de entrada es la
 * fracción decimal tal como se guarda en base de datos (0.031 = 3,1%),
 * NUNCA el número ya multiplicado por 100 — evita el error clásico de
 * mostrar "0,03%" en vez de "3,10%" por mezclar las dos convenciones.
 *
 * Los tipos de interés hipotecario suelen citarse con 2 o 3 decimales
 * (ej. "Euribor + 0,99%"), por eso aquí se admite explícitamente 4
 * decimales como opción real — a diferencia del dinero, donde 4
 * decimales son puro relleno, en un tipo de interés SÍ son precisión real.
 */
export function formatearPorcentaje(valorFraccion: number, decimales: DecimalesMoneda = 2): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: true,
  }).format(valorFraccion);
}

const formateadorFecha = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Formatea una fecha ISO (YYYY-MM-DD) como DD/MM/AAAA */
export function formatearFecha(fechaIso: string): string {
  return formateadorFecha.format(new Date(fechaIso + 'T00:00:00'));
}

const formateadorMes = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' });

/** Formatea un mes 'YYYY-MM' (como los que usan los informes/gráficos) como "ene 2026". */
export function formatearMes(mesIso: string): string {
  return formateadorMes.format(new Date(`${mesIso}-01T00:00:00`));
}

const NOMBRES_MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Solo el mes, "Ene": para tablas cuya cabecera ya muestra el año encima. */
export function formatearMesCorto(mesIso: string): string {
  return NOMBRES_MES_CORTO[Number(mesIso.slice(5, 7)) - 1] ?? mesIso;
}

/**
 * Agrupa meses 'YYYY-MM' consecutivos por año, para pintar el año una sola
 * vez encima de sus meses (una fila de cabecera con colSpan) en vez de
 * repetirlo en cada columna.
 */
export function agruparMesesPorAnio(meses: string[]): { anio: string; meses: string[] }[] {
  const grupos: { anio: string; meses: string[] }[] = [];
  for (const mes of meses) {
    const anio = mes.slice(0, 4);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.anio === anio) ultimo.meses.push(mes);
    else grupos.push({ anio, meses: [mes] });
  }
  return grupos;
}
