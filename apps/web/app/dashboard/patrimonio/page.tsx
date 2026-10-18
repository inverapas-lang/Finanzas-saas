'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useEspacioActivoContext } from '../../../lib/contexto-espacio-activo';
import { formatearMoneda } from '../../../lib/formato';
import { GraficoSVG } from '../../../components/GraficoSVG';
import { Trash2 } from 'lucide-react';

interface Patrimonio {
  id: string;
  mes: string;
  total_cuentas: number;
  total_inversiones_liquidas: number;
  total_inversiones_intocables: number;
  total_inversiones_iliquidas: number;
  total_deuda: number;
  notas: string | null;
}

/**
 * Patrimonio neto = cuentas + inversiones líquidas + inversiones intocables
 * - deuda. Las inversiones ilíquidas (vivienda, participaciones bloqueadas...)
 * son informativas y se muestran aparte — no se suman al patrimonio neto
 * "de cabecera" porque no son dinero al que se pueda echar mano con rapidez.
 */
function calcularPatrimonioNeto(p: Patrimonio): number {
  return p.total_cuentas + p.total_inversiones_liquidas + p.total_inversiones_intocables - p.total_deuda;
}

function mesAEtiqueta(mesIso: string): string {
  return new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' }).format(new Date(mesIso + 'T00:00:00'));
}

interface FilaConcepto {
  etiqueta: string;
  obtenerValor: (p: Patrimonio) => number;
  destacada?: boolean;
  informativa?: boolean;
}

const FILAS_CONCEPTO: FilaConcepto[] = [
  { etiqueta: 'Cuentas', obtenerValor: (p) => p.total_cuentas },
  { etiqueta: 'Inversiones líquidas', obtenerValor: (p) => p.total_inversiones_liquidas },
  { etiqueta: 'Inversiones intocables', obtenerValor: (p) => p.total_inversiones_intocables },
  { etiqueta: 'Inversiones ilíquidas', obtenerValor: (p) => p.total_inversiones_iliquidas, informativa: true },
  { etiqueta: 'Deuda', obtenerValor: (p) => p.total_deuda },
  { etiqueta: 'Patrimonio neto', obtenerValor: calcularPatrimonioNeto, destacada: true },
];

