'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { crearClienteSupabaseNavegador } from '../lib/supabase-browser';
import { construirRutaDocumento, type EntidadDocumental } from '../lib/documentos';
import { Paperclip, FileText, Trash2, Download } from 'lucide-react';

interface Documento {
  id: string;
  nombre_archivo: string;
  tipo_mime: string;
  url_storage: string;
  created_at: string;
}

const TIPOS_ACEPTADOS = '.pdf,.jpg,.jpeg,.png,.heic';
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB, igual que el límite del bucket

export function Adjuntos({
  espacioId,
  entidadTipo,
  entidadId,
}: {
  espacioId: string;
  entidadTipo: EntidadDocumental;
  entidadId: string;
}) {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const supabase = crearClienteSupabaseNavegador();
    const { data, error: errorConsulta } = await supabase
      .from('documentos')
      .select('id, nombre_archivo, tipo_mime, url_storage, created_at')
      .eq('entidad_tipo', entidadTipo)
      .eq('entidad_id', entidadId)
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError('No se han podido cargar los documentos.');
      return;
    }
    setDocumentos(data ?? []);
  }, [entidadTipo, entidadId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function subirArchivo(archivo: File) {
    setError(null);

    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      setError('El archivo pesa más de 10 MB — es el límite del plan actual.');
      return;
    }

    setSubiendo(true);
    const supabase = crearClienteSupabaseNavegador();

    try {
      const ruta = construirRutaDocumento(espacioId, entidadTipo, entidadId, archivo.name);

      const { error: errorSubida } = await supabase.storage.from('documentos').upload(ruta, archivo, {
        contentType: archivo.type || 'application/octet-stream',
      });
      if (errorSubida) throw new Error(errorSubida.message);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const { error: errorInsercion } = await supabase.from('documentos').insert({
        espacio_id: espacioId,
        entidad_tipo: entidadTipo,
        entidad_id: entidadId,
        url_storage: ruta,
        nombre_archivo: archivo.name,
        tipo_mime: archivo.type || 'application/octet-stream',
        tamano_bytes: archivo.size,
        subido_por: user.id,
      });
      if (errorInsercion) {
        // Si falla guardar la fila, intentamos limpiar el archivo huérfano
        // en Storage para no dejar basura sin referencia.
        await supabase.storage.from('documentos').remove([ruta]);
        throw new Error(errorInsercion.message);
      }

      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido subir el archivo.');
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function descargar(documento: Documento) {
    const supabase = crearClienteSupabaseNavegador();
    const { data, error: errorDescarga } = await supabase.storage
      .from('documentos')
      .createSignedUrl(documento.url_storage, 60); // enlace válido 60 segundos

    if (errorDescarga || !data) {
      setError('No se ha podido generar el enlace de descarga.');
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  async function eliminar(documento: Documento) {
    if (!confirm(`¿Eliminar "${documento.nombre_archivo}"?`)) return;
    const supabase = crearClienteSupabaseNavegador();

    const { error: errorBorrado } = await supabase.from('documentos').delete().eq('id', documento.id);
    if (errorBorrado) {
      setError('No se ha podido eliminar el documento.');
      return;
    }
    await supabase.storage.from('documentos').remove([documento.url_storage]);
    await cargar();
  }

  return (
    <div style={{ marginTop: 16 }}>
      <p className="etiqueta-mayus" style={{ margin: '0 0 8px' }}>Documentos adjuntos</p>

      {documentos === null ? (
        <p className="texto-ayuda">Cargando…</p>
      ) : documentos.length === 0 ? (
        <p className="texto-ayuda" style={{ marginBottom: 8 }}>Sin documentos todavía.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {documentos.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-hover-suave)',
              }}
            >
              <FileText size={14} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />
              <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.nombre_archivo}
              </span>
              <button
                className="enlace-discreto"
                onClick={() => descargar(d)}
                style={{ padding: 2 }}
                title="Descargar"
              >
                <Download size={14} />
              </button>
              <button
                className="enlace-discreto"
                onClick={() => eliminar(d)}
                style={{ padding: 2, color: 'var(--color-red-text)' }}
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mensaje-error" style={{ marginBottom: 8 }}>{error}</p>}

      <label className="enlace-discreto" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <Paperclip size={14} />
        {subiendo ? 'Subiendo…' : 'Adjuntar archivo'}
        <input
          ref={inputRef}
          type="file"
          accept={TIPOS_ACEPTADOS}
          disabled={subiendo}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) subirArchivo(archivo);
          }}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  );
}
