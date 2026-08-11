'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Landmark,
  Receipt,
  PiggyBank,
  Wallet,
  Users,
  Bell,
  Sparkles,
  LogOut,
} from 'lucide-react';

interface Props {
  nombreEspacio: string;
  onCerrarSesion: () => void;
  /** Opcionales: si se pasan, la campana de notificaciones muestra el contador real. */
  espacioId?: string;
  token?: string;
}

const ITEMS = [
  { href: '/dashboard', etiqueta: 'Panel', Icono: LayoutDashboard },
  { href: '/dashboard/chat', etiqueta: 'Asistente financiero', Icono: Sparkles },
  { href: '/dashboard/movimientos', etiqueta: 'Movimientos', Icono: Receipt },
  { href: '/dashboard/presupuestos', etiqueta: 'Presupuestos', Icono: PiggyBank },
  { href: '/dashboard/pasivos', etiqueta: 'Préstamos e hipotecas', Icono: Landmark },
  { href: '/dashboard/activos', etiqueta: 'Activos', Icono: Wallet },
  { href: '/dashboard/usuarios', etiqueta: 'Usuarios', Icono: Users },
];

export function BarraLateral({ nombreEspacio, onCerrarSesion, espacioId, token }: Props) {
  const pathname = usePathname();
  const inicial = nombreEspacio.trim().charAt(0).toUpperCase() || '?';
  const [numNotificaciones, setNumNotificaciones] = useState<number | null>(null);

  useEffect(() => {
    if (!espacioId || !token) return;
    fetch(`/api/notificaciones?espacio_id=${espacioId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((cuerpo) => setNumNotificaciones((cuerpo.data ?? []).length))
      .catch(() => setNumNotificaciones(null));
  }, [espacioId, token]);

  return (
    <nav className="sidebar">
      <div className="sidebar-cabecera">
        <div className="sidebar-avatar">{inicial}</div>
        <span className="sidebar-titulo">{nombreEspacio}</span>
      </div>

      <Link
        href="/dashboard/notificaciones"
        className={`sidebar-item ${pathname === '/dashboard/notificaciones' ? 'activo' : ''}`}
        style={{ justifyContent: 'space-between' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bell size={16} strokeWidth={1.75} />
          Notificaciones
        </span>
        {numNotificaciones !== null && numNotificaciones > 0 && (
          <span
            className="cifra"
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 10,
              background: 'var(--color-red-text)',
              color: '#fff',
            }}
          >
            {numNotificaciones}
          </span>
        )}
      </Link>

      {ITEMS.map(({ href, etiqueta, Icono }) => (
        <Link
          key={href}
          href={href}
          className={`sidebar-item ${pathname === href ? 'activo' : ''}`}
        >
          <Icono size={16} strokeWidth={1.75} />
          {etiqueta}
        </Link>
      ))}

      <div style={{ flex: 1 }} />
      <button className="sidebar-item" onClick={onCerrarSesion}>
        <LogOut size={16} strokeWidth={1.75} />
        Cerrar sesión
      </button>
    </nav>
  );
}
