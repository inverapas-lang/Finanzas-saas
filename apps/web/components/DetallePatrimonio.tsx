'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatearMoneda, formatearMes } from '../lib/formato';
import { GraficoSVG, type SerieGrafico } from './GraficoSVG';
import {
  agruparPatrimonioItem,
  mesesDistintos,
  type BloquePatrimonioAgregado,
  type PatrimonioItemFila,
} from '../lib/agregaciones-patrimonio-item';
import { BLOQUES_PATRIMONIO, ETIQUETAS_BLOQUE, type BloquePatrimonio } from '../lib/validacion-patrimonio-historico-item';

interface Props {
  token: string;
  espacioId: string;
}

// Los 5 colores ya usados en el gráfico de bloques de la página de
// patrimonio (arriba) más unos cuantos colores habituales de gráfico, para
// poder distinguir hasta una docena de conceptos seleccionados a la vez.
const COLORES_GRAFICO = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
  '#0ea5e9',
  '#a855f7',
];

function mesActualIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface ClaveConcepto {
  clave: string;
  bloque: BloquePatrimonio;
  concepto: string;
}

/**
 * Sección de detalle por concepto (cuenta, inversión o deuda concreta),
 * bajo la vista de totales por bloque de apps/web/app/dashboard/patrimonio/page.tsx.
 * Carga sus propios datos de /api/patrimonio-historico-item de forma
 * independiente — no comparte estado con la sección de totales de arriba.
 *
 * Las columnas de la rejilla editable son TODOS los meses que ya tienen
 * algún dato (más el mes actual, para poder empezar a rellenarlo aunque
 * aún no tenga nada) — a diferencia de VistaAnualMovimientos, que fija los
 * 12 meses de un año de calendario, el histórico de patrimonio puede
 * llevar varios años y no tiene por qué alinearse con un año concreto.
 * El gráfico, en cambio, sí tiene su propio filtro desde/hasta para poder
 * acotar la serie visible sin tocar la rejilla.
 */
