'use client';

import { useState } from 'react';

export interface SerieGrafico {
  nombre: string;
  color: string;
  valores: number[];
}

interface Props {
  etiquetas: string[];
  series: SerieGrafico[];
  tipo: 'barras' | 'lineas';
  formatearValor: (v: number) => string;
  alto?: number;
}

/**
 * Gráfico de barras/líneas en SVG puro, sin librería externa — evita
 * arrastrar una dependencia de charting (con su propio riesgo de
 * compatibilidad con React 19) para lo que aquí es simplemente barras y
 * líneas sobre un eje temporal o categórico. Suficiente para los
 * "gráficos a demanda" del panel; si el proyecto necesita en el futuro
 * gráficos más sofisticados (zoom, tooltips ricos…), ahí sí compensaría
 * evaluar una librería.
 */
export function GraficoSVG({ etiquetas, series, tipo, formatearValor, alto = 280 }: Props) {
  const [puntoActivo, setPuntoActivo] = useState<{ serie: number; indice: number } | null>(null);

  const ANCHO = 720;
  const MARGEN = { arriba: 16, abajo: 32, izquierda: 12, derecha: 12 };
  const altoUtil = alto - MARGEN.arriba - MARGEN.abajo;
  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;

  const todosLosValores = series.flatMap((s) => s.valores);
  const maximo = Math.max(0, ...todosLosValores);
  const minimo = Math.min(0, ...todosLosValores);
  const rango = maximo - minimo || 1;

  function y(valor: number): number {
    return MARGEN.arriba + altoUtil - ((valor - minimo) / rango) * altoUtil;
  }

  const yCero = y(0);
  const anchoGrupo = anchoUtil / Math.max(1, etiquetas.length);

  if (etiquetas.length === 0 || series.every((s) => s.valores.length === 0)) {
    return <p className="estado-vacio">No hay datos para el rango y la métrica seleccionados.</p>;
  }

  return (
    <div>
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} width="100%" height={alto} role="img" aria-label="Gráfico">
        <line
          x1={MARGEN.izquierda}
          y1={yCero}
          x2={ANCHO - MARGEN.derecha}
          y2={yCero}
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {tipo === 'barras' &&
          series.map((serie, serieIdx) =>
            serie.valores.map((valor, i) => {
              const anchoBarra = (anchoGrupo * 0.7) / series.length;
              const xGrupo = MARGEN.izquierda + i * anchoGrupo + anchoGrupo * 0.15;
              const x = xGrupo + serieIdx * anchoBarra;
              const yValor = y(valor);
              const alturaBarra = Math.abs(yValor - yCero);
              return (
                <rect
                  key={`${serieIdx}-${i}`}
                  x={x}
                  y={Math.min(yValor, yCero)}
                  width={Math.max(1, anchoBarra - 2)}
                  height={Math.max(0, alturaBarra)}
                  fill={serie.color}
                  opacity={puntoActivo && (puntoActivo.serie !== serieIdx || puntoActivo.indice !== i) ? 0.55 : 1}
                  onMouseEnter={() => setPuntoActivo({ serie: serieIdx, indice: i })}
                  onMouseLeave={() => setPuntoActivo(null)}
                />
              );
            })
          )}

        {tipo === 'lineas' &&
          series.map((serie, serieIdx) => {
            const puntos = serie.valores
              .map((valor, i) => `${MARGEN.izquierda + i * anchoGrupo + anchoGrupo / 2},${y(valor)}`)
              .join(' ');
            return (
              <g key={serieIdx}>
                <polyline points={puntos} fill="none" stroke={serie.color} strokeWidth={2} />
                {serie.valores.map((valor, i) => (
                  <circle
                    key={i}
                    cx={MARGEN.izquierda + i * anchoGrupo + anchoGrupo / 2}
                    cy={y(valor)}
                    r={puntoActivo?.serie === serieIdx && puntoActivo.indice === i ? 5 : 3}
                    fill={serie.color}
                    onMouseEnter={() => setPuntoActivo({ serie: serieIdx, indice: i })}
                    onMouseLeave={() => setPuntoActivo(null)}
                  />
                ))}
              </g>
            );
          })}

        {etiquetas.map((etiqueta, i) => (
          <text
            key={i}
            x={MARGEN.izquierda + i * anchoGrupo + anchoGrupo / 2}
            y={alto - 10}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-text-muted)"
          >
            {etiqueta}
          </text>
        ))}
      </svg>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
        {series.map((serie, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: serie.color, display: 'inline-block' }} />
            {serie.nombre}
          </span>
        ))}
      </div>

      {puntoActivo && (
        <p className="texto-ayuda" style={{ marginTop: 6, fontSize: 12 }}>
          <strong>{series[puntoActivo.serie].nombre}</strong> · {etiquetas[puntoActivo.indice]}:{' '}
          {formatearValor(series[puntoActivo.serie].valores[puntoActivo.indice])}
        </p>
      )}
    </div>
  );
}
