'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { useEspacioActivo } from '../../../lib/useEspacioActivo';
import { formatearFecha, formatearMoneda } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { AlertTriangle, Clock, Info } from 'lucide-react';

interface Notificacion {
  id: string;
  tipo: string;
  severidad: 'info' | 'aviso' | 'alerta';
  mensaje: string;
  fecha: string;
  entidadTipo: 'gasto' | 'ingreso' | 'presupuesto';
  entidadId: string;
  importe: number | null;
}

const ICONO_POR_SEVERIDAD = {
  info: Info,
  aviso: Clock,
  alerta: AlertTriangle,
};

const COLOR_POR_SEVERIDAD = {
  info: 'var(--color-accent)',
  aviso: '#c9822a',
  alerta: 'var(--color-red-text)',
};

export default function PaginaNotificaciones() {
  const router = useRouter();
  const { cargando: cargandoSesion, token, espacio, espacios, cambiarEspacio, error: errorEspacio } = useEspacioActivo();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resolviendo, setResolviendo] = useState<string | null>(null);

  // Guarda de qué espacio es la petición más reciente en vuelo — si al
  // cambiar de espacio la respuesta del anterior llega tarde, no debe pisar
  // la pantalla que ya muestra el espacio nuevo.
  const espacioIdVigente = useRef<string | null>(null);
  useEffect(() => {
    espacioIdVigente.current = espacio?.id ?? null;
  }, [espacio]);

  const cargarNotificaciones = useCallback(async (accessToken: string, espacioId: string) => {
    const respuesta = await fetch(`/api/notificaciones?espacio_id=${espacioId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) throw new Error('No se han podido cargar las notificaciones.');
    const cuerpo = await respuesta.json();
    if (espacioIdVigente.current !== espacioId) return;
    setNotificaciones(cuerpo.data ?? []);
  }, []);

  useEffect(() => {
    if (!token || !espacio) return;
    cargarNotificaciones(token, espacio.id).catch((e) =>
      setError(e instanceof Error ? e.message : 'Error al cargar los datos.')
    );
  }, [token, espacio, cargarNotificaciones]);

  async function confirmar(n: Notificacion, importeReal: number) {
    if (!token) return;
    setResolviendo(n.id);
    try {
      const tabla = n.entidadTipo === 'ingreso' ? 'ingresos' : 'gastos';
      const campoFecha = n.entidadTipo === 'ingreso' ? 'fecha_cobrada' : 'fecha_pagada';
      const respuesta = await fetch(`/api/${tabla}/${n.entidadId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ importe_real: importeReal, [campoFecha]: new Date().toISOString().slice(0, 10) }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido confirmar el movimiento.');
      }
      setNotificaciones((anteriores) => anteriores.filter((x) => x.id !== n.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar.');
    } finally {
      setResolviendo(null);
    }
  }

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
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
      <main className="contenido" style={{ maxWidth: 720 }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Notificaciones</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Pagos y cobros próximos o vencidos, y presupuestos superados. Calculado al momento, no es un histórico.
          </p>
        </header>

        {(errorEspacio || error) && (
          <p className="mensaje-error" style={{ marginBottom: 24 }}>
            {errorEspacio || error}
          </p>
        )}

        {notificaciones.length === 0 ? (
          <div className="tarjeta">
            <p className="estado-vacio">Todo al día — no hay ninguna alerta pendiente ahora mismo.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notificaciones.map((n) => {
              const Icono = ICONO_POR_SEVERIDAD[n.severidad];
              return (
                <div
                  key={n.id}
                  className="tarjeta tarjeta-interactiva"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}
                >
                  <Icono size={18} strokeWidth={1.75} color={COLOR_POR_SEVERIDAD[n.severidad]} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14 }}>{n.mensaje}</p>
                    <p className="texto-ayuda" style={{ margin: '2px 0 0', fontSize: 12 }}>
                      {formatearFecha(n.fecha)}
                      {n.importe !== null && ` · ${formatearMoneda(n.importe)}`}
                    </p>
                  </div>
                  <AccionNotificacion n={n} resolviendo={resolviendo === n.id} onConfirmar={confirmar} />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function AccionNotificacion({
  n,
  resolviendo,
  onConfirmar,
}: {
  n: Notificacion;
  resolviendo: boolean;
  onConfirmar: (n: Notificacion, importeReal: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [importe, setImporte] = useState(String(n.importe ?? 0));

  if (n.entidadTipo === 'presupuesto') {
    return (
      <Link href="/dashboard/presupuestos" className="enlace-discreto" style={{ fontSize: 12, flexShrink: 0 }}>
        Ver presupuesto
      </Link>
    );
  }

  const etiqueta = n.entidadTipo === 'ingreso' ? 'Marcar cobrado' : 'Marcar pagado';

  if (editando) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <input
          type="number"
          step="0.01"
          value={importe}
          onChange={(e) => setImporte(e.target.value)}
          className="campo-texto"
          style={{ width: 90, padding: '4px 6px', fontSize: 12 }}
        />
        <button
          className="enlace-discreto"
          style={{ fontSize: 12 }}
          disabled={resolviendo}
          onClick={() => onConfirmar(n, Number(importe))}
        >
          {resolviendo ? 'Guardando…' : 'OK'}
        </button>
      </div>
    );
  }

  return (
    <button className="enlace-discreto" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => setEditando(true)}>
      {etiqueta}
    </button>
  );
}
