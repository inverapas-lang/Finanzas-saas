import type { CSSProperties } from 'react';
import { agruparMesesPorAnio, formatearMesCorto } from '../lib/formato';

/**
 * Cabecera y estilos comunes de las tablas concepto × mes (Informes y la
 * vista anual de Movimientos). El año va una sola vez, grande, encima de
 * sus meses; cada columna lleva solo el mes. Las cifras van sin "€" (se
 * indica en la cabecera) y con dígitos de ancho fijo para que el año
 * completo y su total quepan de un vistazo y se lean en columna.
 */

const FONDO = 'var(--color-bg)';
// Con border-collapse: separate (necesario para que las celdas fijas no
// pierdan el borde al desplazar) las líneas van en las celdas, no en <tr>.
const LINEA = '1px solid var(--color-border)';

export const ESTILOS_TABLA_MESES = {
  /** Para las celdas de la fila de totales del pie. */
  pie: { fontWeight: 600, borderTop: '2px solid var(--color-border)', borderBottom: 'none' } satisfies CSSProperties,
  tabla: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    fontSize: 12.5,
    fontVariantNumeric: 'tabular-nums',
  } satisfies CSSProperties,
  concepto: {
    padding: '6px 8px 6px 14px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 160,
    position: 'sticky',
    left: 0,
    background: FONDO,
    borderBottom: LINEA,
    zIndex: 1,
  } satisfies CSSProperties,
  cifra: {
    padding: '6px 5px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderBottom: LINEA,
  } satisfies CSSProperties,
  total: {
    padding: '6px 12px 6px 8px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    fontWeight: 600,
    position: 'sticky',
    right: 0,
    background: FONDO,
    borderLeft: LINEA,
    borderBottom: LINEA,
    zIndex: 1,
  } satisfies CSSProperties,
};

const cabecera: CSSProperties = {
  color: 'var(--color-text-muted)',
  fontWeight: 500,
  borderBottom: '1px solid var(--color-border)',
};

export function CabeceraTablaMeses({ meses }: { meses: string[] }) {
  const grupos = agruparMesesPorAnio(meses);
  const unSoloAnio = grupos.length === 1;

  return (
    <thead>
      <tr>
        <th rowSpan={2} style={{ ...ESTILOS_TABLA_MESES.concepto, ...cabecera, verticalAlign: 'bottom', zIndex: 2 }}>
          Concepto
          <div style={{ fontSize: 11, fontWeight: 400 }}>Importes en €</div>
        </th>
        {grupos.map((g, i) => (
          <th
            key={g.anio}
            colSpan={g.meses.length}
            style={{
              padding: '8px 8px 2px',
              textAlign: 'center',
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--color-text)',
              borderLeft: i > 0 ? '1px solid var(--color-border)' : undefined,
            }}
          >
            {g.anio}
          </th>
        ))}
        <th
          rowSpan={2}
          style={{ ...ESTILOS_TABLA_MESES.total, ...cabecera, color: 'var(--color-text)', verticalAlign: 'bottom', zIndex: 2 }}
        >
          {unSoloAnio ? `Total ${grupos[0].anio}` : 'Total'}
        </th>
      </tr>
      <tr>
        {grupos.flatMap((g, i) =>
          g.meses.map((mes, j) => (
            <th
              key={mes}
              style={{
                ...ESTILOS_TABLA_MESES.cifra,
                ...cabecera,
                borderLeft: i > 0 && j === 0 ? '1px solid var(--color-border)' : undefined,
              }}
            >
              {formatearMesCorto(mes)}
            </th>
          ))
        )}
      </tr>
    </thead>
  );
}
