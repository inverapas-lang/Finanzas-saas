'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { formatearMoneda, formatearFecha } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { Target, Trash2 } from 'lucide-react';

interface Espacio {
  id: string;
  nombre: string;
}

interface Cuenta {
  id: string;
  nombre: string;
}

interface Meta {
  id: string;
  nombre: string;
  importe_objetivo: number;
  importe_actual: number;
  fecha_objetivo: string | null;
  cuenta_id: string | null;
  activa: boolean;
}

export default function PaginaMetas() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarTodo = useCallback(async (accessToken: string, espacioId: string) => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [resMetas, resCuentas] = await Promise.all([
      fetch(`/api/metas?espacio_id=${espacioId}`, { headers }),
      fetch(`/api/cuentas-bancarias?espacio_id=${espacioId}`, { headers }),
    ]);
    if (!resMetas.ok || !resCuentas.ok) throw new Error('No se han podido cargar las metas de ahorro.');
    setMetas((await resMetas.json()).data ?? []);
    setCuentas((await resCuentas.json()).data ?? []);
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
        await cargarTodo(sesion.session.access_token, primerEspacio.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        setCargandoSesion(false);
      }
    }

    inicializar();
  }, [router, cargarTodo]);

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function eliminar(id: string) {
    if (!token || !confirm('¿Eliminar esta meta de ahorro?')) return;
    await fetch(`/api/metas/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (espacio) await cargarTodo(token, espacio.id);
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
      <BarraLateral nombreEspacio={espacio?.nombre ?? 'Finanzas'} onCerrarSesion={cerrarSesion} espacioId={espacio?.id} token={token ?? undefined} />
      <main className="contenido" style={{ maxWidth: 960, padding: '40px 48px' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Metas de ahorro</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Objetivos de ahorro con progreso manual — tú registras cuánto llevas conseguido, igual que con los
            activos.
          </p>
        </header>

        {error && <p className="mensaje-error" style={{ marginBottom: 24 }}>{error}</p>}

        <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32 }}>
          {token && espacio && (
            <>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Tus metas ({metas.length})</h2>
                {metas.length === 0 ? (
                  <div className="tarjeta">
                    <p className="estado-vacio">
                      Aún no tienes ninguna meta. Crea la primera con el formulario de la derecha (ej. "Fondo de
                      emergencia", 6.000€).
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {metas.map((m) => (
                      <TarjetaMeta
                        key={m.id}
                        meta={m}
                        token={token}
                        onCambio={() => cargarTodo(token, espacio.id)}
                        onEliminar={() => eliminar(m.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <FormularioMeta
                token={token}
                espacioId={espacio.id}
                cuentas={cuentas}
                onCreado={() => cargarTodo(token, espacio.id)}
              />
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function TarjetaMeta({
  meta,
  token,
  onCambio,
  onEliminar,
}: {
  meta: Meta;
  token: string;
  onCambio: () => void;
  onEliminar: () => void;
}) {
  const [aportando, setAportando] = useState(false);
  const [aporte, setAporte] = useState('');
  const [guardando, setGuardando] = useState(false);

  const progreso = Math.min(100, (meta.importe_actual / meta.importe_objetivo) * 100);
  const cumplida = meta.importe_actual >= meta.importe_objetivo;

  async function registrarAporte() {
    const cantidad = Number(aporte);
    if (!Number.isFinite(cantidad) || cantidad === 0) {
      setAportando(false);
      return;
    }
    setGuardando(true);
    await fetch(`/api/metas/${meta.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ importe_actual: Math.max(0, meta.importe_actual + cantidad) }),
    });
    setGuardando(false);
    setAportando(false);
    setAporte('');
    onCambio();
  }

  return (
    <div className="tarjeta">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Target size={18} strokeWidth={1.75} style={{ marginTop: 2, color: cumplida ? '#2a9d5c' : 'var(--color-text-muted)' }} />
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{meta.nombre}</p>
            <p className="texto-ayuda" style={{ margin: '2px 0 0', fontSize: 12 }}>
              {formatearMoneda(meta.importe_actual)} de {formatearMoneda(meta.importe_objetivo)}
              {meta.fecha_objetivo && ` · objetivo ${formatearFecha(meta.fecha_objetivo)}`}
            </p>
          </div>
        </div>
        <button className="enlace-discreto" style={{ color: 'var(--color-red-text)' }} onClick={onEliminar} title="Eliminar">
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ marginTop: 12, height: 8, borderRadius: 4, background: 'var(--color-border)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${progreso}%`,
            background: cumplida ? '#2a9d5c' : 'var(--color-accent)',
            transition: 'width 0.3s',
          }}
        />
      </div>

      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="texto-ayuda" style={{ fontSize: 12 }}>
          {cumplida ? '✓ Meta cumplida' : `${progreso.toFixed(0)}% conseguido`}
        </span>
        {aportando ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number"
              step="0.01"
              autoFocus
              value={aporte}
              onChange={(e) => setAporte(e.target.value)}
              placeholder="+100 o -50"
              className="campo-texto"
              style={{ width: 90, padding: '4px 6px', fontSize: 12 }}
            />
            <button className="enlace-discreto" style={{ fontSize: 12 }} onClick={registrarAporte} disabled={guardando}>
              {guardando ? '…' : 'OK'}
            </button>
          </div>
        ) : (
          <button className="enlace-discreto" style={{ fontSize: 12 }} onClick={() => setAportando(true)}>
            Registrar aporte
          </button>
        )}
      </div>
    </div>
  );
}

function FormularioMeta({
  token,
  espacioId,
  cuentas,
  onCreado,
}: {
  token: string;
  espacioId: string;
  cuentas: Cuenta[];
  onCreado: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [importeObjetivo, setImporteObjetivo] = useState('');
  const [importeActual, setImporteActual] = useState('0');
  const [fechaObjetivo, setFechaObjetivo] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const respuesta = await fetch('/api/metas', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: espacioId,
          nombre,
          importe_objetivo: Number(importeObjetivo),
          importe_actual: Number(importeActual || 0),
          fecha_objetivo: fechaObjetivo || null,
          cuenta_id: cuentaId || null,
        }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido crear la meta.');
      }
      setNombre('');
      setImporteObjetivo('');
      setImporteActual('0');
      setFechaObjetivo('');
      setCuentaId('');
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la meta.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Nueva meta</h2>
      <form onSubmit={crear} className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Nombre
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
            placeholder="Fondo de emergencia"
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Importe objetivo (€)
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            value={importeObjetivo}
            onChange={(e) => setImporteObjetivo(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Ya conseguido (€) <span className="texto-ayuda">(opcional)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={importeActual}
            onChange={(e) => setImporteActual(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Fecha objetivo <span className="texto-ayuda">(opcional)</span>
          <input
            type="date"
            value={fechaObjetivo}
            onChange={(e) => setFechaObjetivo(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Cuenta vinculada <span className="texto-ayuda">(opcional)</span>
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="campo-texto" style={{ marginTop: 6 }}>
            <option value="">Sin cuenta</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="mensaje-error">{error}</p>}
        <button type="submit" className="boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Crear meta'}
        </button>
      </form>
    </div>
  );
}
