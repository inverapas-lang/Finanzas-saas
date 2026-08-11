'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { formatearMoneda } from '../../../lib/formato';
import { finDePeriodo, type PeriodoTipo } from '../../../lib/periodos';
import { BarraLateral } from '../../../components/BarraLateral';

interface Espacio {
  id: string;
  nombre: string;
}

interface Categoria {
  id: string;
  nombre: string;
  tipo: 'ingreso' | 'gasto';
}

interface Gasto {
  id: string;
  categoria_id: string | null;
  importe_previsto: number;
  importe_real: number | null;
  fecha_prevista: string;
}

interface Presupuesto {
  id: string;
  categoria_id: string;
  periodo_tipo: PeriodoTipo;
  periodo_inicio: string;
  importe_planificado: number;
}

export default function PaginaPresupuestos() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarTodo = useCallback(async (accessToken: string, espacioId: string) => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [resCategorias, resGastos, resPresupuestos] = await Promise.all([
      fetch(`/api/categorias?espacio_id=${espacioId}&tipo=gasto`, { headers }),
      fetch(`/api/gastos?espacio_id=${espacioId}`, { headers }),
      fetch(`/api/presupuestos?espacio_id=${espacioId}`, { headers }),
    ]);
    if (!resCategorias.ok || !resGastos.ok || !resPresupuestos.ok) {
      throw new Error('No se han podido cargar los presupuestos.');
    }
    setCategorias((await resCategorias.json()).data ?? []);
    setGastos((await resGastos.json()).data ?? []);
    setPresupuestos((await resPresupuestos.json()).data ?? []);
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

  function nombreCategoria(id: string): string {
    return categorias.find((c) => c.id === id)?.nombre ?? 'Categoría eliminada';
  }

  function gastadoEnPeriodo(presupuesto: Presupuesto): number {
    const fin = finDePeriodo(presupuesto.periodo_inicio, presupuesto.periodo_tipo);
    return gastos
      .filter(
        (g) =>
          g.categoria_id === presupuesto.categoria_id &&
          g.fecha_prevista >= presupuesto.periodo_inicio &&
          g.fecha_prevista < fin
      )
      .reduce((acc, g) => acc + (g.importe_real ?? g.importe_previsto), 0);
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
      <main className="contenido" style={{ maxWidth: 880, padding: '40px 48px' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Presupuestos</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Cuánto planeas gastar por categoría, comparado con lo que llevas gastado de verdad.
          </p>
        </header>

        {error && (
          <p className="mensaje-error" style={{ marginBottom: 24 }}>
            {error}
          </p>
        )}

        {categorias.length === 0 && (
          <p className="texto-ayuda" style={{ marginBottom: 16 }}>
            Todavía no tienes categorías de gasto creadas. Créalas primero desde Movimientos al añadir un gasto,
            o directamente en Supabase — luego podrás planificar un presupuesto sobre ellas.
          </p>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {presupuestos.length === 0 ? (
              <div className="tarjeta">
                <p className="estado-vacio">
                  Aún no hay presupuestos aquí. Añade el primero con el formulario de la derecha.
                </p>
              </div>
            ) : (
              presupuestos.map((p) =>
                token && espacio ? (
                  <TarjetaPresupuesto
                    key={p.id}
                    presupuesto={p}
                    nombreCategoria={nombreCategoria(p.categoria_id)}
                    gastado={gastadoEnPeriodo(p)}
                    token={token}
                    onCambio={() => cargarTodo(token, espacio.id)}
                  />
                ) : null
              )
            )}
          </div>

          {token && espacio && (
            <FormularioCrearPresupuesto
              token={token}
              espacioId={espacio.id}
              categorias={categorias}
              onCreado={() => cargarTodo(token, espacio.id)}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function TarjetaPresupuesto({
  presupuesto,
  nombreCategoria,
  gastado,
  token,
  onCambio,
}: {
  presupuesto: Presupuesto;
  nombreCategoria: string;
  gastado: number;
  token: string;
  onCambio: () => void;
}) {
  const [borrando, setBorrando] = useState(false);
  const porcentaje = Math.min(100, Math.round((gastado / presupuesto.importe_planificado) * 100));
  const excedido = gastado > presupuesto.importe_planificado;

  async function eliminar() {
    if (!confirm(`¿Eliminar el presupuesto de "${nombreCategoria}"?`)) return;
    setBorrando(true);
    try {
      await fetch(`/api/presupuestos/${presupuesto.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onCambio();
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="tarjeta tarjeta-interactiva">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{nombreCategoria}</p>
          <p className="texto-ayuda" style={{ margin: '2px 0 0' }}>
            {presupuesto.periodo_tipo === 'mensual' ? 'Mensual' : 'Anual'} · desde{' '}
            {presupuesto.periodo_inicio}
          </p>
        </div>
        <button className="enlace-discreto" onClick={eliminar} disabled={borrando} style={{ color: 'var(--color-red-text)' }}>
          {borrando ? 'Eliminando…' : 'Eliminar'}
        </button>
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p className={`cifra ${excedido ? 'cifra-negativa' : ''}`} style={{ margin: 0, fontSize: 18 }}>
          {formatearMoneda(gastado)}
        </p>
        <p className="texto-ayuda" style={{ margin: 0 }}>
          de {formatearMoneda(presupuesto.importe_planificado)}
        </p>
      </div>

      <div
        style={{
          marginTop: 8,
          height: 6,
          borderRadius: 3,
          background: 'var(--color-hover)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${porcentaje}%`,
            background: excedido ? 'var(--color-red-text)' : 'var(--color-green-text)',
            transition: 'width 200ms ease',
          }}
        />
      </div>

      {excedido && (
        <p className="texto-ayuda" style={{ margin: '8px 0 0', color: 'var(--color-red-text)' }}>
          Presupuesto superado en {formatearMoneda(gastado - presupuesto.importe_planificado)}
        </p>
      )}
    </div>
  );
}

function FormularioCrearPresupuesto({
  token,
  espacioId,
  categorias,
  onCreado,
}: {
  token: string;
  espacioId: string;
  categorias: Categoria[];
  onCreado: () => void;
}) {
  const [categoriaId, setCategoriaId] = useState('');
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>('mensual');
  const [mes, setMes] = useState(''); // formato YYYY-MM, para periodo mensual
  const [anio, setAnio] = useState(''); // para periodo anual
  const [importe, setImporte] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);

    const periodoInicio = periodoTipo === 'mensual' ? `${mes}-01` : `${anio}-01-01`;

    try {
      const respuesta = await fetch('/api/presupuestos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: espacioId,
          categoria_id: categoriaId,
          periodo_tipo: periodoTipo,
          periodo_inicio: periodoInicio,
          importe_planificado: Number(importe),
        }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido crear el presupuesto.');
      }
      setImporte('');
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el presupuesto.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Añadir presupuesto</h2>
      <form onSubmit={crear} className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Categoría de gasto
          <select
            required
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          >
            <option value="" disabled>
              Elige una categoría
            </option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Periodo
          <select
            value={periodoTipo}
            onChange={(e) => setPeriodoTipo(e.target.value as PeriodoTipo)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          >
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </select>
        </label>

        {periodoTipo === 'mensual' ? (
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Mes
            <input
              required
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>
        ) : (
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Año
            <input
              required
              type="number"
              min="2000"
              max="2100"
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
              placeholder="2026"
            />
          </label>
        )}

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Importe planificado (€)
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

        {error && <p className="mensaje-error">{error}</p>}

        <button type="submit" className="boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar presupuesto'}
        </button>
      </form>
    </div>
  );
}
