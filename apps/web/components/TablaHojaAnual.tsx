'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { formatearCifra, formatearMesCorto } from '../lib/formato';
import { evaluarEntradaCelda } from '../lib/expresion-celda';
import type { BloqueResultados, CeldaHoja, FilaHoja, FilaResultado, HojaAnual } from '../lib/hoja-anual';

/**
 * Tabla de la hoja anual, con la misma forma que la hoja del Excel:
 * concepto | ENE…DIC | Total | % | Mensualizado. Ingresos y gastos en la
 * misma tabla, subtotales en negrita con sus subcategorías debajo, y los
 * negativos en rojo.
 */

const FONDO = 'var(--color-bg)';
const LINEA = '1px solid var(--color-border)';

const e = {
  tabla: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    fontSize: 12.5,
    fontVariantNumeric: 'tabular-nums',
  } satisfies CSSProperties,
  concepto: {
    padding: '5px 8px 5px 14px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 230,
    minWidth: 150,
    position: 'sticky',
    left: 0,
    background: FONDO,
    borderBottom: LINEA,
    zIndex: 1,
  } satisfies CSSProperties,
  cifra: { padding: '5px 5px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: LINEA } satisfies CSSProperties,
  total: {
    padding: '5px 8px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    fontWeight: 600,
    borderLeft: LINEA,
    borderBottom: LINEA,
  } satisfies CSSProperties,
  extra: {
    padding: '5px 8px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-muted)',
    borderBottom: LINEA,
  } satisfies CSSProperties,
  cabecera: { color: 'var(--color-text-muted)', fontWeight: 500, borderBottom: LINEA } satisfies CSSProperties,
  seccion: {
    padding: '14px 8px 6px 14px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--color-text-muted)',
    borderBottom: LINEA,
    position: 'sticky',
    left: 0,
    background: FONDO,
  } satisfies CSSProperties,
};

const formatoPct = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 });

function Cifra({ valor, vacioSiCero = true }: { valor: number | null; vacioSiCero?: boolean }) {
  if (valor === null) return <span className="texto-ayuda">—</span>;
  const redondeado = Math.round(valor * 100) / 100;
  if (vacioSiCero && redondeado === 0) return <span className="texto-ayuda">—</span>;
  return <span style={redondeado < 0 ? { color: 'var(--color-red-text)' } : undefined}>{formatearCifra(valor)}</span>;
}

function Porcentaje({ valor }: { valor: number | null }) {
  if (valor === null || !Number.isFinite(valor) || Math.abs(valor) < 0.0005) return <span className="texto-ayuda">—</span>;
  return <>{formatoPct.format(valor)}</>;
}

export interface PropsTablaHojaAnual {
  anio: number;
  hoja: HojaAnual;
  /** Guarda una celda de concepto. `valor` con el signo de la hoja (gastos en negativo); null = vaciar. */
  onGuardarCelda: (fila: FilaHoja, indiceMes: number, valor: number | null, formula: string | null) => Promise<void>;
  /** Guarda una celda de las filas de resultados editables. */
  onGuardarResultado: (campo: NonNullable<FilaResultado['editable']>, indiceMes: number, valor: number | null) => Promise<void>;
}

