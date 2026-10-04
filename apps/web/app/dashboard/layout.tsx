'use client';

import { useRouter } from 'next/navigation';
import { useEspacioActivo } from '../../lib/useEspacioActivo';
import { ProveedorEspacioActivo } from '../../lib/contexto-espacio-activo';
import { crearClienteSupabaseNavegador } from '../../lib/supabase-browser';
import { BarraLateral } from '../../components/BarraLateral';

/**
 * Layout compartido por toda la sección /dashboard: resuelve la sesión y el
 * espacio activo UNA sola vez (ver lib/contexto-espacio-activo.tsx) y monta
 * la barra lateral una sola vez, para que no se repita en cada navegación
 * entre pantallas del dashboard.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const estado = useEspacioActivo();

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (estado.cargando) {
    return (
      <main className="pantalla-centrada">
        <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  return (
    <ProveedorEspacioActivo value={estado}>
      <div className="app-layout">
        <BarraLateral
          nombreEspacio={estado.espacio?.nombre ?? 'Finanzas'}
          onCerrarSesion={cerrarSesion}
          espacioId={estado.espacio?.id}
          token={estado.token ?? undefined}
          espacios={estado.espacios}
          onCambiarEspacio={estado.cambiarEspacio}
        />
        {children}
      </div>
    </ProveedorEspacioActivo>
  );
}
