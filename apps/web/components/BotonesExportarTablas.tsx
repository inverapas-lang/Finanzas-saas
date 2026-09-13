'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import type { HojaExportable } from '../lib/exportar-tablas';

interface Props {
  token: string;
  titulo: string;
  /** Se llama en el momento de pulsar el botón, así siempre exporta los datos que se ven en pantalla ahora mismo. */
  construirHojas: () => HojaExportable[];
}

/** Botones "Excel"/"PDF" reutilizados por Informes y Gráficos para bajarse las tablas ya agregadas en pantalla. */
export function BotonesExportarTablas({ token, titulo, construirHojas }: Props) {
  const [descargando, setDescargando] = useState<'xlsx' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function descargar(formato: 'xlsx' | 'pdf') {
    setDescargando(formato);
    setError(null);
    try {
      const hojas = construirHojas();
      if (hojas.length === 0 || hojas.every((h) => h.filas.length === 0)) {
        setError('No hay datos que exportar todavía.');
        return;
      }

      const respuesta = await fetch('/api/informes/exportar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ formato, titulo, hojas }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido generar el archivo.');
      }

      const blob = await respuesta.blob();
      const url = window.URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      const nombreBase = titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      enlace.download = `${nombreBase}.${formato}`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar.');
    } finally {
      setDescargando(null);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button className="boton-secundario" onClick={() => descargar('xlsx')} disabled={descargando !== null}>
        <Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        {descargando === 'xlsx' ? 'Generando…' : 'Excel'}
      </button>
      <button className="boton-secundario" onClick={() => descargar('pdf')} disabled={descargando !== null}>
        <Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        {descargando === 'pdf' ? 'Generando…' : 'PDF'}
      </button>
      {error && <span className="mensaje-error" style={{ padding: '4px 8px' }}>{error}</span>}
    </div>
  );
}
