'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useEspacioActivoContext } from '../../../lib/contexto-espacio-activo';
import { formatearMoneda, formatearFecha } from '../../../lib/formato';
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

export default function PaginaPatrimonio() {
  const { token, espacio, error: errorEspacio } = useEspacioActivoContext();
  const [registros, setRegistros] = useState<Patrimonio[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  const etiquetas = registros.map((r) => mesAEtiqueta(r.mes));
  const series = [
    {
      nombre: 'Patrimonio neto',
      color: 'var(--color-accent)',
      valores: registros.map(calcularPatrimonioNeto),
    },
    { nombre: 'Cuentas', color: '#3b82f6', valores: registros.map((r) => r.total_cuentas) },
    { nombre: 'Inversiones líquidas', color: '#10b981', valores: registros.map((r) => r.total_inversiones_liquidas) },
    { nombre: 'Inversiones intocables', color: '#f59e0b', valores: registros.map((r) => r.total_inversiones_intocables) },
    { nombre: 'Deuda', color: '#ef4444', valores: registros.map((r) => r.total_deuda) },
  ];

  const ultimoPatrimonioNeto = registros.length > 0 ? calcularPatrimonioNeto(registros[registros.length - 1]) : null;

  return (
    <main className="contenido" style={{ maxWidth: 1080 }}>
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
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
          <div className="tarjeta" style={{ marginBottom: 24 }}>
            {registros.length === 0 ? (
              <p className="estado-vacio">
                Aún no hay registros de patrimonio. Añade el primero con el formulario de abajo.
              </p>
            ) : (
              <GraficoSVG etiquetas={etiquetas} series={series} tipo="lineas" formatearValor={formatearMoneda} />
            )}
          </div>

          <section className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 32 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Historial mensual ({registros.length})</h2>
              <div className="tarjeta" style={{ padding: 0 }}>
                <div className="tabla-scroll">
                  <table className="tabla-filas-hover" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={celdaCabecera}>Mes</th>
                        <th style={celdaCabecera}>Cuentas</th>
                        <th style={celdaCabecera}>Inv. líquidas</th>
                        <th style={celdaCabecera}>Inv. intocables</th>
                        <th style={celdaCabecera}>Inv. ilíquidas</th>
                        <th style={celdaCabecera}>Deuda</th>
                        <th style={celdaCabecera}>Patrimonio neto</th>
                        <th style={celdaCabecera}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {registros.map((r, i) => (
                        <tr key={r.id} style={{ borderBottom: i === registros.length - 1 ? 'none' : '1px solid var(--color-border)' }}>
                          <td style={celda}>{formatearFecha(r.mes)}</td>
                          <td style={celda}>{formatearMoneda(r.total_cuentas)}</td>
                          <td style={celda}>{formatearMoneda(r.total_inversiones_liquidas)}</td>
                          <td style={celda}>{formatearMoneda(r.total_inversiones_intocables)}</td>
                          <td style={celda}>{formatearMoneda(r.total_inversiones_iliquidas)}</td>
                          <td style={celda}>{formatearMoneda(r.total_deuda)}</td>
                          <td style={{ ...celda, fontWeight: 600 }}>{formatearMoneda(calcularPatrimonioNeto(r))}</td>
                          <td style={{ ...celda, textAlign: 'right' }}>
                            <button
                              className="enlace-discreto"
                              style={{ color: 'var(--color-red-text)' }}
                              onClick={() => eliminar(r.id)}
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <FormularioPatrimonio
              token={token}
              espacioId={espacio.id}
              onCreado={() => cargarRegistros(token, espacio.id)}
            />
          </section>
        </>
      )}
    </main>
  );
}

const celdaCabecera: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  whiteSpace: 'nowrap',
};

const celda: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 13,
  whiteSpace: 'nowrap',
};

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
    <div>
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
