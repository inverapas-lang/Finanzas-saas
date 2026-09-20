'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { useEspacioActivo } from '../../../lib/useEspacioActivo';
import { formatearMoneda } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { GraficoSVG, type SerieGrafico } from '../../../components/GraficoSVG';
import { BotonesExportarTablas } from '../../../components/BotonesExportarTablas';
import type { HojaExportable } from '../../../lib/exportar-tablas';
import type { Metrica, PresetRango, TipoGrafico } from '../../../lib/validacion-vistas-guardadas';
import { Star, Trash2 } from 'lucide-react';

interface Categoria {
  id: string;
  nombre: string;
  tipo: 'ingreso' | 'gasto';
}

interface MovimientoCrudo {
  categoria_id: string | null;
  importe_esperado?: number;
  importe_previsto?: number;
  importe_real: number | null;
  fecha_prevista: string;
}

interface ResultadoGrafico {
  etiquetas: string[];
  series: SerieGrafico[];
}

interface VistaGuardada {
  id: string;
  nombre: string;
  configuracion: { metrica: Metrica; tipoGrafico: TipoGrafico; rango: PresetRango; desde?: string; hasta?: string };
}

const NOMBRES_MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ETIQUETA_METRICA: Record<Metrica, string> = {
  ingresos_vs_gastos: 'Ingresos vs gastos por mes',
  gasto_por_categoria: 'Gasto por categoría',
  ingreso_por_categoria: 'Ingreso por categoría',
};
const ETIQUETA_RANGO: Record<PresetRango, string> = {
  ultimos_6_meses: 'Últimos 6 meses',
  ultimos_12_meses: 'Últimos 12 meses',
  ano_actual: 'Este año',
  fijo: 'Rango fijo',
};

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function restarMeses(fechaIso: string, meses: number): string {
  const fecha = new Date(fechaIso + 'T00:00:00Z');
  fecha.setUTCMonth(fecha.getUTCMonth() - meses);
  return fecha.toISOString().slice(0, 10);
}

function calcularRangoPreset(rango: PresetRango, fijoDesde?: string, fijoHasta?: string): { desde: string; hasta: string } {
  const hoy = hoyISO();
  if (rango === 'ultimos_6_meses') return { desde: restarMeses(hoy, 6).slice(0, 8) + '01', hasta: hoy };
  if (rango === 'ultimos_12_meses') return { desde: restarMeses(hoy, 12).slice(0, 8) + '01', hasta: hoy };
  if (rango === 'ano_actual') return { desde: hoy.slice(0, 4) + '-01-01', hasta: hoy };
  return { desde: fijoDesde ?? hoy, hasta: fijoHasta ?? hoy };
}

function importeDe(m: MovimientoCrudo): number {
  return m.importe_real ?? m.importe_esperado ?? m.importe_previsto ?? 0;
}

function agregarPorMes(ingresos: MovimientoCrudo[], gastos: MovimientoCrudo[], desdeIso: string, hastaIso: string): ResultadoGrafico {
  const meses: string[] = [];
  let cursor = desdeIso.slice(0, 7) + '-01';
  const limite = hastaIso.slice(0, 7) + '-01';
  while (cursor <= limite && meses.length < 60) {
    meses.push(cursor);
    cursor = restarMeses(cursor, -1);
  }

  const etiquetas = meses.map((m) => `${NOMBRES_MES_CORTO[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`);
  const totalesIngresos = meses.map((m) =>
    ingresos.filter((i) => i.fecha_prevista.slice(0, 7) === m.slice(0, 7)).reduce((acc, i) => acc + importeDe(i), 0)
  );
  const totalesGastos = meses.map((m) =>
    gastos.filter((g) => g.fecha_prevista.slice(0, 7) === m.slice(0, 7)).reduce((acc, g) => acc + importeDe(g), 0)
  );

  return {
    etiquetas,
    series: [
      { nombre: 'Ingresos', color: 'var(--color-green-text)', valores: totalesIngresos },
      { nombre: 'Gastos', color: 'var(--color-red-text)', valores: totalesGastos },
    ],
  };
}

