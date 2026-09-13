import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

/**
 * Exportador genérico de tablas (no de listados de movimientos, para eso
 * está lib/exportar.ts) — pensado para lo que ya se agrega en pantalla en
 * /dashboard/informes y /dashboard/graficos: cada "hoja" es una tabla con
 * cabecera de columnas y filas de celdas ya formateadas como texto/número,
 * calculadas en el cliente reutilizando lib/agregaciones-informes.ts. Este
 * módulo solo se encarga de volcarlas a un libro Excel o a un PDF.
 */
export interface HojaExportable {
  titulo: string;
  columnas: string[];
  filas: (string | number)[][];
}

const ANCHO_COLUMNA_POR_DEFECTO = 16;

export function generarXLSXTablas(hojas: HojaExportable[]): Buffer {
  const libro = XLSX.utils.book_new();

  for (const hoja of hojas) {
    const datosHoja = [hoja.columnas, ...hoja.filas];
    const worksheet = XLSX.utils.aoa_to_sheet(datosHoja);
    worksheet['!cols'] = hoja.columnas.map((c, i) => ({
      wch: Math.max(ANCHO_COLUMNA_POR_DEFECTO, c.length + 2, i === 0 ? 22 : 0),
    }));
    // Los nombres de hoja de Excel no admiten " : \ / ? * [ ] " ni más de 31 caracteres.
    const nombreHoja = hoja.titulo.replace(/[:\\/?*[\]]/g, '').slice(0, 31) || 'Hoja';
    XLSX.utils.book_append_sheet(libro, worksheet, nombreHoja);
  }

  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const MARGEN = 40;
const ALTO_FILA = 18;

function formatearCelda(valor: string | number): string {
  if (typeof valor === 'number') {
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
  }
  return valor;
}

/**
 * PDF con una tabla por hoja (salto de página entre hojas), pensado para
 * imprimir/archivar el informe tal cual se ve en pantalla. Misma
 * salvedad que generarPDF en lib/exportar.ts: sigue el mismo patrón ya
 * usado ahí (que tampoco se ha podido ejecutar contra pdfkit real en
 * este entorno por el bloqueo de red), revisado a mano.
 */
export function generarPDFTablas(tituloDocumento: string, hojas: HojaExportable[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: MARGEN, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const anchoPagina = doc.page.width - MARGEN * 2;

      hojas.forEach((hoja, indiceHoja) => {
        if (indiceHoja > 0) doc.addPage();

        const anchoColumna = anchoPagina / hoja.columnas.length;

        doc.font('Helvetica-Bold').fontSize(16).fillColor('#37352f').text(tituloDocumento);
        doc.font('Helvetica').fontSize(11).fillColor('#787774').text(hoja.titulo);
        doc.moveDown(0.8);

        function dibujarCabecera() {
          let x = MARGEN;
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#37352f');
          for (const col of hoja.columnas) {
            doc.text(col, x, doc.y, { width: anchoColumna, continued: false });
            x += anchoColumna;
          }
          doc.moveDown(0.3);
          doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + anchoPagina, doc.y).strokeColor('#e9e9e7').stroke();
          doc.moveDown(0.3);
        }

        dibujarCabecera();
        doc.font('Helvetica').fontSize(9).fillColor('#37352f');

        for (const fila of hoja.filas) {
          if (doc.y + ALTO_FILA > doc.page.height - MARGEN) {
            doc.addPage();
            dibujarCabecera();
            doc.font('Helvetica').fontSize(9).fillColor('#37352f');
          }

          const y = doc.y;
          let x = MARGEN;
          for (const celda of fila) {
            doc.text(formatearCelda(celda), x, y, { width: anchoColumna, height: ALTO_FILA });
            x += anchoColumna;
          }
          doc.y = y + ALTO_FILA;
        }
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
