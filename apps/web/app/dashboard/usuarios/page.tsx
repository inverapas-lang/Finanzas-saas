'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { formatearFecha } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';

interface Espacio {
  id: string;
  nombre: string;
}

type Rol = 'owner' | 'usuario' | 'asesor' | 'invitado';

interface Miembro {
  id: string;
  usuario_id: string;
  rol: Rol;
  created_at: string;
  usuarios: { email: string; nombre: string };
}

const ETIQUETAS_ROL: Record<Rol, string> = {
  owner: 'Propietario',
  usuario: 'Usuario',
  asesor: 'Asesor',
  invitado: 'Invitado',
};

export default function PaginaUsuarios() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [miUsuarioId, setMiUsuarioId] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarMiembros = useCallback(async (accessToken: string, espacioId: string) => {
    const respuesta = await fetch(`/api/espacios/${espacioId}/miembros`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) throw new Error('No se han podido cargar los usuarios.');
    const cuerpo = await respuesta.json();
    setMiembros(cuerpo.data ?? []);
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
      setMiUsuarioId(sesion.session.user.id);

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
        await cargarMiembros(sesion.session.access_token, primerEspacio.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        setCargandoSesion(false);
      }
    }

    inicializar();
  }, [router, cargarMiembros]);

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  const soyOwner = miembros.some((m) => m.usuario_id === miUsuarioId && m.rol === 'owner');

  if (cargandoSesion) {
    return (
      <main className="pantalla-centrada">
        <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  return (
    <div className="app-layout">
      <BarraLateral nombreEspacio={espacio?.nombre ?? 'Finanzas'} onCerrarSesion={cerrarSesion} espacioId={espacio?.id} token={token ?? undefined} />
      <main className="contenido" style={{ maxWidth: 880, padding: '40px 48px' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Usuarios</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Quién tiene acceso a este espacio, y con qué permisos.
          </p>
        </header>

        {error && (
          <p className="mensaje-error" style={{ marginBottom: 24 }}>
            {error}
          </p>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 32 }}>
          <div className="tarjeta" style={{ padding: 0 }}>
            <table className="tabla-filas-hover" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {miembros.map((m, i) => (
                  <FilaMiembro
                    key={m.id}
                    miembro={m}
                    esUltima={i === miembros.length - 1}
                    esUnoMismo={m.usuario_id === miUsuarioId}
                    puedeEliminar={soyOwner && m.rol !== 'owner' && m.usuario_id !== miUsuarioId}
                    token={token!}
                    espacioId={espacio!.id}
                    onCambio={() => cargarMiembros(token!, espacio!.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {token && espacio && soyOwner && (
            <FormularioInvitar
              token={token}
              espacioId={espacio.id}
              onInvitado={() => cargarMiembros(token, espacio.id)}
            />
          )}

          {token && espacio && !soyOwner && (
            <p className="texto-ayuda">
              Solo el propietario del espacio puede invitar o eliminar usuarios.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

function FilaMiembro({
  miembro,
  esUltima,
  esUnoMismo,
  puedeEliminar,
  token,
  espacioId,
  onCambio,
}: {
  miembro: Miembro;
  esUltima: boolean;
  esUnoMismo: boolean;
  puedeEliminar: boolean;
  token: string;
  espacioId: string;
  onCambio: () => void;
}) {
  const [eliminando, setEliminando] = useState(false);

  async function eliminar() {
    if (!confirm(`¿Quitar a ${miembro.usuarios.email} de este espacio?`)) return;
    setEliminando(true);
    try {
      const respuesta = await fetch(`/api/espacios/${espacioId}/miembros/${miembro.usuario_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!respuesta.ok && respuesta.status !== 204) {
        const cuerpo = await respuesta.json();
        alert(cuerpo.error ?? 'No se ha podido eliminar.');
        return;
      }
      onCambio();
    } finally {
      setEliminando(false);
    }
  }

  return (
    <tr style={{ borderBottom: esUltima ? 'none' : '1px solid var(--color-border)' }}>
      <td style={{ padding: '12px 16px', fontSize: 14 }}>
        {miembro.usuarios.nombre}
        {esUnoMismo && <span className="texto-ayuda"> (tú)</span>}
        <br />
        <span className="texto-ayuda">{miembro.usuarios.email}</span>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span
          className="etiqueta-mayus"
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            background: miembro.rol === 'owner' ? 'var(--color-accent-bg)' : 'var(--color-hover)',
            color: miembro.rol === 'owner' ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
        >
          {ETIQUETAS_ROL[miembro.rol]}
        </span>
      </td>
      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text-muted)' }}>
        Desde {formatearFecha(miembro.created_at.slice(0, 10))}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
        {puedeEliminar && (
          <button
            className="enlace-discreto"
            onClick={eliminar}
            disabled={eliminando}
            style={{ color: 'var(--color-red-text)' }}
          >
            {eliminando ? 'Quitando…' : 'Quitar'}
          </button>
        )}
      </td>
    </tr>
  );
}

function FormularioInvitar({
  token,
  espacioId,
  onInvitado,
}: {
  token: string;
  espacioId: string;
  onInvitado: () => void;
}) {
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<'usuario' | 'asesor' | 'invitado'>('usuario');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  async function invitar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    setExito(false);

    try {
      const respuesta = await fetch(`/api/espacios/${espacioId}/miembros`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, rol }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido invitar.');
      }
      setEmail('');
      setExito(true);
      onInvitado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al invitar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Invitar a alguien</h2>
      <form onSubmit={invitar} className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
            placeholder="mimujer@ejemplo.com"
          />
        </label>

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Rol
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as typeof rol)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          >
            <option value="usuario">Usuario (puede editar ingresos, gastos, activos y pasivos)</option>
            <option value="asesor">Asesor / gestor (solo lectura)</option>
            <option value="invitado">Invitado (solo lectura)</option>
          </select>
        </label>

        <p className="texto-ayuda" style={{ margin: 0 }}>
          Solo funciona si esa persona ya se ha registrado en la aplicación con ese email. No enviamos ningún
          correo de invitación automático.
        </p>

        {error && <p className="mensaje-error">{error}</p>}
        {exito && (
          <p className="texto-ayuda" style={{ color: 'var(--color-green-text)' }}>
            Invitación añadida correctamente.
          </p>
        )}

        <button type="submit" className="boton-primario" disabled={guardando}>
          {guardando ? 'Invitando…' : 'Invitar'}
        </button>
      </form>
    </div>
  );
}
