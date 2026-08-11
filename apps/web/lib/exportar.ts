import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

export interface RegistroExportable {
  tipo: 'Ingreso' | 'Gasto';
  descripcion: string;
  categoria: string;
  cuenta: string;
  fechaPrevista: string;
  fechaConfirmada: string;
  importe: number;
  importeReal: number | null;
}

const CABECERAS = [
  'Tipo',
  'Descripción',
  'Categoría',
  'Cuenta',
  'Fecha prevista',
  'Fecha confirmada',
  'Importe',
  'Importe real',
] as const;

function escaparCampoCsv(valor: string): string {
  // Regla estándar CSV (RFC 4180): si el campo contiene el separador, comillas
  // o salto de línea, hay que envolverlo en comillas y duplicar las comillas
  // internas. Sin esto, una descripción como "Cena; restaurante" rompería
  // las columnas al abrirlo.
  if (valor.includes(';') || valor.includes('"') || valor.includes('\n')) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/**
 * Genera un CSV con separador ";" (no ",") — Excel en español interpreta
 * la coma como separador decimal, así que con coma como separador de
 * columnas el archivo se ve "todo en una columna" al abrirlo. Con ";"
 * se abre bien directamente con doble clic, sin pasos de importación.
 *
 * Los importes usan coma decimal (formato español), igual que el resto
 * de la aplicación — coherente con lo que ya ve el usuario en pantalla.
 */
export function generarCSV(filas: RegistroExportable[]): string {
  const formatearImporteCsv = (n: number | null) =>
    n === null ? '' : n.toFixed(2).replace('.', ',');

  const lineas = [
    CABECERAS.join(';'),
    ...filas.map((f) =>
      [
        f.tipo,
        escaparCampoCsv(f.descripcion),
        escaparCampoCsv(f.categoria),
        escaparCampoCsv(f.cuenta),
        f.fechaPrevista,
        f.fechaConfirmada,
        formatearImporteCsv(f.importe),
        formatearImporteCsv(f.importeReal),
      ].join(';')
    ),
  ];

  // BOM UTF-8 al principio: sin esto, Excel en Windows a veces malinterpreta
  // los acentos (é, ñ) como caracteres extraños al abrir el CSV directamente.
  return '\uFEFF' + lineas.join('\r\n');
}

/**
 * Genera un libro Excel (.xlsx) real, con los importes como números (no
 * texto) para que se puedan sumar/filtrar directamente en Excel sin tener
 * que reformatear la columna primero.
 */
export function generarXLSX(filas: RegistroExportable[]): Buffer {
  const datos = filas.map((f) => ({
    Tipo: f.tipo,
    Descripción: f.descripcion,
    Categoría: f.categoria,
    Cuenta: f.cuenta,
    'Fecha prevista': f.fechaPrevista,
    'Fecha confirmada': f.fechaConfirmada,
    Importe: f.importe,
    'Importe real': f.importeReal ?? '',
  }));

  const hoja = XLSX.utils.json_to_sheet(datos, { header: [...CABECERAS] });
  hoja['!cols'] = [
    { wch: 8 }, // Tipo
    { wch: 30 }, // Descripción
    { wch: 18 }, // Categoría
    { wch: 18 }, // Cuenta
    { wch: 14 }, // Fecha prevista
    { wch: 16 }, // Fecha confirmada
    { wch: 12 }, // Importe
    { wch: 12 }, // Importe real
  ];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Movimientos');

  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export interface TotalesExportacion {
  totalIngresos: number;
  totalGastos: number;
  saldo: number;
}

/**
 * Función pura, sin dependencia de pdfkit ni de ninguna librería — separada
 * a propósito para poder verificarla con tests reales incluso en un
 * entorno sin acceso a internet para instalar pdfkit.
 */
export function calcularTotalesExportacion(filas: RegistroExportable[]): TotalesExportacion {
  const totalIngresos = filas
    .filter((f) => f.tipo === 'Ingreso')
    .reduce((acc, f) => acc + (f.importeReal ?? f.importe), 0);
  const totalGastos = filas
    .filter((f) => f.tipo === 'Gasto')
    .reduce((acc, f) => acc + (f.importeReal ?? f.importe), 0);

  return {
    totalIngresos: Math.round(totalIngresos * 100) / 100,
    totalGastos: Math.round(totalGastos * 100) / 100,
    saldo: Math.round((totalIngresos - totalGastos) * 100) / 100,
  };
}

function formatearImportePdf(n: number): string {
  return (
    new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'
  );
}

const COLUMNAS_PDF = [
  { titulo: 'Tipo', ancho: 45 },
  { titulo: 'Descripción', ancho: 140 },
  { titulo: 'Categoría', ancho: 90 },
  { titulo: 'Fecha', ancho: 65 },
  { titulo: 'Importe', ancho: 75 },
] as const;

const MARGEN = 40;
const ALTO_FILA = 20;

/**
 * Genera un PDF real con pdfkit: tabla de movimientos + totales al final.
 * Usa Helvetica (fuente estándar del PDF, sin necesidad de embeber ningún
 * archivo de fuente) — soporta tildes y eñes sin configuración adicional.
 *
 * NO VERIFICADO CON EJECUCIÓN REAL: este archivo se escribió sin acceso a
 * internet para instalar pdfkit y comprobarlo. calcularTotalesExportacion
 * (la lógica de negocio) sí está verificada; el dibujado del PDF en sí,
 * revisado a mano únicamente.
 */
export function generarPDF(filas: RegistroExportable[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: MARGEN, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const anchoPagina = doc.page.width - MARGEN * 2;

      function dibujarCabeceraTabla() {
        let x = MARGEN;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#37352f');
        for (const col of COLUMNAS_PDF) {
          doc.text(col.titulo, x, doc.y, { width: col.ancho, continued: false });
          x += col.ancho;
        }
        doc.moveDown(0.3);
        doc
          .moveTo(MARGEN, doc.y)
          .lineTo(MARGEN + anchoPagina, doc.y)
          .strokeColor('#e9e9e7')
          .stroke();
        doc.moveDown(0.3);
      }

      doc.font('Helvetica-Bold').fontSize(18).fillColor('#37352f').text('Movimientos');
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#787774')
        .text(`Generado el ${new Date().toLocaleDateString('es-ES')} · ${filas.length} movimientos`);
      doc.moveDown(1);

      dibujarCabeceraTabla();

      doc.font('Helvetica').fontSize(9).fillColor('#37352f');

      for (const fila of filas) {
        // Salto de página manual si no cabe otra fila antes del margen inferior.
        if (doc.y + ALTO_FILA > doc.page.height - MARGEN) {
          doc.addPage();
          dibujarCabeceraTabla();
          doc.font('Helvetica').fontSize(9).fillColor('#37352f');
        }

        const y = doc.y;
        let x = MARGEN;
        const valores = [
          fila.tipo,
          fila.descripcion,
          fila.categoria || '—',
          fila.fechaPrevista,
          formatearImportePdf(fila.importeReal ?? fila.importe),
        ];
        for (let i = 0; i < COLUMNAS_PDF.length; i++) {
          doc.fillColor(fila.tipo === 'Gasto' && i === 4 ? '#d44c47' : '#37352f');
          doc.text(valores[i], x, y, { width: COLUMNAS_PDF[i].ancho, height: ALTO_FILA });
          x += COLUMNAS_PDF[i].ancho;
        }
        doc.y = y + ALTO_FILA;
      }

      const totales = calcularTotalesExportacion(filas);
      doc.moveDown(1);
      doc
        .moveTo(MARGEN, doc.y)
        .lineTo(MARGEN + anchoPagina, doc.y)
        .strokeColor('#e9e9e7')
        .stroke();
      doc.moveDown(0.5);

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#2f9e44');
      doc.text(`Total ingresos: ${formatearImportePdf(totales.totalIngresos)}`);
      doc.fillColor('#d44c47');
      doc.text(`Total gastos: ${formatearImportePdf(totales.totalGastos)}`);
      doc.fillColor(totales.saldo >= 0 ? '#2f9e44' : '#d44c47');
      doc.text(`Saldo: ${formatearImportePdf(totales.saldo)}`);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
