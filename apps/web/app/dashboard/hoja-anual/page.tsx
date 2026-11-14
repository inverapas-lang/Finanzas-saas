'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEspacioActivoContext } from '../../../lib/contexto-espacio-activo';
import { TablaHojaAnual } from '../../../components/TablaHojaAnual';
import {
  CONFIG_HOJA_VACIA,
  calcularHojaAnual,
  normalizarConfigHoja,
  type CategoriaHoja,
  type ConfigHojaAnual,
  type FilaHoja,
  type FilaResultado,
  type MovimientoHoja,
} from '../../../lib/hoja-anual';

interface Datos {
  categorias: CategoriaHoja[];
  ingresos: MovimientoHoja[];
  gastos: MovimientoHoja[];
  ingresosDiciembreAnterior: number;
  /** null = este año aún no tiene configuración guardada. */
  configGuardada: ConfigHojaAnual | null;
}

/**
 * Sugerencia para un año sin configuración guardada, a partir del nombre
 * de las categorías. Solo es un punto de partida: el usuario la confirma o
 * la cambia en "Filas de resultados" y entonces se guarda.
 */
function sugerirConfig(categorias: CategoriaHoja[]): ConfigHojaAnual {
  const ids = (tipo: 'ingreso' | 'gasto', patron: RegExp) =>
    categorias.filter((c) => c.tipo === tipo && patron.test(c.nombre)).map((c) => c.id);
  return {
    ...CONFIG_HOJA_VACIA,
    categoriasAmortizacion: ids('gasto', /amortizaci/i),
    categoriasIngresosSinTrabajo: ids('ingreso', /piso|alquiler|dividend/i),
    categoriasGastosSinTrabajo: ids('gasto', /piso|hipoteca/i),
  };
}