export default function PaginaPatrimonio() {
  const { token, espacio, error: errorEspacio } = useEspacioActivoContext();
  const [registros, setRegistros] = useState<Patrimonio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [agrupacion, setAgrupacion] = useState<'mes' | 'anio'>('mes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // Guarda de qué espacio es la petición más reciente en vuelo — si al
  // cambiar de espacio la respuesta del anterior llega tarde, no debe pisar
  // la pantalla que ya muestra el espacio nuevo.
  const espacioIdVigente = useRef<string | null>(null);
  useEffect(() => {
    espacioIdVigente.current = espacio?.id ?? null;
  }, [espacio]);

  const cargarRegistros = useCallback(async (accessToken: string, espacioId: string) => {
    const respuesta = await fetch(`/api/patrimonio-historico?espacio_id=${espacioId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) throw new Error('No se han podido cargar los datos de patrimonio.');
    const cuerpo = await respuesta.json();
    if (espacioIdVigente.current !== espacioId) return;
    setRegistros(cuerpo.data ?? []);
  }, []);

  useEffect(() => {
    if (!token || !espacio) return;
    cargarRegistros(token, espacio.id).catch((e) =>
      setError(e instanceof Error ? e.message : 'Error al cargar los datos.')
    );
  }, [token, espacio, cargarRegistros]);

  async function eliminar(id: string) {
    if (!token || !confirm('¿Eliminar este registro de patrimonio?')) return;
    const respuesta = await fetch(`/api/patrimonio-historico/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!respuesta.ok && respuesta.status !== 204) {
      const cuerpo = await respuesta.json();
      alert(cuerpo.error ?? 'No se ha podido eliminar el registro.');
      return;
    }
    if (espacio) await cargarRegistros(token, espacio.id);
  }

  const registrosEnRango = registros.filter((r) => {
    const mes = r.mes.slice(0, 7);
    if (desde && mes < desde) return false;
    if (hasta && mes > hasta) return false;
    return true;
  });

  // En vista "mes" cada columna es un snapshot tal cual. En vista "año"
  // se agrupa por año y cada columna muestra el último mes disponible
  // de ese año (como un balance de cierre), no una suma ni una media —
  // el patrimonio es una foto, no un caudal, así que sumar meses no
  // tendría sentido.
  const columnas: { etiqueta: string; registro: Patrimonio; esCierreParcial: boolean }[] =
    agrupacion === 'mes'
      ? registrosEnRango.map((r) => ({ etiqueta: mesAEtiqueta(r.mes), registro: r, esCierreParcial: false }))
      : Object.values(
          registrosEnRango.reduce<Record<string, Patrimonio>>((acc, r) => {
            const anio = r.mes.slice(0, 4);
            if (!acc[anio] || r.mes > acc[anio].mes) acc[anio] = r;
            return acc;
          }, {})
        )
          .sort((a, b) => a.mes.localeCompare(b.mes))
          .map((r) => {
            const anio = r.mes.slice(0, 4);
            const esDiciembre = r.mes.slice(5, 7) === '12';
            return {
              etiqueta: esDiciembre ? anio : `${anio} (${mesAEtiqueta(r.mes).split(' ')[0]})`,
              registro: r,
              esCierreParcial: !esDiciembre,
            };
          });

  const etiquetasGrafico = columnas.map((c) => c.etiqueta);
  const seriesGrafico = [
    {
      nombre: 'Patrimonio neto',
      color: 'var(--color-accent)',
      valores: columnas.map((c) => calcularPatrimonioNeto(c.registro)),
    },
    { nombre: 'Cuentas', color: '#3b82f6', valores: columnas.map((c) => c.registro.total_cuentas) },
    { nombre: 'Inversiones líquidas', color: '#10b981', valores: columnas.map((c) => c.registro.total_inversiones_liquidas) },
    { nombre: 'Inversiones intocables', color: '#f59e0b', valores: columnas.map((c) => c.registro.total_inversiones_intocables) },
    { nombre: 'Deuda', color: '#ef4444', valores: columnas.map((c) => c.registro.total_deuda) },
  ];

  const ultimoRegistro = registros.length > 0 ? registros[registros.length - 1] : null;
  const ultimoPatrimonioNeto = ultimoRegistro ? calcularPatrimonioNeto(ultimoRegistro) : null;

  return (
    <main className="contenido" style={{ maxWidth: 1600 }}>
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Patrimonio histórico</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Fotografía mensual de tu patrimonio: cuentas, inversiones y deuda. El patrimonio neto no incluye las
            inversiones ilíquidas (vivienda, participaciones bloqueadas...), que se muestran aparte.
          </p>
        </div>
        {ultimoPatrimonioNeto !== null && (
          <div style={{ textAlign: 'right' }}>
            <p className="etiqueta-mayus" style={{ margin: '0 0 2px' }}>Patrimonio neto actual</p>
            <p
              className={`cifra ${ultimoPatrimonioNeto >= 0 ? 'cifra-positiva' : 'cifra-negativa'}`}
              style={{ margin: 0, fontSize: 20 }}
            >
              {formatearMoneda(ultimoPatrimonioNeto)}
            </p>
          </div>
        )}
      </header>

      {(errorEspacio || error) && <p className="mensaje-error" style={{ marginBottom: 24 }}>{errorEspacio || error}</p>}

      {token && espacio && (
        <>
          <div className="tarjeta" style={{ marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Desde <span className="texto-ayuda">(opcional)</span>
              <input type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className="campo-texto" style={{ marginTop: 6 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Hasta <span className="texto-ayuda">(opcional)</span>
              <input type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} className="campo-texto" style={{ marginTop: 6 }} />
            </label>
            {(desde || hasta) && (
              <button className="enlace-discreto" onClick={() => { setDesde(''); setHasta(''); }}>
                Ver todo el histórico
              </button>
            )}
            <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
              <button
                onClick={() => setAgrupacion('mes')}
                className={agrupacion === 'mes' ? 'boton-primario' : 'boton-secundario'}
                style={{ padding: '6px 12px', fontSize: 13 }}
              >
                Por mes
              </button>
              <button
                onClick={() => setAgrupacion('anio')}
                className={agrupacion === 'anio' ? 'boton-primario' : 'boton-secundario'}
                style={{ padding: '6px 12px', fontSize: 13 }}
              >
                Por año
              </button>
            </div>
          </div>

          <div className="tarjeta" style={{ marginBottom: 24 }}>
            {columnas.length === 0 ? (
              <p className="estado-vacio">
                Aún no hay registros de patrimonio en este rango. Añade el primero con el formulario de abajo.
              </p>
            ) : (
              <GraficoSVG etiquetas={etiquetasGrafico} series={seriesGrafico} tipo="lineas" formatearValor={formatearMoneda} />
            )}
          </div>

          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
              Historial {agrupacion === 'mes' ? 'mensual' : 'anual'} ({columnas.length})
            </h2>
            {columnas.length === 0 ? (
              <p className="estado-vacio">Nada que mostrar en este rango.</p>
            ) : (
              <div className="tabla-scroll">
                <table className="tabla-filas-hover" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th style={celdaCabecera('left', true)}>Concepto</th>
                      {columnas.map((c, i) => (
                        <th key={i} style={celdaCabecera('right')} title={c.esCierreParcial ? 'Año todavía incompleto — último mes disponible' : undefined}>
                          {c.etiqueta}
                          {c.esCierreParcial ? ' *' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FILAS_CONCEPTO.map((fila) => (
                      <tr key={fila.etiqueta} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ ...celda('left', true), fontWeight: fila.destacada ? 700 : 400, color: fila.informativa ? 'var(--color-text-muted)' : undefined }}>
                          {fila.etiqueta}
                        </td>
                        {columnas.map((c, i) => (
                          <td key={i} style={{ ...celda('right'), fontWeight: fila.destacada ? 700 : 400 }}>
                            {formatearMoneda(fila.obtenerValor(c.registro))}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {agrupacion === 'mes' && (
                      <tr>
                        <td style={celda('left', true)}></td>
                        {columnas.map((c, i) => (
                          <td key={i} style={{ ...celda('right') }}>
                            <button
                              className="enlace-discreto"
                              style={{ color: 'var(--color-red-text)' }}
                              onClick={() => eliminar(c.registro.id)}
                              title="Eliminar este mes"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <FormularioPatrimonio
            token={token}
            espacioId={espacio.id}
            onCreado={() => cargarRegistros(token, espacio.id)}
          />
        </>
      )}
    </main>
  );
}

function celdaCabecera(align: 'left' | 'right', fijo = false): React.CSSProperties {
  return {
    padding: '10px 16px',
    textAlign: align,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap',
    ...(fijo ? { position: 'sticky', left: 0, background: 'var(--color-bg)' } : {}),
  };
}

function celda(align: 'left' | 'right', fijo = false): React.CSSProperties {
  return {
    padding: '8px 16px',
    textAlign: align,
    whiteSpace: 'nowrap',
    ...(fijo ? { position: 'sticky', left: 0, background: 'var(--color-bg)' } : {}),
  };
}

function FormularioPatrimonio({
  token,
  espacioId,
  onCreado,
}: {
  token: string;
  espacioId: string;
  onCreado: () => void;
}) {
  const [mes, setMes] = useState('');
  const [totalCuentas, setTotalCuentas] = useState('0');
  const [totalInversionesLiquidas, setTotalInversionesLiquidas] = useState('0');
  const [totalInversionesIntocables, setTotalInversionesIntocables] = useState('0');
  const [totalInversionesIliquidas, setTotalInversionesIliquidas] = useState('0');
  const [totalDeuda, setTotalDeuda] = useState('0');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      if (!mes) throw new Error('Indica el mes del snapshot.');
      const respuesta = await fetch('/api/patrimonio-historico', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: espacioId,
          mes: `${mes}-01`,
          total_cuentas: Number(totalCuentas || 0),
          total_inversiones_liquidas: Number(totalInversionesLiquidas || 0),
          total_inversiones_intocables: Number(totalInversionesIntocables || 0),
          total_inversiones_iliquidas: Number(totalInversionesIliquidas || 0),
          total_deuda: Number(totalDeuda || 0),
          notas: notas || null,
        }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido crear el registro.');
      }
      setMes('');
      setTotalCuentas('0');
      setTotalInversionesLiquidas('0');
      setTotalInversionesIntocables('0');
      setTotalInversionesIliquidas('0');
      setTotalDeuda('0');
      setNotas('');
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el registro.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Nuevo snapshot mensual</h2>
      <form onSubmit={crear} className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Cuentas (€)
          <input
            type="number"
            step="0.01"
            value={totalCuentas}
            onChange={(e) => setTotalCuentas(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Inversiones líquidas (€)
          <input
            type="number"
            step="0.01"
            value={totalInversionesLiquidas}
            onChange={(e) => setTotalInversionesLiquidas(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Inversiones intocables (€) <span className="texto-ayuda">(pensiones, fondo de emergencia...)</span>
          <input
            type="number"
            step="0.01"
            value={totalInversionesIntocables}
            onChange={(e) => setTotalInversionesIntocables(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Inversiones ilíquidas (€) <span className="texto-ayuda">(informativo, no cuenta en el neto)</span>
          <input
            type="number"
            step="0.01"
            value={totalInversionesIliquidas}
            onChange={(e) => setTotalInversionesIliquidas(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Deuda (€)
          <input
            type="number"
            step="0.01"
            value={totalDeuda}
            onChange={(e) => setTotalDeuda(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Notas <span className="texto-ayuda">(opcional)</span>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>
        {error && <p className="mensaje-error">{error}</p>}
        <button type="submit" className="boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar snapshot'}
        </button>
      </form>
    </div>
  );
}
