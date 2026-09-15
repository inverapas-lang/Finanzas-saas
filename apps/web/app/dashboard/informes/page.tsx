'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { formatearMoneda, formatearMes } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { GraficoSVG, type SerieGrafico } from '../../../components/GraficoSVG';
import { BotonesExportarTablas } from '../../../components/BotonesExportarTablas';
import type { HojaExportable } from '../../../lib/exportar-tablas';
import {
  agruparIngresosYGastosPorMes,
  agruparPorCategoriaYMes,
  rangoMesesDesdeMovimientos,
  sumaTotal,
  type FilaInformeCategoria,
  type MovimientoParaInforme,
} from '../../../lib/agregaciones-informes';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Espacio {
  id: string;
  nombre: string;
}

interface Categoria {
  id: string;
  nombre: string;
}

export default function PaginaInformes() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [ingresos, setIngresos] = useState<MovimientoParaInforme[]>([]);
  const [gastos, setGastos] = useState<MovimientoParaInforme[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const cargarDatos = useCallback(async (accessToken: string, espacioId: string, filtroDesde: string, filtroHasta: string) => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const filtro = `${filtroDesde ? `&desde=${filtroDesde}` : ''}${filtroHasta ? `&hasta=${filtroHasta}` : ''}`;
    const [resCategorias, resIngresos, resGastos] = await Promise.all([
      fetch(`/api/categorias?espacio_id=${espacioId}`, { headers }),
      fetch(`/api/ingresos?espacio_id=${espacioId}${filtro}`, { headers }),
      fetch(`/api/gastos?espacio_id=${espacioId}${filtro}`, { headers }),
    ]);
    if (!resCategorias.ok || !resIngresos.ok || !resGastos.ok) {
      throw new Error('No se han podido cargar los datos para el informe.');
    }
    setCategorias((await resCategorias.json()).data ?? []);
    setIngresos((await resIngresos.json()).data ?? []);
    setGastos((await resGastos.json()).data ?? []);
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
        await cargarDatos(sesion.session.access_token, primerEspacio.id, '', '');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        setCargandoSesion(false);
      }
    }

    inicializar();
  }, [router, cargarDatos]);

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function aplicarFiltro() {
    if (!token || !espacio) return;
    setError(null);
    try {
      await cargarDatos(token, espacio.id, desde, hasta);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al aplicar el filtro.');
    }
  }

  async function quitarFiltro() {
    setDesde('');
    setHasta('');
    if (!token || !espacio) return;
    await cargarDatos(token, espacio.id, '', '');
  }

  if (cargandoSesion) {
    return (
      <main className="pantalla-centrada">
        <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  const meses = rangoMesesDesdeMovimientos([...ingresos, ...gastos]);
  const totalIngresos = sumaTotal(ingresos);
  const totalGastos = sumaTotal(gastos);
  const saldo = totalIngresos - totalGastos;

  const filasMensuales = agruparIngresosYGastosPorMes(ingresos, gastos, meses);
  const seriesGrafico: SerieGrafico[] = [
    { nombre: 'Ingresos', color: 'var(--color-green-text)', valores: filasMensuales.map((f) => f.ingresos) },
    { nombre: 'Gastos', color: 'var(--color-red-text)', valores: filasMensuales.map((f) => f.gastos) },
  ];

  const filasIngresosPorCategoria = agruparPorCategoriaYMes(ingresos, categorias, meses);
  const filasGastosPorCategoria = agruparPorCategoriaYMes(gastos, categorias, meses);

  function construirHojasInforme(): HojaExportable[] {
    const hojas: HojaExportable[] = [
      {
        titulo: 'Resumen',
        columnas: ['Concepto', 'Importe'],
        filas: [
          ['Total ingresos', totalIngresos],
          ['Total gastos', totalGastos],
          ['Saldo', saldo],
        ],
      },
    ];

    if (filasMensuales.length > 0) {
      hojas.push({
        titulo: 'Detalle mensual',
        columnas: ['Mes', 'Ingresos', 'Gastos', 'Saldo'],
        filas: filasMensuales.map((f) => [formatearMes(f.mes), f.ingresos, f.gastos, f.saldo]),
      });
    }

    for (const [titulo, filasCategoria] of [
      ['Ingresos por categoría', filasIngresosPorCategoria],
      ['Gastos por categoría', filasGastosPorCategoria],
    ] as const) {
      if (filasCategoria.length === 0) continue;
      hojas.push({
        titulo,
        columnas: ['Categoría', ...meses.map(formatearMes), 'Total'],
        filas: filasCategoria.map((f) => [f.categoriaNombre, ...meses.map((m) => f.porMes[m] ?? 0), f.total]),
      });
    }

    return hojas;
  }

  return (
    <div className="app-layout">
      <BarraLateral nombreEspacio={espacio?.nombre ?? 'Finanzas'} onCerrarSesion={cerrarSesion} espacioId={espacio?.id} token={token ?? undefined} />
      <main className="contenido" style={{ maxWidth: 960 }}>
        <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Informes</h1>
            <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
              Todo lo acumulado, con desglose por categoría y detalle mes a mes.
            </p>
          </div>
          {token && <BotonesExportarTablas token={token} titulo="Informe financiero" construirHojas={construirHojasInforme} />}
        </header>

        {error && <p className="mensaje-error" style={{ marginBottom: 24 }}>{error}</p>}

        <div className="tarjeta" style={{ marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Desde <span className="texto-ayuda">(opcional)</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="campo-texto" style={{ marginTop: 6 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Hasta <span className="texto-ayuda">(opcional)</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="campo-texto" style={{ marginTop: 6 }} />
          </label>
          <button className="boton-secundario" onClick={aplicarFiltro}>
            Aplicar
          </button>
          {(desde || hasta) && (
            <button className="enlace-discreto" onClick={quitarFiltro}>
              Ver todo el histórico
            </button>
          )}
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <TarjetaCifra etiqueta="Total ingresos" valor={totalIngresos} positivo />
          <TarjetaCifra etiqueta="Total gastos" valor={totalGastos} positivo={false} />
          <TarjetaCifra etiqueta="Saldo" valor={saldo} positivo={saldo >= 0} destacada />
        </section>

        {meses.length > 0 && (
          <div className="tarjeta" style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Ingresos y gastos por mes</h2>
            <GraficoSVG
              etiquetas={filasMensuales.map((f) => formatearMes(f.mes))}
              series={seriesGrafico}
              tipo="barras"
              formatearValor={(v) => formatearMoneda(v)}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
          <SeccionDetalle titulo="Detalle de ingresos" total={totalIngresos} filas={filasIngresosPorCategoria} meses={meses} colorPositivo />
          <SeccionDetalle titulo="Detalle de gastos" total={totalGastos} filas={filasGastosPorCategoria} meses={meses} colorPositivo={false} />
        </div>

        {meses.length > 0 && <DetalleMensualCompleto filas={filasMensuales} />}
      </main>
    </div>
  );
}

function TarjetaCifra({ etiqueta, valor, positivo, destacada = false }: { etiqueta: string; valor: number; positivo: boolean; destacada?: boolean }) {
  return (
    <div className="tarjeta tarjeta-interactiva" style={destacada ? { borderColor: 'var(--color-text)' } : undefined}>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {etiqueta}
      </p>
      <p className={`cifra ${positivo ? 'cifra-positiva' : 'cifra-negativa'}`} style={{ fontSize: 24, margin: 0 }}>
        {formatearMoneda(valor)}
      </p>
    </div>
  );
}

function SeccionDetalle({
  titulo,
  total,
  filas,
  meses,
  colorPositivo,
}: {
  titulo: string;
  total: number;
  filas: FilaInformeCategoria[];
  meses: string[];
  colorPositivo: boolean;
}) {
  const [abierta, setAbierta] = useState(true);
  const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>(null);

  return (
    <div className="tarjeta" style={{ padding: 0 }}>
      <button
        onClick={() => setAbierta(!abierta)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600 }}>
          {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {titulo}
        </span>
        <span className={`cifra ${colorPositivo ? 'cifra-positiva' : 'cifra-negativa'}`} style={{ fontSize: 16, fontWeight: 600 }}>
          {formatearMoneda(total)}
        </span>
      </button>

      {abierta && (
        <div style={{ borderTop: '1px solid var(--color-border)' }}>
          {filas.length === 0 ? (
            <p className="estado-vacio">No hay movimientos en este rango.</p>
          ) : (
            filas.map((fila) => (
              <div key={fila.categoriaId}>
                <button
                  onClick={() => setCategoriaExpandida(categoriaExpandida === fila.categoriaId ? null : fila.categoriaId)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 20px 10px 36px',
                    background: 'none',
                    border: 'none',
                    borderTop: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 14,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {categoriaExpandida === fila.categoriaId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {fila.categoriaNombre}
                  </span>
                  <span className="cifra" style={{ color: 'var(--color-text)' }}>
                    {formatearMoneda(fila.total)}
                  </span>
                </button>

                {categoriaExpandida === fila.categoriaId && (
                  <div style={{ padding: '4px 20px 12px 56px', background: 'var(--color-hover-suave)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <tbody>
                        {meses.map((mes) => (
                          <tr key={mes}>
                            <td style={{ padding: '4px 8px 4px 0', color: 'var(--color-text-muted)' }}>{formatearMes(mes)}</td>
                            <td style={{ padding: '4px 0', textAlign: 'right' }}>{formatearMoneda(fila.porMes[mes] ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DetalleMensualCompleto({
  filas,
}: {
  filas: { mes: string; ingresos: number; gastos: number; saldo: number }[];
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className="tarjeta" style={{ padding: 0 }}>
      <button
        onClick={() => setAbierta(!abierta)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '16px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Detalle mensual completo
      </button>

      {abierta && (
        <div className="tabla-scroll">
        <table className="tabla-filas-hover" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, borderTop: '1px solid var(--color-border)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '8px 20px', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 500 }}>Mes</th>
              <th style={{ padding: '8px 20px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 500 }}>Ingresos</th>
              <th style={{ padding: '8px 20px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 500 }}>Gastos</th>
              <th style={{ padding: '8px 20px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 500 }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.mes} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '8px 20px' }}>{formatearMes(f.mes)}</td>
                <td className="cifra cifra-positiva" style={{ padding: '8px 20px', textAlign: 'right' }}>
                  {formatearMoneda(f.ingresos)}
                </td>
                <td className="cifra cifra-negativa" style={{ padding: '8px 20px', textAlign: 'right' }}>
                  {formatearMoneda(f.gastos)}
                </td>
                <td className={`cifra ${f.saldo >= 0 ? 'cifra-positiva' : 'cifra-negativa'}`} style={{ padding: '8px 20px', textAlign: 'right' }}>
                  {formatearMoneda(f.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