export default function PaginaHojaAnual() {
  const { token, espacio, error: errorEspacio } = useEspacioActivoContext();
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verConfig, setVerConfig] = useState(false);

  const espacioIdVigente = useRef<string | null>(null);
  const anioVigente = useRef(anio);
  useEffect(() => {
    espacioIdVigente.current = espacio?.id ?? null;
  }, [espacio]);
  useEffect(() => {
    anioVigente.current = anio;
  }, [anio]);

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!token || !espacio) return;
      const espacioId = espacio.id;
      const anioConsultado = anio;
      if (!silencioso) setCargando(true);
      setError(null);
      const headers = { Authorization: `Bearer ${token}` };
      // Desde diciembre del año anterior: sus ingresos son el "ingresos fin
      // mes anterior" de enero en el bloque de saldos.
      const rango = `desde=${anioConsultado - 1}-12-01&hasta=${anioConsultado}-12-31`;
      try {
        const respuestas = await Promise.all([
          fetch(`/api/categorias?espacio_id=${espacioId}`, { headers }),
          fetch(`/api/ingresos?espacio_id=${espacioId}&${rango}`, { headers }),
          fetch(`/api/gastos?espacio_id=${espacioId}&${rango}`, { headers }),
          fetch(`/api/hoja-anual-config?espacio_id=${espacioId}&anio=${anioConsultado}`, { headers }),
        ]);
        if (respuestas.some((r) => !r.ok)) throw new Error('No se han podido cargar los datos de la hoja.');
        const [cats, ings, gas, conf] = await Promise.all(respuestas.map((r) => r.json()));
        if (espacioIdVigente.current !== espacioId || anioVigente.current !== anioConsultado) return;

        const categorias: CategoriaHoja[] = cats.data ?? [];
        const todosIngresos: MovimientoHoja[] = ings.data ?? [];
        const deEsteAnio = (m: MovimientoHoja) => m.fecha_prevista.startsWith(`${anioConsultado}-`);
        const ingresosDiciembreAnterior = todosIngresos
          .filter((m) => m.fecha_prevista.startsWith(`${anioConsultado - 1}-12`))
          .reduce((acc, m) => acc + Number(m.importe_real ?? m.importe_esperado ?? 0), 0);
        setDatos({
          categorias,
          ingresos: todosIngresos.filter(deEsteAnio),
          gastos: (gas.data ?? []).filter(deEsteAnio),
          ingresosDiciembreAnterior,
          configGuardada: conf.data ? normalizarConfigHoja(conf.data, new Set(categorias.map((c) => c.id))) : null,
        });
      } catch (err) {
        if (espacioIdVigente.current === espacioId) {
          setError(err instanceof Error ? err.message : 'Error al cargar la hoja.');
        }
      } finally {
        if (espacioIdVigente.current === espacioId && anioVigente.current === anioConsultado) setCargando(false);
      }
    },
    [token, espacio, anio]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const config = useMemo(
    () => (datos ? datos.configGuardada ?? sugerirConfig(datos.categorias) : CONFIG_HOJA_VACIA),
    [datos]
  );

  const hoja = useMemo(
    () =>
      datos
        ? calcularHojaAnual({
            anio,
            categorias: datos.categorias,
            ingresos: datos.ingresos,
            gastos: datos.gastos,
            ingresosDiciembreAnterior: datos.ingresosDiciembreAnterior,
            config,
          })
        : null,
    [datos, anio, config]
  );

  async function guardarConfig(nueva: ConfigHojaAnual) {
    if (!token || !espacio) return;
    const respuesta = await fetch('/api/hoja-anual-config', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ espacio_id: espacio.id, anio, configuracion: nueva }),
    });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se ha podido guardar la configuración.');
    setDatos((d) => (d ? { ...d, configGuardada: nueva } : d));
  }

  async function guardarCelda(fila: FilaHoja, indiceMes: number, valor: number | null, formula: string | null) {
    if (!token || !espacio) return;
    const celda = fila.celdas[indiceMes];
    if (celda.cantidadMovimientos > 1) return;
    const tabla = fila.tipo === 'ingreso' ? 'ingresos' : 'gastos';
    const campoImporte = fila.tipo === 'ingreso' ? 'importe_esperado' : 'importe_previsto';
    const campoConfirmacion = fila.tipo === 'ingreso' ? 'fecha_cobrada' : 'fecha_pagada';
    // En la hoja los gastos van en negativo; en la base de datos un gasto
    // es positivo (y una devolución, negativa).
    const importe = valor === null ? null : fila.tipo === 'gasto' ? -valor : valor;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const mes = `${anio}-${String(indiceMes + 1).padStart(2, '0')}`;

    setError(null);
    try {
      let respuesta: Response | null = null;
      if (celda.movimientoId) {
        respuesta =
          importe === null
            ? await fetch(`/api/${tabla}/${celda.movimientoId}`, { method: 'DELETE', headers })
            : await fetch(`/api/${tabla}/${celda.movimientoId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ [campoImporte]: importe, importe_real: importe, formula }),
              });
      } else if (importe !== null) {
        respuesta = await fetch(`/api/${tabla}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            espacio_id: espacio.id,
            categoria_id: fila.categoriaId,
            descripcion: `${fila.nombre} — ${mes}`,
            [campoImporte]: importe,
            importe_real: importe,
            fecha_prevista: `${mes}-01`,
            [campoConfirmacion]: `${mes}-01`,
            formula,
          }),
        });
      }
      if (respuesta && !respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}));
        throw new Error(cuerpo.error ?? 'No se ha podido guardar la celda.');
      }
      await cargar(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    }
  }

  async function guardarResultado(campo: NonNullable<FilaResultado['editable']>, indiceMes: number, valor: number | null) {
    const mes = `${anio}-${String(indiceMes + 1).padStart(2, '0')}`;
    let nueva: ConfigHojaAnual;
    if (campo === 'saldoInicial') {
      nueva = { ...config, saldoInicial: valor };
    } else {
      const porMes = { ...config[campo] };
      if (valor === null || valor === 0) delete porMes[mes];
      else porMes[mes] = valor;
      nueva = { ...config, [campo]: porMes };
    }
    setError(null);
    try {
      await guardarConfig(nueva);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    }
  }

  return (
    <main className="contenido" style={{ maxWidth: 1700 }}>
      <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Hoja anual</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Ingresos y gastos del año mes a mes, como en tu Excel. Haz clic en una celda para cambiarla; admite fórmulas
            (<code>=100+50</code>).
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="enlace-discreto" onClick={() => setAnio((a) => a - 1)}>
            ← {anio - 1}
          </button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{anio}</span>
          <button className="enlace-discreto" onClick={() => setAnio((a) => a + 1)}>
            {anio + 1} →
          </button>
          <button className="boton-secundario" onClick={() => setVerConfig((v) => !v)}>
            {verConfig ? 'Cerrar ajustes' : 'Filas de resultados'}
          </button>
        </div>
      </header>

      {(errorEspacio || error) && (
        <p className="mensaje-error" style={{ marginBottom: 16 }}>
          {errorEspacio || error}
        </p>
      )}

      {verConfig && datos && (
        <PanelConfig
          categorias={datos.categorias}
          config={config}
          esSugerencia={datos.configGuardada === null}
          onGuardar={async (c) => {
            setError(null);
            try {
              await guardarConfig(c);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Error al guardar.');
            }
          }}
        />
      )}

      <div className="tarjeta" style={{ padding: 0 }}>
        {cargando || !hoja ? (
          <p className="estado-vacio">Cargando…</p>
        ) : (
          <TablaHojaAnual anio={anio} hoja={hoja} onGuardarCelda={guardarCelda} onGuardarResultado={guardarResultado} />
        )}
      </div>
      <p className="texto-ayuda" style={{ fontSize: 12, marginTop: 8 }}>
        ƒ: la celda tiene una fórmula. *: hay varios movimientos ese mes; edítalos desde Movimientos. El % de un gasto es sobre
        los gastos sin amortizaciones anticipadas, y el de un ingreso sobre el total de ingresos.
      </p>
    </main>
  );
}

