'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { formatearMoneda, formatearFecha } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { Repeat, Pencil, Trash2 } from 'lucide-react';

interface Espacio {
  id: string;
  nombre: string;
}

interface Cuenta {
  id: string;
  nombre: string;
}

interface Categoria {
  id: string;
  nombre: string;
  tipo: 'ingreso' | 'gasto';
}

interface ReglaRecurrente {
  id: string;
  tipo: 'ingreso' | 'gasto';
  descripcion: string;
  importe: number;
  moneda: string;
  periodicidad: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  activa: boolean;
  categoria_id: string | null;
  cuenta_id: string | null;
}

const ETIQUETA_PERIODICIDAD: Record<string, string> = {
  semanal: 'Semanal',
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export default function PaginaReglasRecurrentes() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [reglas, setReglas] = useState<ReglaRecurrente[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<ReglaRecurrente | 'nueva' | null>(null);

  const cargarTodo = useCallback(async (accessToken: string, espacioId: string) => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [resReglas, resCuentas, resCategorias] = await Promise.all([
      fetch(`/api/reglas-recurrentes?espacio_id=${espacioId}`, { headers }),
      fetch(`/api/cuentas-bancarias?espacio_id=${espacioId}`, { headers }),
      fetch(`/api/categorias?espacio_id=${espacioId}`, { headers }),
    ]);
    if (!resReglas.ok || !resCuentas.ok || !resCategorias.ok) {
      throw new Error('No se han podido cargar las reglas recurrentes.');
    }
    setReglas((await resReglas.json()).data ?? []);
    setCuentas((await resCuentas.json()).data ?? []);
    setCategorias((await resCategorias.json()).data ?? []);
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

  async function alternarActiva(regla: ReglaRecurrente) {
    if (!token) return;
    await fetch(`/api/reglas-recurrentes/${regla.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ activa: !regla.activa }),
    });
    if (espacio) await cargarTodo(token, espacio.id);
  }

  async function eliminar(id: string) {
    if (!token || !confirm('¿Eliminar esta regla recurrente? Dejará de aparecer en la proyección.')) return;
    await fetch(`/api/reglas-recurrentes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (espacio) await cargarTodo(token, espacio.id);
  }

  if (cargandoSesion) {
    return (
      <main className="pantalla-centrada">
        <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  function nombreCategoria(id: string | null): string {
    if (!id) return 'Sin categoría';
    return categorias.find((c) => c.id === id)?.nombre ?? 'Sin categoría';
  }

  return (
    <div className="app-layout">
      <BarraLateral nombreEspacio={espacio?.nombre ?? 'Finanzas'} onCerrarSesion={cerrarSesion} espacioId={espacio?.id} token={token ?? undefined} />
      <main className="contenido" style={{ maxWidth: 840, padding: '40px 48px' }}>
        <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Reglas recurrentes</h1>
            <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
              Plantillas de ingresos/gastos periódicos (nóminas, dividendos, suscripciones…) que alimentan la
              proyección del panel y del asistente. No crean movimientos por sí solas.
            </p>
          </div>
          {token && espacio && (
            <button className="boton-primario" onClick={() => setEditando('nueva')}>
              + Nueva regla
            </button>
          )}
        </header>

        {error && <p className="mensaje-error" style={{ marginBottom: 24 }}>{error}</p>}

        <div className="tarjeta" style={{ padding: 0 }}>
          {reglas.length === 0 ? (
            <p className="estado-vacio">
              Aún no tienes reglas recurrentes. Créala con el botón de arriba — por ejemplo, "Nómina, 1.500€,
              mensual, desde el 1 de enero".
            </p>
          ) : (
            reglas.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderBottom: i === reglas.length - 1 ? 'none' : '1px solid var(--color-border)',
                  opacity: r.activa ? 1 : 0.5,
                }}
              >
                <Repeat size={16} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14 }}>{r.descripcion}</p>
                  <p className="texto-ayuda" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    {ETIQUETA_PERIODICIDAD[r.periodicidad] ?? r.periodicidad} · desde {formatearFecha(r.fecha_inicio)}
                    {r.fecha_fin ? ` hasta ${formatearFecha(r.fecha_fin)}` : ''} · {nombreCategoria(r.categoria_id)}
                  </p>
                </div>
                <span className={`cifra ${r.tipo === 'ingreso' ? 'cifra-positiva' : 'cifra-negativa'}`} style={{ fontSize: 14 }}>
                  {formatearMoneda(r.importe)}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={r.activa} onChange={() => alternarActiva(r)} />
                  Activa
                </label>
                <button className="enlace-discreto" style={{ padding: 4 }} onClick={() => setEditando(r)} title="Editar">
                  <Pencil size={14} />
                </button>
                <button
                  className="enlace-discreto"
                  style={{ padding: 4, color: 'var(--color-red-text)' }}
                  onClick={() => eliminar(r.id)}
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {editando && token && espacio && (
          <ModalRegla
            token={token}
            espacioId={espacio.id}
            cuentas={cuentas}
            categorias={categorias}
            reglaInicial={editando === 'nueva' ? null : editando}
            onCerrar={() => setEditando(null)}
            onGuardado={async () => {
              setEditando(null);
              await cargarTodo(token, espacio.id);
            }}
          />
        )}
      </main>
    </div>
  );
}

function ModalRegla({
  token,
  espacioId,
  cuentas,
  categorias,
  reglaInicial,
  onCerrar,
  onGuardado,
}: {
  token: string;
  espacioId: string;
  cuentas: Cuenta[];
  categorias: Categoria[];
  reglaInicial: ReglaRecurrente | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>(reglaInicial?.tipo ?? 'gasto');
  const [descripcion, setDescripcion] = useState(reglaInicial?.descripcion ?? '');
  const [importe, setImporte] = useState(reglaInicial ? String(reglaInicial.importe) : '');
  const [periodicidad, setPeriodicidad] = useState(reglaInicial?.periodicidad ?? 'mensual');
  const [fechaInicio, setFechaInicio] = useState(reglaInicial?.fecha_inicio ?? '');
  const [fechaFin, setFechaFin] = useState(reglaInicial?.fecha_fin ?? '');
  const [categoriaId, setCategoriaId] = useState(reglaInicial?.categoria_id ?? '');
  const [cuentaId, setCuentaId] = useState(reglaInicial?.cuenta_id ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoriasDelTipo = categorias.filter((c) => c.tipo === tipo);
  const esEdicion = reglaInicial !== null;

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const cuerpo: Record<string, unknown> = {
        descripcion,
        importe: Number(importe),
        periodicidad,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin || null,
        categoria_id: categoriaId || null,
        cuenta_id: cuentaId || null,
      };

      let respuesta: Response;
      if (esEdicion) {
        respuesta = await fetch(`/api/reglas-recurrentes/${reglaInicial.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        });
      } else {
        respuesta = await fetch('/api/reglas-recurrentes', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...cuerpo, espacio_id: espacioId, tipo }),
        });
      }

      if (!respuesta.ok) {
        const cuerpoError = await respuesta.json();
        throw new Error(cuerpoError.error ?? 'No se ha podido guardar la regla.');
      }
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar la regla.');
    } finally {
      setGuardando(false);
    }
  }

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
      <form
        className="tarjeta"
        style={{ width: 520, maxWidth: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={guardar}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{esEdicion ? 'Editar regla' : 'Nueva regla recurrente'}</h2>
          <button type="button" className="enlace-discreto" onClick={onCerrar}>
            Cerrar
          </button>
        </div>

        {!esEdicion && (
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className={tipo === 'ingreso' ? 'boton-primario' : 'boton-secundario'}
              style={{ fontSize: 12, padding: '6px 10px' }}
              onClick={() => { setTipo('ingreso'); setCategoriaId(''); }}
            >
              Ingreso
            </button>
            <button
              type="button"
              className={tipo === 'gasto' ? 'boton-primario' : 'boton-secundario'}
              style={{ fontSize: 12, padding: '6px 10px' }}
              onClick={() => { setTipo('gasto'); setCategoriaId(''); }}
            >
              Gasto
            </button>
          </div>
        )}

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Descripción
          <input
            required
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
            placeholder={tipo === 'ingreso' ? 'Nómina' : 'Alquiler'}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Importe (€)
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Periodicidad
            <select
              value={periodicidad}
              onChange={(e) => setPeriodicidad(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            >
              {Object.entries(ETIQUETA_PERIODICIDAD).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Desde
            <input
              required
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Hasta <span className="texto-ayuda">(opcional)</span>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Categoría <span className="texto-ayuda">(opcional)</span>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="campo-texto" style={{ marginTop: 6 }}>
              <option value="">Sin categoría</option>
              {categoriasDelTipo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Cuenta <span className="texto-ayuda">(opcional)</span>
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="campo-texto" style={{ marginTop: 6 }}>
              <option value="">Sin cuenta</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="mensaje-error">{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="boton-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="boton-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear regla'}
          </button>
        </div>
      </form>
    </div>
  );
}