export function DetallePatrimonio({ token, espacioId }: Props) {
  const [filas, setFilas] = useState<PatrimonioItemFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [desdeGrafico, setDesdeGrafico] = useState('');
  const [hastaGrafico, setHastaGrafico] = useState('');
  const [conceptosSeleccionados, setConceptosSeleccionados] = useState<Set<string>>(new Set());
  const [tipoGrafico, setTipoGrafico] = useState<'lineas' | 'puntos' | 'barras'>('lineas');
  const [busquedaConcepto, setBusquedaConcepto] = useState('');

  // Guarda de qué espacio es la petición más reciente en vuelo, igual que
  // en el resto de páginas del panel — si la respuesta de un espacio
  // anterior llega tarde, no debe pisar los datos del espacio actual.
  const espacioIdVigente = useRef(espacioId);
  useEffect(() => {
    espacioIdVigente.current = espacioId;
  }, [espacioId]);

  const cargar = useCallback(
    async (espId: string) => {
      setCargando(true);
      setError(null);
      try {
        const respuesta = await fetch(`/api/patrimonio-historico-item?espacio_id=${espId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!respuesta.ok) throw new Error('No se han podido cargar los datos de detalle de patrimonio.');
        const cuerpo = await respuesta.json();
        if (espacioIdVigente.current !== espId) return;
        setFilas(cuerpo.data ?? []);
      } catch (e) {
        if (espacioIdVigente.current === espId) {
          setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
        }
      } finally {
        if (espacioIdVigente.current === espId) setCargando(false);
      }
    },
    [token]
  );

  useEffect(() => {
    cargar(espacioId);
  }, [espacioId, cargar]);

  const meses = useMemo(() => {
    const presentes = mesesDistintos(filas);
    const actual = mesActualIso();
    return presentes.includes(actual) ? presentes : [...presentes, actual].sort();
  }, [filas]);

  const agregado = useMemo(() => agruparPatrimonioItem(filas, meses), [filas, meses]);

  const todasLasClaves: ClaveConcepto[] = useMemo(() => {
    const claves: ClaveConcepto[] = [];
    for (const b of agregado.bloques) {
      for (const c of b.conceptos) {
        claves.push({ clave: `${b.bloque}::${c.concepto}`, bloque: b.bloque, concepto: c.concepto });
      }
    }
    return claves;
  }, [agregado]);

  async function guardarCelda(bloque: BloquePatrimonio, concepto: string, mes: string, id: string | null, nuevoValor: number) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      if (id) {
        const respuesta = await fetch(`/api/patrimonio-historico-item/${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ valor: nuevoValor }),
        });
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json();
          throw new Error(cuerpo.error ?? 'No se ha podido guardar el cambio.');
        }
      } else {
        if (nuevoValor === 0) return; // no crear una fila vacía solo por haber tocado la celda
        const respuesta = await fetch('/api/patrimonio-historico-item', {
          method: 'POST',
          headers,
          body: JSON.stringify({ espacio_id: espacioId, mes: `${mes}-01`, bloque, concepto, valor: nuevoValor }),
        });
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json();
          throw new Error(cuerpo.error ?? 'No se ha podido crear el registro.');
        }
      }
      await cargar(espacioId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    }
  }

  async function crearConcepto(bloque: BloquePatrimonio, concepto: string, mes: string, valor: number) {
    const respuesta = await fetch('/api/patrimonio-historico-item', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ espacio_id: espacioId, mes: `${mes}-01`, bloque, concepto, valor }),
    });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json();
      throw new Error(cuerpo.error ?? 'No se ha podido crear el concepto.');
    }
    await cargar(espacioId);
  }

  function alternarConcepto(clave: string) {
    setConceptosSeleccionados((anterior) => {
      const nuevo = new Set(anterior);
      if (nuevo.has(clave)) nuevo.delete(clave);
      else nuevo.add(clave);
      return nuevo;
    });
  }

  const mesesGrafico = meses.filter((m) => (!desdeGrafico || m >= desdeGrafico) && (!hastaGrafico || m <= hastaGrafico));

  const seriesGrafico: SerieGrafico[] = [...conceptosSeleccionados]
    .map((clave, i): SerieGrafico | null => {
      const item = todasLasClaves.find((c) => c.clave === clave);
      if (!item) return null;
      const bloqueAgregado = agregado.bloques.find((b) => b.bloque === item.bloque);
      const filaConcepto = bloqueAgregado?.conceptos.find((c) => c.concepto === item.concepto);
      if (!filaConcepto) return null;
      return {
        nombre: `${item.concepto} (${ETIQUETAS_BLOQUE[item.bloque]})`,
        color: COLORES_GRAFICO[i % COLORES_GRAFICO.length],
        valores: mesesGrafico.map((m) => filaConcepto.porMes[m]?.valor ?? 0),
      };
    })
    .filter((s): s is SerieGrafico => s !== null);

  if (cargando) {
    return <p className="estado-vacio">Cargando detalle…</p>;
  }

  return (
    <section style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Detalle por cuenta, inversión y deuda</h2>
      <p className="texto-ayuda" style={{ margin: '0 0 16px' }}>
        Lleva el detalle de cada cuenta, inversión o deuda por su nombre (p. ej. "Cta Santander", "Revolut Piso
        Alicante", "Nissan"), mes a mes.
      </p>

      {error && (
        <p className="mensaje-error" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      <div style={{ marginBottom: 24 }}>
        {BLOQUES_PATRIMONIO.map((bloque) => {
          const bloqueAgregado = agregado.bloques.find((b) => b.bloque === bloque)!;
          return (
            <SeccionBloque
              key={bloque}
              bloque={bloque}
              bloqueAgregado={bloqueAgregado}
              meses={meses}
              onGuardarCelda={guardarCelda}
              onCrearConcepto={crearConcepto}
            />
          );
        })}
      </div>

      <div className="tarjeta" style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Patrimonio neto (según detalle)</h3>
        <p className="texto-ayuda" style={{ margin: '0 0 12px' }}>
          Cuentas + inversiones líquidas + inversiones intocables − deuda, con la misma fórmula que el patrimonio
          neto de arriba. Las inversiones ilíquidas no se incluyen.
        </p>
        <div className="tabla-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              <tr>
                {meses.map((mes) => (
                  <td key={mes} style={{ padding: '4px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div className="texto-ayuda" style={{ fontSize: 11 }}>
                      {formatearMes(mes)}
                    </div>
                    <div
                      className={`cifra ${agregado.patrimonioNetoPorMes[mes] >= 0 ? 'cifra-positiva' : 'cifra-negativa'}`}
                      style={{ fontWeight: 600 }}
                    >
                      {formatearMoneda(agregado.patrimonioNetoPorMes[mes])}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="tarjeta">
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Gráfico por concepto</h3>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Desde <span className="texto-ayuda">(opcional)</span>
            <input
              type="month"
              value={desdeGrafico}
              onChange={(e) => setDesdeGrafico(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Hasta <span className="texto-ayuda">(opcional)</span>
            <input
              type="month"
              value={hastaGrafico}
              onChange={(e) => setHastaGrafico(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>
          {(desdeGrafico || hastaGrafico) && (
            <button
              className="enlace-discreto"
              onClick={() => {
                setDesdeGrafico('');
                setHastaGrafico('');
              }}
            >
              Ver todo el histórico
            </button>
          )}
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            <button
              onClick={() => setTipoGrafico('lineas')}
              className={tipoGrafico === 'lineas' ? 'boton-primario' : 'boton-secundario'}
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              Línea
            </button>
            <button
              onClick={() => setTipoGrafico('puntos')}
              className={tipoGrafico === 'puntos' ? 'boton-primario' : 'boton-secundario'}
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              Puntos
            </button>
            <button
              onClick={() => setTipoGrafico('barras')}
              className={tipoGrafico === 'barras' ? 'boton-primario' : 'boton-secundario'}
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              Barras
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
          <SelectorConceptos
            todasLasClaves={todasLasClaves}
            seleccionados={conceptosSeleccionados}
            onAlternar={alternarConcepto}
            busqueda={busquedaConcepto}
            onBusqueda={setBusquedaConcepto}
          />

          <div>
            {seriesGrafico.length === 0 ? (
              <p className="estado-vacio">Elige uno o varios conceptos para verlos en el gráfico.</p>
            ) : (
              <GraficoSVG
                etiquetas={mesesGrafico.map(formatearMes)}
                series={seriesGrafico}
                tipo={tipoGrafico}
                formatearValor={formatearMoneda}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function celdaCabecera(align: 'left' | 'right', fijo = false): React.CSSProperties {
  return {
    padding: '8px 12px',
    textAlign: align,
    color: 'var(--color-text-muted)',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    ...(fijo ? { position: 'sticky', left: 0, background: 'var(--color-bg)' } : {}),
  };
}

function celda(align: 'left' | 'right', fijo = false): React.CSSProperties {
  return {
    padding: '6px 12px',
    textAlign: align,
    whiteSpace: 'nowrap',
    ...(fijo ? { position: 'sticky', left: 0, background: 'var(--color-bg)' } : {}),
  };
}

function SeccionBloque({
  bloque,
  bloqueAgregado,
  meses,
  onGuardarCelda,
  onCrearConcepto,
}: {
  bloque: BloquePatrimonio;
  bloqueAgregado: BloquePatrimonioAgregado;
  meses: string[];
  onGuardarCelda: (
    bloque: BloquePatrimonio,
    concepto: string,
    mes: string,
    id: string | null,
    valor: number
  ) => void | Promise<void>;
  onCrearConcepto: (bloque: BloquePatrimonio, concepto: string, mes: string, valor: number) => Promise<void>;
}) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{ETIQUETAS_BLOQUE[bloque]}</h3>
        <button className="enlace-discreto" onClick={() => setMostrarFormulario((v) => !v)}>
          {mostrarFormulario ? 'Cancelar' : '+ Nuevo concepto'}
        </button>
      </div>

      {mostrarFormulario && (
        <FormularioNuevoConcepto
          onCrear={async (concepto, mes, valor) => {
            await onCrearConcepto(bloque, concepto, mes, valor);
            setMostrarFormulario(false);
          }}
        />
      )}

      <div className="tabla-scroll">
        <table className="tabla-filas-hover" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={celdaCabecera('left', true)}>Concepto</th>
              {meses.map((mes) => (
                <th key={mes} style={celdaCabecera('right')}>
                  {formatearMes(mes)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bloqueAgregado.conceptos.length === 0 ? (
              <tr>
                <td colSpan={meses.length + 1} className="estado-vacio">
                  Aún no hay conceptos en {ETIQUETAS_BLOQUE[bloque].toLowerCase()}. Añade el primero arriba.
                </td>
              </tr>
            ) : (
              bloqueAgregado.conceptos.map((fila) => (
                <tr key={fila.concepto} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={celda('left', true)}>{fila.concepto}</td>
                  {meses.map((mes) => (
                    <CeldaEditable
                      key={mes}
                      celda={fila.porMes[mes]}
                      onGuardar={(valor) => onGuardarCelda(bloque, fila.concepto, mes, fila.porMes[mes].id, valor)}
                    />
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {bloqueAgregado.conceptos.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                <td style={{ ...celda('left', true), fontWeight: 600 }}>Total {ETIQUETAS_BLOQUE[bloque].toLowerCase()}</td>
                {meses.map((mes) => (
                  <td key={mes} style={{ ...celda('right'), fontWeight: 600 }}>
                    {formatearMoneda(bloqueAgregado.totalPorMes[mes])}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function FormularioNuevoConcepto({ onCrear }: { onCrear: (concepto: string, mes: string, valor: number) => Promise<void> }) {
  const [concepto, setConcepto] = useState('');
  const [mes, setMes] = useState('');
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      if (!concepto.trim()) throw new Error('Indica el nombre del concepto.');
      if (!mes) throw new Error('Indica el mes.');
      await onCrear(concepto.trim(), mes, Number(valor || 0));
      setConcepto('');
      setMes('');
      setValor('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el concepto.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      onSubmit={crear}
      className="tarjeta"
      style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12, padding: 12 }}
    >
      <label style={{ fontSize: 12, fontWeight: 500 }}>
        Nombre del concepto
        <input
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          className="campo-texto"
          placeholder="Cta Santander"
          style={{ marginTop: 4, width: 200 }}
        />
      </label>
      <label style={{ fontSize: 12, fontWeight: 500 }}>
        Mes
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="campo-texto" style={{ marginTop: 4 }} />
      </label>
      <label style={{ fontSize: 12, fontWeight: 500 }}>
        Valor (€)
        <input
          type="number"
          step="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="campo-texto"
          style={{ marginTop: 4, width: 120 }}
        />
      </label>
      {error && (
        <p className="mensaje-error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <button type="submit" className="boton-primario" disabled={guardando} style={{ fontSize: 13, padding: '6px 12px' }}>
        {guardando ? 'Añadiendo…' : 'Añadir'}
      </button>
    </form>
  );
}

function CeldaEditable({
  celda: c,
  onGuardar,
}: {
  celda: { valor: number; id: string | null };
  onGuardar: (valor: number) => void | Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(String(c.valor || ''));

  useEffect(() => {
    if (!editando) setTexto(String(c.valor || ''));
  }, [c.valor, editando]);

  function confirmar() {
    setEditando(false);
    const nuevoValor = texto.trim() === '' ? 0 : Number(texto.replace(',', '.'));
    if (Number.isFinite(nuevoValor) && nuevoValor !== c.valor) {
      onGuardar(nuevoValor);
    }
  }

  if (editando) {
    return (
      <td style={{ padding: '2px 6px', textAlign: 'right' }}>
        <input
          autoFocus
          type="number"
          step="0.01"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setTexto(String(c.valor || ''));
              setEditando(false);
            }
          }}
          className="campo-texto"
          style={{ width: 90, padding: '3px 6px', textAlign: 'right', fontSize: 13 }}
        />
      </td>
    );
  }

  return (
    <td
      onClick={() => setEditando(true)}
      style={{ padding: '6px 12px', textAlign: 'right', whiteSpace: 'nowrap', cursor: 'pointer' }}
      title="Haz clic para editar"
    >
      {c.valor ? formatearMoneda(c.valor) : <span className="texto-ayuda">—</span>}
    </td>
  );
}

function SelectorConceptos({
  todasLasClaves,
  seleccionados,
  onAlternar,
  busqueda,
  onBusqueda,
}: {
  todasLasClaves: ClaveConcepto[];
  seleccionados: Set<string>;
  onAlternar: (clave: string) => void;
  busqueda: string;
  onBusqueda: (v: string) => void;
}) {
  const filtro = busqueda.trim().toLowerCase();
  const porBloque = BLOQUES_PATRIMONIO.map((bloque) => ({
    bloque,
    items: todasLasClaves.filter((c) => c.bloque === bloque && (!filtro || c.concepto.toLowerCase().includes(filtro))),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <input
        value={busqueda}
        onChange={(e) => onBusqueda(e.target.value)}
        placeholder="Buscar concepto…"
        className="campo-texto"
        style={{ marginBottom: 8, fontSize: 13 }}
      />
      <div
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 8,
        }}
      >
        {todasLasClaves.length === 0 ? (
          <p className="texto-ayuda" style={{ fontSize: 12, margin: 0 }}>
            Aún no hay conceptos. Añade alguno en la rejilla de arriba.
          </p>
        ) : porBloque.length === 0 ? (
          <p className="texto-ayuda" style={{ fontSize: 12, margin: 0 }}>
            Sin resultados para "{busqueda}".
          </p>
        ) : (
          porBloque.map((grupo) => (
            <div key={grupo.bloque} style={{ marginBottom: 10 }}>
              <p className="etiqueta-mayus" style={{ margin: '0 0 4px' }}>
                {ETIQUETAS_BLOQUE[grupo.bloque]}
              </p>
              {grupo.items.map((item) => (
                <label
                  key={item.clave}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '3px 0', cursor: 'pointer' }}
                >
                  <input type="checkbox" checked={seleccionados.has(item.clave)} onChange={() => onAlternar(item.clave)} />
                  {item.concepto}
                </label>
              ))}
            </div>
          ))
        )}
      </div>
      {seleccionados.size > 0 && (
        <button
          className="enlace-discreto"
          style={{ marginTop: 8, fontSize: 12 }}
          onClick={() => [...seleccionados].forEach(onAlternar)}
        >
          Quitar selección ({seleccionados.size})
        </button>
      )}
    </div>
  );
}
