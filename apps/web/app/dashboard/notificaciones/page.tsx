'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { formatearFecha } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { AlertTriangle, Clock, Info } from 'lucide-react';

interface Espacio {
  id: string;
  nombre: string;
}

interface Notificacion {
  id: string;
  tipo: string;
  severidad: 'info' | 'aviso' | 'alerta';
  mensaje: string;
  fecha: string;
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
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarNotificaciones = useCallback(async (accessToken: string, espacioId: string) => {
    const respuesta = await fetch(`/api/notificaciones?espacio_id=${espacioId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) throw new Error('No se han podido cargar las notificaciones.');
    const cuerpo = await respuesta.json();
    setNotificaciones(cuerpo.data ?? []);
  }, []);

  useEffect(() => {
    const supabase = crearClienteSupabaseNavegador();

    async function inicializar() {
      const { data: sesion } = await supabase.auth.getSession();
      if (!sesion.session) {
        router.push('/login');
        return;
      }
      setToken(sesion.session.access_token);

      const { data: espacios, error: errorEspacios } = await supabase
        .from('espacios_financieros')
        .select('id, nombre')
        .limit(1);

      if (errorEspacios || !espacios || espacios.length === 0) {
        setError('No perteneces a ningún espacio financiero todavía.');
        setCargandoSesion(false);
        return;
      }

      const primerEspacio = espacios[0] as Espacio;
      setEspacio(primerEspacio);

      try {
        await cargarNotificaciones(sesion.session.access_token, primerEspacio.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        setCargandoSesion(false);
      }
    }

    inicializar();
  }, [router, cargarNotificaciones]);

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
      />
      <main className="contenido" style={{ maxWidth: 720, padding: '40px 48px' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Notificaciones</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Pagos y cobros próximos o vencidos, y presupuestos superados. Calculado al momento, no es un histórico.
          </p>
        </header>

        {error && (
          <p className="mensaje-error" style={{ marginBottom: 24 }}>
            {error}
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
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
