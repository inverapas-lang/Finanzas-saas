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

const formateadorPorDefecto = crearFormateadorMoneda(2);

/**
 * Formatea un número como cifra en español: 1.234,56 €
 * @param decimales Número de decimales a mostrar (0, 2 o 4). Por defecto 2.
 *   IMPORTANTE: la base de datos guarda los importes con 2 decimales reales
 *   (numeric(14,2)). Pedir 4 decimales no añade precisión real, solo ceros
 *   de relleno — es una decisión de visualización, no de almacenamiento.
 */
export function formatearMoneda(valor: number, decimales: number = 2): string {
  if (decimales === 2) return formateadorPorDefecto.format(valor);
  return crearFormateadorMoneda(decimales).format(valor);
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

export type DecimalesMoneda = 0 | 2 | 4;

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
