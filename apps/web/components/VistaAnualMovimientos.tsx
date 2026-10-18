'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatearMoneda, formatearMes } from '../lib/formato';
import {
  agruparParaVistaAnual,
  mesesDelAnio,
  type FilaVistaAnualCategoria,
  type MovimientoParaVistaAnual,
} from '../lib/agregaciones-vista-anual';

interface Categoria {
  id: string;
  nombre: string;
}

interface Props {
  token: string;
  espacioId: string;
  tipo: 'ingreso' | 'gasto';
}

/**
 * Rejilla "concepto x mes" editable: cada categoría es una fila, cada
 * mes del año una columna. Complementa a Carga masiva (pensada para
 * meter de golpe una serie de muchos meses de una sola categoría) con
 * la posibilidad de corregir a mano cualquier celda después, sin tener
 * que ir a buscar el movimiento concreto en la lista.
 *
 * Si una celda agrupa más de un movimiento (p. ej. dos compras del
 * mismo mes en la misma categoría) no se puede editar en línea — sería
 * ambiguo a cuál de los dos cambiar — y se indica con un asterisco.
 */
export function VistaAnualMovimientos({ token, espacioId, tipo }: Props) {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoParaVistaAnual[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const anioVigente = useRef(anio);
  useEffect(() => {
    anioVigente.current = anio;
  }, [anio]);

  const tabla = tipo === 'ingreso' ? 'ingresos' : 'gastos';
  const campoImporte = tipo === 'ingreso' ? 'importe_esperado' : 'importe_previsto';
  const campoFechaConfirmacion = tipo === 'ingreso' ? 'fecha_cobrada' : 'fecha_pagada';

  const cargar = useCallback(
    async (anioConsultado: number) => {
      setCargando(true);
      setError(null);
      const headers = { Authorization: `Bearer ${token}` };
      const desde = `${anioConsultado}-01-01`;
      const hasta = `${anioConsultado}-12-31`;
      try {
        const [resCategorias, resMovimientos] = await Promise.all([
          fetch(`/api/categorias?espacio_id=${espacioId}&tipo=${tipo}`, { headers }),
          fetch(`/api/${tabla}?espacio_id=${espacioId}&desde=${desde}&hasta=${hasta}`, { headers }),
        ]);
        if (!resCategorias.ok || !resMovimientos.ok) throw new Error('No se han podido cargar los datos.');
        const [datosCategorias, datosMovimientos] = await Promise.all([resCategorias.json(), resMovimientos.json()]);
        if (anioVigente.current !== anioConsultado) return;
        setCategorias(datosCategorias.data ?? []);
        setMovimientos(datosMovimientos.data ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        if (anioVigente.current === anioConsultado) setCargando(false);
      }
    },
    [token, espacioId, tipo, tabla]
  );

  useEffect(() => {
    cargar(anio);
  }, [anio, cargar]);

  const meses = mesesDelAnio(anio);
  const filas = agruparParaVistaAnual(movimientos, categorias, meses);
  const totalesPorMes = Object.fromEntries(
    meses.map((mes) => [mes, filas.reduce((acc, f) => acc + f.porMes[mes].valor, 0)])
  );
  const totalAnual = filas.reduce((acc, f) => acc + f.total, 0);

  async function guardarCelda(fila: FilaVistaAnualCategoria, mes: string, nuevoValor: number) {
    const celda = fila.porMes[mes];
    if (celda.cantidadMovimientos > 1) return; // no editable en línea, ver comentario arriba

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      if (celda.movimientoId) {
        const respuesta = await fetch(`/api/${tabla}/${celda.movimientoId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ [campoImporte]: nuevoValor, importe_real: nuevoValor }),
        });
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json();
          throw new Error(cuerpo.error ?? 'No se ha podido guardar el cambio.');
        }
      } else {
        if (nuevoValor === 0) return; // no crear un movimiento vacío solo por haber tocado la celda
        const fecha = `${mes}-01`;
        const respuesta = await fetch(`/api/${tabla}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            espacio_id: espacioId,
            categoria_id: fila.categoriaId === 'sin-categoria' ? null : fila.categoriaId,
            descripcion: fila.categoriaNombre,
            [campoImporte]: nuevoValor,
            importe_real: nuevoValor,
            fecha_prevista: fecha,
            [campoFechaConfirmacion]: fecha,
          }),
        });
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json();
          throw new Error(cuerpo.error ?? 'No se ha podido crear el movimiento.');
        }
      }
      await cargar(anio);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    }
  }

  if (cargando) {
    return <p className="estado-vacio">Cargando…</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button className="enlace-discreto" onClick={() => setAnio((a) => a - 1)}>
          ← {anio - 1}
        </button>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{anio}</span>
        <button className="enlace-discreto" onClick={() => setAnio((a) => a + 1)}>
          {anio + 1} →
        </button>
        <span className="texto-ayuda" style={{ fontSize: 12, marginLeft: 'auto' }}>
          Un asterisco (*) indica varios movimientos ese mes — edítalos desde la lista de abajo.
        </span>
      </div>

      {error && <p className="mensaje-error" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="tabla-scroll">
        <table className="tabla-filas-hover" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={celdaCabecera('left', true)}>Concepto</th>
              {meses.map((mes) => (
                <th key={mes} style={celdaCabecera('right')}>{formatearMes(mes)}</th>
              ))}
              <th style={{ ...celdaCabecera('right'), fontWeight: 700 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={meses.length + 2} className="estado-vacio">
                  Aún no hay categorías de {tipo === 'ingreso' ? 'ingreso' : 'gasto'}. Créalas en Categorías.
                </td>
              </tr>
            ) : (
              filas.map((fila) => (
                <tr key={fila.categoriaId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={celda('left', true)}>{fila.categoriaNombre}</td>
                  {meses.map((mes) => (
                    <CeldaEditable
                      key={mes}
                      celda={fila.porMes[mes]}
                      onGuardar={(valor) => guardarCelda(fila, mes, valor)}
                    />
                  ))}
                  <td style={{ ...celda('right'), fontWeight: 600 }}>{formatearMoneda(fila.total)}</td>
                </tr>
              ))
            )}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                <td style={{ ...celda('left', true), fontWeight: 600 }}>Total</td>
                {meses.map((mes) => (
                  <td key={mes} style={{ ...celda('right'), fontWeight: 600 }}>
                    {formatearMoneda(totalesPorMes[mes])}
                  </td>
                ))}
                <td style={{ ...celda('right'), fontWeight: 700 }}>{formatearMoneda(totalAnual)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
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

function CeldaEditable({
  celda: c,
  onGuardar,
}: {
  celda: { valor: number; movimientoId: string | null; cantidadMovimientos: number };
  onGuardar: (valor: number) => void | Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(String(c.valor || ''));
  const noEditable = c.cantidadMovimientos > 1;

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

  if (noEditable) {
    return (
      <td
        style={{ padding: '6px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}
        title={`${c.cantidadMovimientos} movimientos este mes — no editable aquí`}
      >
        {c.valor ? formatearMoneda(c.valor) : '—'}*
      </td>
    );
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
