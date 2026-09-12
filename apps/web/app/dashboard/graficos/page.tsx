'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { formatearMoneda } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { GraficoSVG, type SerieGrafico } from '../../../components/GraficoSVG';

interface Espacio {
  id: string;
  nombre: string;
}

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

type Metrica = 'ingresos_vs_gastos' | 'gasto_por_categoria' | 'ingreso_por_categoria';

const NOMBRES_MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function restarMeses(fechaIso: string, meses: number): string {
  const fecha = new Date(fechaIso + 'T00:00:00Z');
  fecha.setUTCMonth(fecha.getUTCMonth() - meses);
  return fecha.toISOString().slice(0, 10);
}

function importeDe(m: MovimientoCrudo): number {
  return m.importe_real ?? m.importe_esperado ?? m.importe_previsto ?? 0;
}

export default function PaginaGraficos() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [metrica, setMetrica] = useState<Metrica>('ingresos_vs_gastos');
  const [tipoGrafico, setTipoGrafico] = useState<'barras' | 'lineas'>('barras');
  const [desde, setDesde] = useState(restarMeses(hoyISO(), 6).slice(0, 8) + '01');
  const [hasta, setHasta] = useState(hoyISO());
  const [generando, setGenerando] = useState(false);
  const [errorGrafico, setErrorGrafico] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ etiquetas: string[]; series: SerieGrafico[] } | null>(null);

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
        const resCategorias = await fetch(`/api/categorias?espacio_id=${primerEspacio.id}`, {
          headers: { Authorization: `Bearer ${sesion.session.access_token}` },
        });
        if (!resCategorias.ok) throw new Error('No se han podido cargar las categorías.');
        setCategorias((await resCategorias.json()).data ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        setCargandoSesion(false);
      }
    }

    inicializar();
  }, [router]);

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
      const headers = { Authorization: `Bearer ${token}` };
      const qs = `espacio_id=${espacio.id}&desde=${desde}&hasta=${hasta}`;
      const [resIngresos, resGastos] = await Promise.all([
        fetch(`/api/ingresos?${qs}`, { headers }),
        fetch(`/api/gastos?${qs}`, { headers }),
      ]);
      if (!resIngresos.ok || !resGastos.ok) throw new Error('No se han podido cargar los movimientos.');
      const ingresos: MovimientoCrudo[] = (await resIngresos.json()).data ?? [];
      const gastos: MovimientoCrudo[] = (await resGastos.json()).data ?? [];

      if (metrica === 'ingresos_vs_gastos') {
        setResultado(agregarPorMes(ingresos, gastos, desde, hasta));
      } else if (metrica === 'gasto_por_categoria') {
        setResultado(agregarPorCategoria(gastos, categorias, 'gasto'));
        setTipoGrafico('barras');
      } else {
        setResultado(agregarPorCategoria(ingresos, categorias, 'ingreso'));
        setTipoGrafico('barras');
      }
    } catch (e) {
      setErrorGrafico(e instanceof Error ? e.message : 'Error al generar el gráfico.');
      setResultado(null);
    } finally {
      setGenerando(false);
    }
  }, [token, espacio, desde, hasta, metrica, categorias]);

  function agregarPorMes(
    ingresos: MovimientoCrudo[],
    gastos: MovimientoCrudo[],
    desdeIso: string,
    hastaIso: string
  ) {
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

  function agregarPorCategoria(movimientos: MovimientoCrudo[], cats: Categoria[], tipo: 'ingreso' | 'gasto') {
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
      <BarraLateral nombreEspacio={espacio?.nombre ?? 'Finanzas'} onCerrarSesion={cerrarSesion} espacioId={espacio?.id} token={token ?? undefined} />
      <main className="contenido" style={{ maxWidth: 900, padding: '40px 48px' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Gráficos</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Elige qué quieres ver y genera el gráfico a demanda — no hay gráficos fijos, se calculan al vuelo con
            tus movimientos reales.
          </p>
        </header>

        {error && <p className="mensaje-error" style={{ marginBottom: 24 }}>{error}</p>}

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
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="campo-texto" style={{ marginTop: 6 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Hasta
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="campo-texto" style={{ marginTop: 6 }} />
            </label>
            {!esPorCategoria && (
              <label style={{ fontSize: 13, fontWeight: 500 }}>
                Tipo de gráfico
                <select
                  value={tipoGrafico}
                  onChange={(e) => setTipoGrafico(e.target.value as 'barras' | 'lineas')}
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
            <button className="boton-secundario" onClick={() => { setDesde(restarMeses(hoyISO(), 6).slice(0, 8) + '01'); setHasta(hoyISO()); }}>
              Últimos 6 meses
            </button>
            <button className="boton-secundario" onClick={() => { setDesde(restarMeses(hoyISO(), 12).slice(0, 8) + '01'); setHasta(hoyISO()); }}>
              Últimos 12 meses
            </button>
            <button className="boton-secundario" onClick={() => { setDesde(hoyISO().slice(0, 4) + '-01-01'); setHasta(hoyISO()); }}>
              Este año
            </button>
          </div>

          <button className="boton-primario" style={{ marginTop: 16 }} onClick={generar} disabled={generando || !token}>
            {generando ? 'Generando…' : 'Generar gráfico'}
          </button>
        </div>

        {errorGrafico && <p className="mensaje-error" style={{ marginBottom: 24 }}>{errorGrafico}</p>}

        {resultado && (
          <div className="tarjeta">
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