function agregarPorCategoria(movimientos: MovimientoCrudo[], cats: Categoria[], tipo: 'ingreso' | 'gasto'): ResultadoGrafico {
  const MAX_CATEGORIAS = 8;
  const totalesPorCategoria = new Map<string, number>();
  for (const m of movimientos) {
    const clave = m.categoria_id ?? 'sin-categoria';
    totalesPorCategoria.set(clave, (totalesPorCategoria.get(clave) ?? 0) + importeDe(m));
  }

  const nombreDe = (id: string) => (id === 'sin-categoria' ? 'Sin categoría' : cats.find((c) => c.id === id)?.nombre ?? 'Categoría eliminada');

  const ordenadas = [...totalesPorCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const principales = ordenadas.slice(0, MAX_CATEGORIAS);
  const resto = ordenadas.slice(MAX_CATEGORIAS).reduce((acc, [, v]) => acc + v, 0);
  if (resto > 0) principales.push(['otras', resto]);

  return {
    etiquetas: principales.map(([id]) => (id === 'otras' ? 'Otras' : nombreDe(id))),
    series: [
      {
        nombre: tipo === 'ingreso' ? 'Ingresos' : 'Gastos',
        color: tipo === 'ingreso' ? 'var(--color-green-text)' : 'var(--color-red-text)',
        valores: principales.map(([, v]) => v),
      },
    ],
  };
}

async function cargarYAgregar(
  metrica: Metrica,
  desde: string,
  hasta: string,
  token: string,
  espacioId: string,
  categorias: Categoria[]
): Promise<ResultadoGrafico> {
  const headers = { Authorization: `Bearer ${token}` };
  const qs = `espacio_id=${espacioId}&desde=${desde}&hasta=${hasta}`;
  const [resIngresos, resGastos] = await Promise.all([
    fetch(`/api/ingresos?${qs}`, { headers }),
    fetch(`/api/gastos?${qs}`, { headers }),
  ]);
  if (!resIngresos.ok || !resGastos.ok) throw new Error('No se han podido cargar los movimientos.');
  const ingresos: MovimientoCrudo[] = (await resIngresos.json()).data ?? [];
  const gastos: MovimientoCrudo[] = (await resGastos.json()).data ?? [];

  if (metrica === 'ingresos_vs_gastos') return agregarPorMes(ingresos, gastos, desde, hasta);
  if (metrica === 'gasto_por_categoria') return agregarPorCategoria(gastos, categorias, 'gasto');
  return agregarPorCategoria(ingresos, categorias, 'ingreso');
}

export default function PaginaGraficos() {
  const router = useRouter();
  const { cargando: cargandoSesion, token, espacio, espacios, cambiarEspacio, error: errorEspacio } = useEspacioActivo();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [vistasGuardadas, setVistasGuardadas] = useState<VistaGuardada[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [metrica, setMetrica] = useState<Metrica>('ingresos_vs_gastos');
  const [tipoGrafico, setTipoGrafico] = useState<TipoGrafico>('barras');
  const [presetActivo, setPresetActivo] = useState<PresetRango | null>('ultimos_6_meses');
  const [desde, setDesde] = useState(restarMeses(hoyISO(), 6).slice(0, 8) + '01');
  const [hasta, setHasta] = useState(hoyISO());
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGrafico, setErrorGrafico] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoGrafico | null>(null);

  // Guarda de qué espacio es la petición más reciente en vuelo — si al
  // cambiar de espacio la respuesta del anterior llega tarde, no debe pisar
  // la pantalla que ya muestra el espacio nuevo.
  const espacioIdVigente = useRef<string | null>(null);
  useEffect(() => {
    espacioIdVigente.current = espacio?.id ?? null;
  }, [espacio]);

  const cargarVistasGuardadas = useCallback(async (accessToken: string, espacioId: string) => {
    const respuesta = await fetch(`/api/vistas-guardadas?espacio_id=${espacioId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) return;
    const cuerpo = await respuesta.json();
    if (espacioIdVigente.current !== espacioId) return;
    setVistasGuardadas(cuerpo.data ?? []);
  }, []);

  const cargarTodo = useCallback(async (accessToken: string, espacioId: string) => {
    const resCategorias = await fetch(`/api/categorias?espacio_id=${espacioId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resCategorias.ok) throw new Error('No se han podido cargar las categorías.');
    const datosCategorias = await resCategorias.json();
    if (espacioIdVigente.current !== espacioId) return;
    setCategorias(datosCategorias.data ?? []);
    await cargarVistasGuardadas(accessToken, espacioId);
  }, [cargarVistasGuardadas]);

  useEffect(() => {
    if (!token || !espacio) return;
    cargarTodo(token, espacio.id).catch((e) =>
      setError(e instanceof Error ? e.message : 'Error al cargar los datos.')
    );
  }, [token, espacio, cargarTodo]);

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  const generar = useCallback(async () => {
    if (!token || !espacio) return;
    setGenerando(true);
    setErrorGrafico(null);
    try {
      const res = await cargarYAgregar(metrica, desde, hasta, token, espacio.id, categorias);
      setResultado(res);
      if (metrica !== 'ingresos_vs_gastos') setTipoGrafico('barras');
    } catch (e) {
      setErrorGrafico(e instanceof Error ? e.message : 'Error al generar el gráfico.');
      setResultado(null);
    } finally {
      setGenerando(false);
    }
  }, [token, espacio, desde, hasta, metrica, categorias]);

  async function guardarVista() {
    if (!token || !espacio || !resultado) return;
    const nombre = window.prompt('¿Cómo quieres llamar a esta vista guardada?', ETIQUETA_METRICA[metrica]);
    if (!nombre || !nombre.trim()) return;

    setGuardando(true);
    try {
      const configuracion =
        presetActivo !== null
          ? { metrica, tipoGrafico, rango: presetActivo }
          : { metrica, tipoGrafico, rango: 'fijo' as const, desde, hasta };

      const respuesta = await fetch('/api/vistas-guardadas', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ espacio_id: espacio.id, nombre: nombre.trim(), configuracion }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido guardar la vista.');
      }
      await cargarVistasGuardadas(token, espacio.id);
    } catch (e) {
      setErrorGrafico(e instanceof Error ? e.message : 'Error al guardar la vista.');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarVista(id: string) {
    if (!token || !espacio || !confirm('¿Dejar de fijar esta vista?')) return;
    await fetch(`/api/vistas-guardadas/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    await cargarVistasGuardadas(token, espacio.id);
  }

  function construirHojasGrafico(): HojaExportable[] {
    if (!resultado) return [];
    return [
      {
        titulo: ETIQUETA_METRICA[metrica],
        columnas: [esPorCategoria ? 'Categoría' : 'Mes', ...resultado.series.map((s) => s.nombre)],
        filas: resultado.etiquetas.map((etiqueta, i) => [etiqueta, ...resultado.series.map((s) => s.valores[i])]),
      },
    ];
  }

  if (cargandoSesion) {
    return (
      <main className="pantalla-centrada">
        <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  const esPorCategoria = metrica !== 'ingresos_vs_gastos';

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
      <main className="contenido" style={{ maxWidth: 900 }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Gráficos</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Elige qué quieres ver y genera el gráfico a demanda, o fija los que quieras ver siempre abajo.
          </p>
        </header>

        {(errorEspacio || error) && (
          <p className="mensaje-error" style={{ marginBottom: 24 }}>{errorEspacio || error}</p>
        )}

        {vistasGuardadas.length > 0 && token && espacio && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Tus vistas fijadas</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {vistasGuardadas.map((vista) => (
                <TarjetaVistaGuardada
                  key={vista.id}
                  vista={vista}
                  token={token}
                  espacioId={espacio.id}
                  categorias={categorias}
                  onEliminar={() => eliminarVista(vista.id)}
                />
              ))}
            </div>
          </section>
        )}

        <div className="tarjeta" style={{ marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Qué mostrar
              <select
                value={metrica}
                onChange={(e) => setMetrica(e.target.value as Metrica)}
                className="campo-texto"
                style={{ marginTop: 6 }}
              >
                <option value="ingresos_vs_gastos">Ingresos vs gastos por mes</option>
                <option value="gasto_por_categoria">Gasto por categoría</option>
                <option value="ingreso_por_categoria">Ingreso por categoría</option>
              </select>
            </label>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Desde
              <input
                type="date"
                value={desde}
                onChange={(e) => { setDesde(e.target.value); setPresetActivo(null); }}
                className="campo-texto"
                style={{ marginTop: 6 }}
              />
            </label>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Hasta
              <input
                type="date"
                value={hasta}
                onChange={(e) => { setHasta(e.target.value); setPresetActivo(null); }}
                className="campo-texto"
                style={{ marginTop: 6 }}
              />
            </label>
            {!esPorCategoria && (
              <label style={{ fontSize: 13, fontWeight: 500 }}>
                Tipo de gráfico
                <select
                  value={tipoGrafico}
                  onChange={(e) => setTipoGrafico(e.target.value as TipoGrafico)}
                  className="campo-texto"
                  style={{ marginTop: 6 }}
                >
                  <option value="barras">Barras</option>
                  <option value="lineas">Líneas</option>
                </select>
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              className={presetActivo === 'ultimos_6_meses' ? 'boton-primario' : 'boton-secundario'}
              style={{ fontSize: 13, padding: '7px 14px' }}
              onClick={() => { const r = calcularRangoPreset('ultimos_6_meses'); setDesde(r.desde); setHasta(r.hasta); setPresetActivo('ultimos_6_meses'); }}
            >
              Últimos 6 meses
            </button>
            <button
              className={presetActivo === 'ultimos_12_meses' ? 'boton-primario' : 'boton-secundario'}
              style={{ fontSize: 13, padding: '7px 14px' }}
              onClick={() => { const r = calcularRangoPreset('ultimos_12_meses'); setDesde(r.desde); setHasta(r.hasta); setPresetActivo('ultimos_12_meses'); }}
            >
              Últimos 12 meses
            </button>
            <button
              className={presetActivo === 'ano_actual' ? 'boton-primario' : 'boton-secundario'}
              style={{ fontSize: 13, padding: '7px 14px' }}
              onClick={() => { const r = calcularRangoPreset('ano_actual'); setDesde(r.desde); setHasta(r.hasta); setPresetActivo('ano_actual'); }}
            >
              Este año
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="boton-primario" onClick={generar} disabled={generando || !token}>
              {generando ? 'Generando…' : 'Generar gráfico'}
            </button>
            {resultado && (
              <button className="boton-secundario" onClick={guardarVista} disabled={guardando}>
                <Star size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {guardando ? 'Guardando…' : 'Fijar esta vista'}
              </button>
            )}
          </div>
        </div>

        {errorGrafico && <p className="mensaje-error" style={{ marginBottom: 24 }}>{errorGrafico}</p>}

        {resultado && (
          <div className="tarjeta">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              {token && (
                <BotonesExportarTablas token={token} titulo={ETIQUETA_METRICA[metrica]} construirHojas={construirHojasGrafico} />
              )}
            </div>
            <GraficoSVG
              etiquetas={resultado.etiquetas}
              series={resultado.series}
              tipo={esPorCategoria ? 'barras' : tipoGrafico}
              formatearValor={(v) => formatearMoneda(v)}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function TarjetaVistaGuardada({
  vista,
  token,
  espacioId,
  categorias,
  onEliminar,
}: {
  vista: VistaGuardada;
  token: string;
  espacioId: string;
  categorias: Categoria[];
  onEliminar: () => void;
}) {
  const [resultado, setResultado] = useState<ResultadoGrafico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      setError(null);
      try {
        const { desde, hasta } = calcularRangoPreset(vista.configuracion.rango, vista.configuracion.desde, vista.configuracion.hasta);
        const res = await cargarYAgregar(vista.configuracion.metrica, desde, hasta, token, espacioId, categorias);
        if (!cancelado) setResultado(res);
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : 'Error al cargar esta vista.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [vista, token, espacioId, categorias]);

  return (
    <div className="tarjeta">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{vista.nombre}</p>
          <p className="texto-ayuda" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {ETIQUETA_METRICA[vista.configuracion.metrica]} · {ETIQUETA_RANGO[vista.configuracion.rango]}
          </p>
        </div>
        <button className="enlace-discreto" style={{ color: 'var(--color-red-text)' }} onClick={onEliminar} title="Dejar de fijar">
          <Trash2 size={14} />
        </button>
      </div>

      {cargando && <p className="texto-ayuda">Cargando…</p>}
      {error && <p className="mensaje-error">{error}</p>}
      {resultado && (
        <GraficoSVG
          etiquetas={resultado.etiquetas}
          series={resultado.series}
          tipo={vista.configuracion.metrica === 'ingresos_vs_gastos' ? vista.configuracion.tipoGrafico : 'barras'}
          formatearValor={(v) => formatearMoneda(v)}
          alto={220}
        />
      )}
    </div>
  );
}