export function TablaHojaAnual({ anio, hoja, onGuardarCelda, onGuardarResultado }: PropsTablaHojaAnual) {
  const columnas = 12 + 4;

  return (
    <div className="tabla-scroll">
      <table className="tabla-filas-hover" style={e.tabla}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...e.concepto, ...e.cabecera, verticalAlign: 'bottom', zIndex: 2 }}>
              Concepto
              <div style={{ fontSize: 11, fontWeight: 400 }}>Importes en €</div>
            </th>
            <th colSpan={12} style={{ padding: '8px 8px 2px', textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
              {anio}
            </th>
            <th rowSpan={2} style={{ ...e.total, ...e.cabecera, color: 'var(--color-text)', verticalAlign: 'bottom' }}>
              Total {anio}
            </th>
            <th rowSpan={2} style={{ ...e.extra, ...e.cabecera, verticalAlign: 'bottom' }}>%</th>
            <th rowSpan={2} style={{ ...e.extra, ...e.cabecera, verticalAlign: 'bottom' }} title="Total del año / 12">
              Mensualizado
            </th>
          </tr>
          <tr>
            {hoja.meses.map((m) => (
              <th key={m} style={{ ...e.cifra, ...e.cabecera }}>
                {formatearMesCorto(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <FilaSeccion columnas={columnas}>Ingresos</FilaSeccion>
          {hoja.ingresos.length === 0 && <FilaVacia columnas={columnas} texto="Aún no hay categorías de ingreso." />}
          {hoja.ingresos.map((f) => (
            <FilaConcepto key={f.clave} fila={f} onGuardar={onGuardarCelda} />
          ))}
          <FilaSeccion columnas={columnas}>Gastos</FilaSeccion>
          {hoja.gastos.length === 0 && <FilaVacia columnas={columnas} texto="Aún no hay categorías de gasto." />}
          {hoja.gastos.map((f) => (
            <FilaConcepto key={f.clave} fila={f} onGuardar={onGuardarCelda} />
          ))}
          {hoja.resultados.map((b) => (
            <BloqueFilasResultado key={b.titulo} bloque={b} columnas={columnas} onGuardar={onGuardarResultado} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaSeccion({ columnas, children }: { columnas: number; children: ReactNode }) {
  return (
    <tr>
      <td style={e.seccion}>{children}</td>
      <td colSpan={columnas - 1} style={{ borderBottom: LINEA }} />
    </tr>
  );
}

function FilaVacia({ columnas, texto }: { columnas: number; texto: string }) {
  return (
    <tr>
      <td colSpan={columnas} className="estado-vacio">
        {texto} Créalas en Categorías.
      </td>
    </tr>
  );
}

function FilaConcepto({
  fila,
  onGuardar,
}: {
  fila: FilaHoja;
  onGuardar: PropsTablaHojaAnual['onGuardarCelda'];
}) {
  const negrita = fila.esSubtotal ? { fontWeight: 600, background: 'var(--color-hover-suave)' } : {};
  return (
    <tr>
      <td
        style={{ ...e.concepto, ...negrita, paddingLeft: fila.nivel === 1 ? 30 : 14 }}
        title={fila.nombre}
      >
        {fila.nombre}
      </td>
      {fila.celdas.map((c, i) =>
        fila.esSubtotal ? (
          <td key={i} style={{ ...e.cifra, ...negrita }}>
            <Cifra valor={c.valor} />
          </td>
        ) : (
          <CeldaEditable key={i} celda={c} onGuardar={(valor, formula) => onGuardar(fila, i, valor, formula)} />
        )
      )}
      <td style={{ ...e.total, ...negrita }}>
        <Cifra valor={fila.total} />
      </td>
      <td style={{ ...e.extra, ...negrita }}>
        <Porcentaje valor={fila.porcentaje} />
      </td>
      <td style={{ ...e.extra, ...negrita }}>
        <Cifra valor={fila.mensualizado} />
      </td>
    </tr>
  );
}

/** Texto con el que se abre una celda al editarla: su fórmula si la tiene, si no el número. */
function textoInicial(celda: Pick<CeldaHoja, 'valor' | 'formula'>): string {
  if (celda.formula) return celda.formula;
  if (!celda.valor) return '';
  return String(Math.round(celda.valor * 100) / 100).replace('.', ',');
}

function CeldaEditable({
  celda,
  onGuardar,
  noEditableMotivo,
}: {
  celda: Pick<CeldaHoja, 'valor' | 'formula' | 'cantidadMovimientos'>;
  onGuardar: (valor: number | null, formula: string | null) => Promise<void>;
  noEditableMotivo?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(textoInicial(celda));
  const [guardando, setGuardando] = useState(false);
  const [errorCelda, setErrorCelda] = useState<string | null>(null);

  useEffect(() => {
    if (!editando) setTexto(textoInicial(celda));
  }, [celda.valor, celda.formula, editando]); // eslint-disable-line react-hooks/exhaustive-deps

  const varios = celda.cantidadMovimientos > 1;
  if (varios || noEditableMotivo) {
    return (
      <td
        style={{ ...e.cifra, color: 'var(--color-text-muted)' }}
        title={noEditableMotivo ?? `${celda.cantidadMovimientos} movimientos este mes: edítalos desde Movimientos`}
      >
        <Cifra valor={celda.valor} />
        {varios && '*'}
      </td>
    );
  }

  async function confirmar() {
    setEditando(false);
    let resultado;
    try {
      resultado = evaluarEntradaCelda(texto);
    } catch (err) {
      setErrorCelda(err instanceof Error ? err.message : 'Valor no válido');
      return;
    }
    setErrorCelda(null);
    const nuevoValor = resultado?.valor ?? null;
    const nuevaFormula = resultado?.formula ?? null;
    const sinCambios = (nuevoValor ?? 0) === Math.round(celda.valor * 100) / 100 && nuevaFormula === (celda.formula ?? null);
    if (sinCambios) return;
    setGuardando(true);
    try {
      await onGuardar(nuevoValor, nuevaFormula);
    } finally {
      setGuardando(false);
    }
  }

  if (editando) {
    return (
      <td style={{ ...e.cifra, padding: '1px 2px' }}>
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={(ev) => setTexto(ev.target.value)}
          onFocus={(ev) => ev.target.select()}
          onBlur={confirmar}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
            if (ev.key === 'Escape') {
              setTexto(textoInicial(celda));
              setEditando(false);
            }
          }}
          className="campo-texto"
          style={{ width: 96, padding: '3px 5px', textAlign: 'right', fontSize: 12.5 }}
        />
      </td>
    );
  }

  return (
    <td
      onClick={() => !guardando && setEditando(true)}
      style={{
        ...e.cifra,
        cursor: guardando ? 'default' : 'cell',
        opacity: guardando ? 0.5 : 1,
        outline: errorCelda ? '1px solid var(--color-red-text)' : undefined,
      }}
      title={errorCelda ?? (guardando ? 'Guardando…' : celda.formula ? `Fórmula: ${celda.formula}` : 'Clic para editar. Admite fórmulas: =100+50')}
    >
      <Cifra valor={celda.valor} />
      {celda.formula && <span aria-hidden style={{ color: 'var(--color-accent)', fontSize: 9, verticalAlign: 'super' }}>ƒ</span>}
    </td>
  );
}

function BloqueFilasResultado({
  bloque,
  columnas,
  onGuardar,
}: {
  bloque: BloqueResultados;
  columnas: number;
  onGuardar: PropsTablaHojaAnual['onGuardarResultado'];
}) {
  return (
    <>
      <FilaSeccion columnas={columnas}>{bloque.titulo}</FilaSeccion>
      {bloque.filas.map((f) => {
        const estiloFila = f.destacada ? { fontWeight: 600 } : {};
        return (
          <tr key={f.clave}>
            <td style={{ ...e.concepto, ...estiloFila }} title={f.nombre}>
              {f.nombre}
            </td>
            {f.valores.map((v, i) => {
              if (f.editable && (f.editable !== 'saldoInicial' || i === 0)) {
                const campo = f.editable;
                return (
                  <CeldaEditable
                    key={i}
                    celda={{ valor: v ?? 0, formula: null, cantidadMovimientos: 0 }}
                    onGuardar={(valor) => onGuardar(campo, i, valor)}
                  />
                );
              }
              return (
                <td key={i} style={{ ...e.cifra, ...estiloFila }}>
                  {f.formato === 'porcentaje' ? <Porcentaje valor={v} /> : <Cifra valor={v} />}
                </td>
              );
            })}
            <td style={{ ...e.total, ...estiloFila }}>
              {f.formato === 'porcentaje' ? <Porcentaje valor={f.total} /> : <Cifra valor={f.total} />}
            </td>
            <td style={e.extra} />
            <td style={e.extra}>{f.mensualizado === null ? null : <Cifra valor={f.mensualizado} />}</td>
          </tr>
        );
      })}
    </>
  );
}