function PanelConfig({
  categorias,
  config,
  esSugerencia,
  onGuardar,
}: {
  categorias: CategoriaHoja[];
  config: ConfigHojaAnual;
  esSugerencia: boolean;
  onGuardar: (c: ConfigHojaAnual) => Promise<void>;
}) {
  const [borrador, setBorrador] = useState(config);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setBorrador(config), [config]);

  type Lista = 'categoriasAmortizacion' | 'categoriasIngresosSinTrabajo' | 'categoriasGastosSinTrabajo';
  const alternar = (lista: Lista, id: string) =>
    setBorrador((b) => ({
      ...b,
      [lista]: b[lista].includes(id) ? b[lista].filter((x) => x !== id) : [...b[lista], id],
    }));

  const listas: { lista: Lista; tipo: 'ingreso' | 'gasto'; titulo: string; ayuda: string }[] = [
    {
      lista: 'categoriasAmortizacion',
      tipo: 'gasto',
      titulo: 'Amortizaciones anticipadas',
      ayuda: 'Se restan en "Gastos sin amortizaciones anticipadas" y no cuentan en el % de los gastos.',
    },
    {
      lista: 'categoriasIngresosSinTrabajo',
      tipo: 'ingreso',
      titulo: 'Ingresos sin trabajo',
      ayuda: 'Alquileres, dividendos… los que no vienen de la nómina.',
    },
    {
      lista: 'categoriasGastosSinTrabajo',
      tipo: 'gasto',
      titulo: 'Gastos de esos ingresos',
      ayuda: 'Gastos, seguros e hipotecas de los pisos: se restan para calcular los ingresos netos sin trabajo.',
    },
  ];

  return (
    <div className="tarjeta" style={{ marginBottom: 16 }}>
      <p style={{ marginTop: 0, fontWeight: 600 }}>Qué categorías entran en cada fila de resultados</p>
      {esSugerencia && (
        <p className="texto-ayuda" style={{ marginTop: 0 }}>
          Es una propuesta a partir de los nombres de tus categorías; revísala y guárdala.
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {listas.map(({ lista, tipo, titulo, ayuda }) => {
          const propias = categorias.filter((c) => c.tipo === tipo);
          const raices = propias.filter((c) => !c.categoria_padre_id || !propias.some((p) => p.id === c.categoria_padre_id));
          return (
            <div key={lista}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{titulo}</div>
              <div className="texto-ayuda" style={{ fontSize: 12, marginBottom: 6 }}>
                {ayuda}
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 6, padding: 6 }}>
                {raices.map((r) => (
                  <div key={r.id}>
                    <Casilla etiqueta={r.nombre} marcada={borrador[lista].includes(r.id)} onCambio={() => alternar(lista, r.id)} />
                    {propias
                      .filter((h) => h.categoria_padre_id === r.id)
                      .map((h) => (
                        <div key={h.id} style={{ paddingLeft: 18 }}>
                          <Casilla
                            etiqueta={h.nombre}
                            marcada={borrador[lista].includes(h.id) || borrador[lista].includes(r.id)}
                            deshabilitada={borrador[lista].includes(r.id)}
                            onCambio={() => alternar(lista, h.id)}
                          />
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <button
        className="boton-primario"
        style={{ marginTop: 12 }}
        disabled={guardando}
        onClick={async () => {
          setGuardando(true);
          try {
            await onGuardar(borrador);
          } finally {
            setGuardando(false);
          }
        }}
      >
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}

function Casilla({
  etiqueta,
  marcada,
  deshabilitada,
  onCambio,
}: {
  etiqueta: string;
  marcada: boolean;
  deshabilitada?: boolean;
  onCambio: () => void;
}) {
  return (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, padding: '2px 0', opacity: deshabilitada ? 0.6 : 1 }}>
      <input type="checkbox" checked={marcada} disabled={deshabilitada} onChange={onCambio} />
      {etiqueta}
    </label>
  );
}
