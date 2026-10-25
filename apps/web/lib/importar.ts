export interface FilaImportada {
  Tipo?: unknown;
  Descripción?: unknown;
  Categoría?: unknown;
  Cuenta?: unknown;
  'Fecha prevista'?: unknown;
  'Fecha confirmada'?: unknown;
  Importe?: unknown;
  'Importe real'?: unknown;
}

export interface MovimientoImportado {
  tipo: 'ingreso' | 'gasto';
  descripcion: string;
  categoriaNombre: string | null;
  cuentaNombre: string | null;
  fechaPrevista: string;
  fechaConfirmada: string | null;
  importe: number;
  importeReal: number | null;
}

export interface ResultadoFila {
  numeroFila: number; // 1-indexado, contando la cabecera como fila 1 (igual que se ve en Excel)
  ok: boolean;
  movimiento?: MovimientoImportado;
  error?: string;
}

const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convierte lo que venga en la celda de fecha a YYYY-MM-DD. Admite:
 *  - Texto ya en formato ISO (YYYY-MM-DD) — el que usa nuestra propia
 *    exportación, para que exportar → editar → volver a importar funcione
 *    sin fricción.
 *  - Objetos Date (cuando la librería xlsx parsea la celda como fecha real
 *    de Excel, que es el caso normal si el usuario ha escrito una fecha
 *    con el formato de fecha nativo de Excel, no como texto).
 *  - Texto en formato DD/MM/AAAA (el que se ve en pantalla en el resto de
 *    la aplicación), como alternativa razonable.
 */
export function normalizarFecha(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;

  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    return valor.toISOString().slice(0, 10);
  }

  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (FECHA_ISO_REGEX.test(texto)) return texto;

    const coincidenciaDMA = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (coincidenciaDMA) {
      const [, dia, mes, anio] = coincidenciaDMA;
      return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }
  }

  return null;
}

function normalizarImporte(valor: unknown): number | null {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    // Admite tanto "1234.56" como "1.234,56" (formato español, el que
    // produce nuestra propia exportación a CSV).
    const texto = valor.trim();
    if (texto === '') return null;
    const normalizado = texto.includes(',')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto;
    const n = Number(normalizado);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Valida y normaliza una fila cruda del Excel importado. Devuelve
 * ok:false con un mensaje claro (referenciando el número de fila, como
 * lo vería el usuario en Excel) si algo no es válido — nunca lanza, para
 * poder procesar todas las filas de una vez y mostrar todos los errores
 * juntos en vez de parar en el primero.
 */
export function mapearFilaImportada(fila: FilaImportada, numeroFila: number): ResultadoFila {
  const tipoRaw = String(fila.Tipo ?? '').trim().toLowerCase();
  const tipo: 'ingreso' | 'gasto' | null =
    tipoRaw === 'ingreso' ? 'ingreso' : tipoRaw === 'gasto' ? 'gasto' : null;

  if (!tipo) {
    return { numeroFila, ok: false, error: `Columna "Tipo" debe ser "Ingreso" o "Gasto" (valor: "${fila.Tipo}")` };
  }

  const descripcion = String(fila.Descripción ?? '').trim();
  if (descripcion === '') {
    return { numeroFila, ok: false, error: 'Falta la descripción' };
  }

  const fechaPrevista = normalizarFecha(fila['Fecha prevista']);
  if (!fechaPrevista) {
    return {
      numeroFila,
      ok: false,
      error: `"Fecha prevista" no es una fecha válida (valor: "${fila['Fecha prevista']}"). Usa AAAA-MM-DD o DD/MM/AAAA`,
    };
  }

  const importe = normalizarImporte(fila.Importe);
  if (importe === null || importe < 0) {
    return { numeroFila, ok: false, error: `"Importe" no es un número válido (valor: "${fila.Importe}")` };
  }

  const fechaConfirmada = normalizarFecha(fila['Fecha confirmada']);
  const importeReal = normalizarImporte(fila['Importe real']);

  const categoriaNombre = String(fila.Categoría ?? '').trim();
  const cuentaNombre = String(fila.Cuenta ?? '').trim();

  return {
    numeroFila,
    ok: true,
    movimiento: {
      tipo,
      descripcion,
      categoriaNombre: categoriaNombre === '' ? null : categoriaNombre,
      cuentaNombre: cuentaNombre === '' ? null : cuentaNombre,
      fechaPrevista,
      fechaConfirmada,
      importe,
      importeReal,
    },
  };
}

/** Procesa todas las filas y separa las válidas de las que tienen error. */
export function mapearFilasImportadas(filas: FilaImportada[]): ResultadoFila[] {
  // La fila 1 de Excel es la cabecera, así que la primera fila de datos es la 2.
  return filas.map((fila, i) => mapearFilaImportada(fila, i + 2));
}
