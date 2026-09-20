'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { useEspacioActivo } from '../../../lib/useEspacioActivo';
import { formatearFecha } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { Landmark, RefreshCw, Unlink, Search } from 'lucide-react';

interface Institucion {
  id: string;
  name: string;
  logo: string;
}

interface ConexionBancaria {
  id: string;
  institucion_id: string;
  institucion_nombre: string;
  estado: 'pendiente' | 'vinculada' | 'expirada' | 'error' | 'revocada';
  error_mensaje: string | null;
  created_at: string;
}

const ETIQUETA_ESTADO: Record<ConexionBancaria['estado'], string> = {
  pendiente: 'Pendiente de autorizar',
  vinculada: 'Vinculada',
  expirada: 'Acceso caducado',
  error: 'Error',
  revocada: 'Desvinculada',
};

const COLOR_ESTADO: Record<ConexionBancaria['estado'], string> = {
  pendiente: '#c9822a',
  vinculada: 'var(--color-green-text)',
  expirada: 'var(--color-red-text)',
  error: 'var(--color-red-text)',
  revocada: 'var(--color-text-muted)',
};

export default function PaginaBancos() {
  const router = useRouter();
  const { cargando: cargandoSesion, token, espacio, espacios, cambiarEspacio, error: errorEspacio } = useEspacioActivo();
  const [conexiones, setConexiones] = useState<ConexionBancaria[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarSelector, setMostrarSelector] = useState(false);

  // Guarda de qué espacio es la petición más reciente en vuelo — si al
  // cambiar de espacio la respuesta del anterior llega tarde, no debe pisar
  // la pantalla que ya muestra el espacio nuevo.
  const espacioIdVigente = useRef<string | null>(null);
  useEffect(() => {
    espacioIdVigente.current = espacio?.id ?? null;
  }, [espacio]);

  const cargarConexiones = useCallback(async (accessToken: string, espacioId: string) => {
    const respuesta = await fetch(`/api/bancos/conexiones?espacio_id=${espacioId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) throw new Error('No se han podido cargar las conexiones bancarias.');
    const cuerpo = await respuesta.json();
    if (espacioIdVigente.current !== espacioId) return;
    setConexiones(cuerpo.data ?? []);
  }, []);

  useEffect(() => {
    if (!token || !espacio) return;
    cargarConexiones(token, espacio.id).catch((e) =>
      setError(e instanceof Error ? e.message : 'Error al cargar los datos.')
    );
  }, [token, espacio, cargarConexiones]);

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function desvincular(id: string) {
    if (!token || !confirm('¿Desvincular este banco? Las cuentas ya importadas se quedan, pero dejarán de sincronizarse.')) return;
    const respuesta = await fetch(`/api/bancos/conexiones/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json();
      setError(cuerpo.error ?? 'No se ha podido desvincular el banco.');
      return;
    }
    if (espacio) await cargarConexiones(token, espacio.id);
  }

  if (cargandoSesion) {
    return (
      <main className="pantalla-centrada">
        <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  return (
    <div className="app-layout">
      <BarraLateral
        nombreEspacio={espacio?.nombre ?? 'Finanzas'}
        onCerrarSesion={cerrarSesion}
        espacioId={espacio?.id}
        token={token ?? undefined}
        espacios={espacios}
        onCambiarEspacio={cambiarEspacio}
      />
      <main className="contenido" style={{ maxWidth: 840 }}>
        <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Bancos</h1>
            <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
              Conecta tu banco (vía GoCardless, con licencia AISP) para traer tus movimientos automáticamente. Solo
              lectura: nunca puede mover tu dinero.
            </p>
          </div>
          {token && espacio && (
            <button className="boton-primario" onClick={() => setMostrarSelector(true)}>
              + Conectar banco
            </button>
          )}
        </header>

        {(errorEspacio || error) && (
          <p className="mensaje-error" style={{ marginBottom: 24 }}>{errorEspacio || error}</p>
        )}

        <div className="tarjeta" style={{ padding: 0 }}>
          {conexiones.length === 0 ? (
            <p className="estado-vacio">
              Aún no tienes ningún banco conectado. Pulsa "+ Conectar banco" para autorizar el acceso de solo
              lectura a tus movimientos.
            </p>
          ) : (
            conexiones.map((c, i) => (
              <FilaConexion
                key={c.id}
                conexion={c}
                token={token!}
                esUltima={i === conexiones.length - 1}
                onDesvincular={() => desvincular(c.id)}
                onSincronizado={() => espacio && token && cargarConexiones(token, espacio.id)}
              />
            ))
          )}
        </div>

        {mostrarSelector && token && espacio && (
          <SelectorBanco
            token={token}
            espacioId={espacio.id}
            onCerrar={() => setMostrarSelector(false)}
          />
        )}
      </main>
    </div>
  );
}

function FilaConexion({
  conexion,
  token,
  esUltima,
  onDesvincular,
  onSincronizado,
}: {
  conexion: ConexionBancaria;
  token: string;
  esUltima: boolean;
  onDesvincular: () => void;
  onSincronizado: () => void;
}) {
  const [sincronizando, setSincronizando] = useState(false);
  const [comprobando, setComprobando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function comprobarEstado() {
    setComprobando(true);
    setResultado(null);
    try {
      const respuesta = await fetch(`/api/bancos/conexiones/${conexion.id}/finalizar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? 'Todavía no se ha completado la autorización en el banco.');
      onSincronizado();
    } catch (e) {
      setResultado(e instanceof Error ? e.message : 'Error al comprobar el estado.');
    } finally {
      setComprobando(false);
    }
  }

  async function sincronizar() {
    setSincronizando(true);
    setResultado(null);
    try {
      const respuesta = await fetch(`/api/bancos/conexiones/${conexion.id}/sincronizar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se ha podido sincronizar.');
      setResultado(`${cuerpo.data.totalCreados} movimientos nuevos importados.`);
      onSincronizado();
    } catch (e) {
      setResultado(e instanceof Error ? e.message : 'Error al sincronizar.');
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        borderBottom: esUltima ? 'none' : '1px solid var(--color-border)',
      }}
    >
      <Landmark size={18} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14 }}>{conexion.institucion_nombre}</p>
        <p className="texto-ayuda" style={{ margin: '2px 0 0', fontSize: 12 }}>
          <span style={{ color: COLOR_ESTADO[conexion.estado] }}>{ETIQUETA_ESTADO[conexion.estado]}</span>
          {conexion.error_mensaje && ` — ${conexion.error_mensaje}`}
          {' · desde '}
          {formatearFecha(conexion.created_at.slice(0, 10))}
        </p>
        {resultado && (
          <p className="texto-ayuda" style={{ margin: '4px 0 0', fontSize: 12 }}>
            {resultado}
          </p>
        )}
      </div>
      {conexion.estado === 'vinculada' && (
        <button className="enlace-discreto" onClick={sincronizar} disabled={sincronizando} title="Sincronizar">
          <RefreshCw size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {sincronizando ? 'Sincronizando…' : 'Sincronizar'}
        </button>
      )}
      {conexion.estado === 'pendiente' && (
        <button className="enlace-discreto" onClick={comprobarEstado} disabled={comprobando} title="Comprobar estado">
          <RefreshCw size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {comprobando ? 'Comprobando…' : 'Comprobar estado'}
        </button>
      )}
      {conexion.estado !== 'revocada' && (
        <button
          className="enlace-discreto"
          style={{ color: 'var(--color-red-text)' }}
          onClick={onDesvincular}
          title="Desvincular"
        >
          <Unlink size={14} />
        </button>
      )}
    </div>
  );
}

function SelectorBanco({ token, espacioId, onCerrar }: { token: string; espacioId: string; onCerrar: () => void }) {
  const [instituciones, setInstituciones] = useState<Institucion[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conectando, setConectando] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch('/api/bancos/instituciones?pais=ES', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'No se han podido cargar los bancos disponibles.');
        return r.json();
      })
      .then((cuerpo) => {
        if (!cancelado) setInstituciones(cuerpo.data ?? []);
      })
      .catch((e) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'Error al cargar los bancos.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  async function conectar(institucion: Institucion) {
    setConectando(institucion.id);
    setError(null);
    try {
      const respuesta = await fetch('/api/bancos/conexiones', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: espacioId,
          institucion_id: institucion.id,
          institucion_nombre: institucion.name,
          redirect_url: `${window.location.origin}/dashboard/bancos/callback`,
        }),
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se ha podido iniciar la conexión.');
      window.location.href = cuerpo.link;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al conectar.');
      setConectando(null);
    }
  }

  const filtradas = instituciones.filter((i) => i.name.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        zIndex: 100,
        overflowY: 'auto',
      }}
      onClick={onCerrar}
    >
      <div className="tarjeta" style={{ width: 480, maxWidth: '100%', padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Conectar banco</h2>
          <button className="enlace-discreto" onClick={onCerrar}>
            Cerrar
          </button>
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--color-text-muted)' }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar tu banco (BBVA, Santander, CaixaBank…)"
            className="campo-texto"
            style={{ paddingLeft: 30 }}
          />
        </div>

        {error && <p className="mensaje-error" style={{ marginBottom: 12 }}>{error}</p>}

        {cargando ? (
          <p className="texto-ayuda">Cargando bancos disponibles…</p>
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtradas.length === 0 && <p className="texto-ayuda">Ningún banco coincide con "{busqueda}".</p>}
            {filtradas.slice(0, 30).map((inst) => (
              <button
                key={inst.id}
                onClick={() => conectar(inst)}
                disabled={conectando !== null}
                className="boton-secundario"
                style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {inst.logo && <img src={inst.logo} alt="" width={20} height={20} style={{ borderRadius: 4 }} />}
                {conectando === inst.id ? `Conectando con ${inst.name}…` : inst.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
