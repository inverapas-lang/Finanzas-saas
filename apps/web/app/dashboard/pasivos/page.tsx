'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { formatearMoneda, formatearPorcentaje, formatearFecha } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { Adjuntos } from '../../../components/Adjuntos';

interface Espacio {
  id: string;
  nombre: string;
}

type TipoPasivo = 'hipoteca' | 'prestamo_personal' | 'prestamo_vehiculo' | 'deuda_tarjeta' | 'otro';
type TipoTasa = 'fijo' | 'variable' | 'mixto';
type Indicador = 'euribor_3m' | 'euribor_6m' | 'euribor_12m' | 'otro' | 'ninguno';

interface Pasivo {
  id: string;
  tipo: TipoPasivo;
  nombre: string;
  capital_inicial: number;
  capital_pendiente: number;
  moneda: string;
  tipo_interes_anual: number;
  cuota: number;
  plazo_meses: number;
  fecha_inicio: string;
  tipo_tasa: TipoTasa | null;
  indicador_referencia: Indicador;
  diferencial: number | null;
  meses_tramo_fijo: number | null;
}

const ETIQUETAS_TIPO: Record<TipoPasivo, string> = {
  hipoteca: 'Hipoteca',
  prestamo_personal: 'Préstamo personal',
  prestamo_vehiculo: 'Préstamo de vehículo',
  deuda_tarjeta: 'Deuda de tarjeta',
  otro: 'Otro',
};

const ETIQUETAS_INDICADOR: Record<Indicador, string> = {
  euribor_3m: 'Euríbor 3 meses',
  euribor_6m: 'Euríbor 6 meses',
  euribor_12m: 'Euríbor 12 meses',
  otro: 'Otro índice',
  ninguno: 'Sin índice (tipo fijo)',
};

export default function PaginaPasivos() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [pasivos, setPasivos] = useState<Pasivo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarPasivos = useCallback(async (accessToken: string, espacioId: string) => {
    const respuesta = await fetch(`/api/pasivos?espacio_id=${espacioId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) throw new Error('No se han podido cargar los préstamos/hipotecas.');
    const cuerpo = await respuesta.json();
    setPasivos(cuerpo.data ?? []);
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
        await cargarPasivos(sesion.session.access_token, primerEspacio.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        setCargandoSesion(false);
      }
    }

    inicializar();
  }, [router, cargarPasivos]);

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (cargandoSesion) {
    return (
      <main className="pantalla-centrada">
        <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  return (
    <div className="app-layout">
      <BarraLateral nombreEspacio={espacio?.nombre ?? 'Finanzas'} onCerrarSesion={cerrarSesion} espacioId={espacio?.id} token={token ?? undefined} />
      <main className="contenido" style={{ maxWidth: 880, padding: '40px 48px' }}>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Préstamos e hipotecas</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            El cuadro de amortización se genera automáticamente al crear o revisar un préstamo.
          </p>
        </header>

        {error && (
          <p className="mensaje-error" style={{ marginBottom: 24 }}>
            {error}
          </p>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {pasivos.length === 0 ? (
              <div className="tarjeta">
                <p className="estado-vacio">
                  Aún no hay préstamos ni hipotecas aquí. Añade el primero con el formulario de la derecha.
                </p>
              </div>
            ) : (
              pasivos.map((pasivo) =>
                token && espacio ? (
                  <TarjetaPasivo
                    key={pasivo.id}
                    pasivo={pasivo}
                    token={token}
                    espacioId={espacio.id}
                    onCambio={() => cargarPasivos(token, espacio.id)}
                  />
                ) : null
              )
            )}
          </div>

          {token && espacio && (
            <FormularioCrearPasivo
              token={token}
              espacioId={espacio.id}
              onCreado={() => cargarPasivos(token, espacio.id)}
            />
          )}
        </section>
      </main>
    </div>
  );
}

interface FilaCuadro {
  numero_cuota: number;
  fecha: string;
  cuota: number;
  capital: number;
  intereses: number;
  capital_pendiente: number;
  es_amortizacion_extra: boolean;
}

interface AmortizacionExtraReal {
  id: string;
  numero_cuota: number;
  fecha: string;
  importe: number;
  estrategia: 'reducir_cuota' | 'reducir_plazo';
}

const FILAS_POR_PAGINA = 12;

function TablaCuadro({ filas }: { filas: FilaCuadro[] }) {
  const [pagina, setPagina] = useState(0);

  if (filas.length === 0) {
    return <p className="texto-ayuda" style={{ marginTop: 12 }}>Este préstamo todavía no tiene cuadro generado.</p>;
  }

  const totalPaginas = Math.ceil(filas.length / FILAS_POR_PAGINA);
  const filasVisibles = filas.slice(pagina * FILAS_POR_PAGINA, (pagina + 1) * FILAS_POR_PAGINA);

  return (
    <div style={{ marginTop: 16, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
      <table className="tabla-filas-hover" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={estiloCelda('left')}>Cuota</th>
            <th style={estiloCelda('left')}>Fecha</th>
            <th style={estiloCelda('right')}>Capital</th>
            <th style={estiloCelda('right')}>Intereses</th>
            <th style={estiloCelda('right')}>Cuota</th>
            <th style={estiloCelda('right')}>Pendiente</th>
          </tr>
        </thead>
        <tbody>
          {filasVisibles.map((fila, i) => (
            <tr
              key={`${fila.numero_cuota}-${fila.es_amortizacion_extra}`}
              style={{
                borderBottom: i < filasVisibles.length - 1 ? '1px solid var(--color-border)' : 'none',
                background: fila.es_amortizacion_extra ? 'var(--color-green-bg)' : 'transparent',
              }}
            >
              <td style={estiloCelda('left')}>
                {fila.numero_cuota}
                {fila.es_amortizacion_extra && ' (extra)'}
              </td>
              <td style={estiloCelda('left')}>{formatearFecha(fila.fecha)}</td>
              <td className="cifra" style={estiloCelda('right')}>{formatearMoneda(fila.capital)}</td>
              <td className="cifra" style={estiloCelda('right')}>{formatearMoneda(fila.intereses)}</td>
              <td className="cifra" style={estiloCelda('right')}>{formatearMoneda(fila.cuota)}</td>
              <td className="cifra" style={estiloCelda('right')}>{formatearMoneda(fila.capital_pendiente)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPaginas > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
          <button
            className="boton-secundario"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            ← Anterior
          </button>
          <span className="texto-ayuda">
            Página {pagina + 1} de {totalPaginas}
          </span>
          <button
            className="boton-secundario"
            disabled={pagina >= totalPaginas - 1}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

function estiloCelda(alineacion: 'left' | 'right'): React.CSSProperties {
  return { padding: '8px 12px', textAlign: alineacion };
}

function TarjetaPasivo({
  pasivo,
  token,
  espacioId,
  onCambio,
}: {
  pasivo: Pasivo;
  token: string;
  espacioId: string;
  onCambio: () => void;
}) {
  const [mostrarRevision, setMostrarRevision] = useState(false);
  const [mostrarCuadro, setMostrarCuadro] = useState(false);
  const [mostrarSimulador, setMostrarSimulador] = useState(false);
  const [cuadro, setCuadro] = useState<FilaCuadro[] | null>(null);
  const [amortizacionesReales, setAmortizacionesReales] = useState<AmortizacionExtraReal[] | null>(null);

  const cargarDatosPasivo = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const [resCuadro, resExtra] = await Promise.all([
      fetch(`/api/pasivos/${pasivo.id}/cuadro`, { headers }),
      fetch(`/api/pasivos/${pasivo.id}/amortizaciones-extra`, { headers }),
    ]);
    if (resCuadro.ok) setCuadro((await resCuadro.json()).data ?? []);
    if (resExtra.ok) setAmortizacionesReales((await resExtra.json()).data ?? []);
  }, [pasivo.id, token]);

  useEffect(() => {
    cargarDatosPasivo();
  }, [cargarDatosPasivo]);

  const hoy = new Date().toISOString().slice(0, 10);
  const amortizadoHastaHoy =
    cuadro?.filter((f) => f.fecha <= hoy).reduce((acc, f) => acc + f.capital, 0) ?? null;

  async function recargarTodoTrasConfirmar() {
    await cargarDatosPasivo();
    onCambio();
  }

  return (
    <div className="tarjeta tarjeta-interactiva">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{pasivo.nombre}</p>
          <p className="texto-ayuda" style={{ margin: '2px 0 0' }}>
            {ETIQUETAS_TIPO[pasivo.tipo]}
            {pasivo.tipo === 'hipoteca' && pasivo.tipo_tasa
              ? ` · ${pasivo.tipo_tasa} · ${ETIQUETAS_INDICADOR[pasivo.indicador_referencia]}`
              : ''}
          </p>
        </div>
        <p className="cifra" style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          {formatearPorcentaje(pasivo.tipo_interes_anual)}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="etiqueta-mayus" style={{ margin: '0 0 2px' }}>Capital pendiente</p>
          <p className="cifra" style={{ margin: 0, fontSize: 16 }}>{formatearMoneda(pasivo.capital_pendiente)}</p>
        </div>
        <div>
          <p className="etiqueta-mayus" style={{ margin: '0 0 2px' }}>Cuota</p>
          <p className="cifra" style={{ margin: 0, fontSize: 16 }}>{formatearMoneda(pasivo.cuota)}</p>
        </div>
        <div>
          <p className="etiqueta-mayus" style={{ margin: '0 0 2px' }}>Amortizado hasta hoy</p>
          <p className="cifra cifra-positiva" style={{ margin: 0, fontSize: 16 }}>
            {amortizadoHastaHoy === null ? '—' : formatearMoneda(amortizadoHastaHoy)}
          </p>
        </div>
      </div>
      <p className="texto-ayuda" style={{ margin: '4px 0 0', fontSize: 11 }}>
        Estimado según el calendario, no un extracto verificado con tu banco.
      </p>

      {amortizacionesReales !== null && amortizacionesReales.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p className="etiqueta-mayus" style={{ margin: '0 0 4px' }}>Amortizaciones extra registradas</p>
          {amortizacionesReales.map((a) => (
            <p key={a.id} className="texto-ayuda" style={{ margin: '2px 0' }}>
              {formatearFecha(a.fecha)} · cuota {a.numero_cuota} · {formatearMoneda(a.importe)} ·{' '}
              {a.estrategia === 'reducir_cuota' ? 'redujo cuota' : 'redujo plazo'}
            </p>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="enlace-discreto" onClick={() => setMostrarCuadro((v) => !v)}>
          {mostrarCuadro ? 'Ocultar cuadro de amortización' : 'Ver cuadro de amortización'}
        </button>

        <button className="enlace-discreto" onClick={() => setMostrarSimulador((v) => !v)}>
          {mostrarSimulador ? 'Cerrar simulador' : 'Simular amortización o cancelación'}
        </button>

        {pasivo.tipo === 'hipoteca' && pasivo.tipo_tasa !== 'fijo' && (
          <button className="enlace-discreto" onClick={() => setMostrarRevision((v) => !v)}>
            {mostrarRevision ? 'Cancelar' : 'Registrar revisión de tipo'}
          </button>
        )}
      </div>

      {mostrarCuadro && (cuadro === null ? (
        <p className="texto-ayuda" style={{ marginTop: 12 }}>Cargando…</p>
      ) : (
        <TablaCuadro filas={cuadro} />
      ))}

      {mostrarSimulador && (
        <Simulador
          pasivoId={pasivo.id}
          token={token}
          onConfirmado={() => {
            setMostrarSimulador(false);
            recargarTodoTrasConfirmar();
          }}
        />
      )}

      {mostrarRevision && (
        <FormularioRevision
          pasivoId={pasivo.id}
          token={token}
          onGuardado={() => {
            setMostrarRevision(false);
            onCambio();
          }}
        />
      )}

      <Adjuntos espacioId={espacioId} entidadTipo="pasivo" entidadId={pasivo.id} />
    </div>
  );
}

function FormularioRevision({
  pasivoId,
  token,
  onGuardado,
}: {
  pasivoId: string;
  token: string;
  onGuardado: () => void;
}) {
  const [numeroCuota, setNumeroCuota] = useState('');
  const [fecha, setFecha] = useState('');
  const [indicadorValor, setIndicadorValor] = useState('');
  const [diferencial, setDiferencial] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);

    const indicador = Number(indicadorValor) / 100;
    const dif = Number(diferencial) / 100;

    try {
      const respuesta = await fetch(`/api/pasivos/${pasivoId}/revisiones`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero_cuota: Number(numeroCuota),
          fecha,
          indicador_valor: indicador,
          tipo_total_aplicado: indicador + dif,
        }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido registrar la revisión.');
      }
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar la revisión.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      <p className="texto-ayuda" style={{ margin: 0 }}>
        Introduce el valor real publicado del índice ese día — esta app no lo trae de ninguna fuente automática.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ fontSize: 12, flex: 1 }}>
          Nº de cuota
          <input
            required
            type="number"
            min="1"
            value={numeroCuota}
            onChange={(e) => setNumeroCuota(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: 12, flex: 1 }}>
          Fecha
          <input
            required
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 4 }}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ fontSize: 12, flex: 1 }}>
          Índice publicado (%)
          <input
            required
            type="number"
            step="0.001"
            value={indicadorValor}
            onChange={(e) => setIndicadorValor(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 4 }}
            placeholder="ej. 3,35"
          />
        </label>
        <label style={{ fontSize: 12, flex: 1 }}>
          Diferencial (%)
          <input
            required
            type="number"
            step="0.001"
            value={diferencial}
            onChange={(e) => setDiferencial(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 4 }}
            placeholder="ej. 0,99"
          />
        </label>
      </div>
      {error && <p className="mensaje-error">{error}</p>}
      <button type="submit" className="boton-primario" disabled={guardando} style={{ alignSelf: 'flex-start' }}>
        {guardando ? 'Guardando…' : 'Guardar revisión'}
      </button>
    </form>
  );
}

interface ResultadoSimulacion {
  tipo: 'amortizacion_parcial' | 'cancelacion_total';
  numeroCuota: number;
  importeAportado: number;
  cuotaAntes: number;
  cuotaDespues: number | null;
  interesesAhorrados: number;
  mesesAhorrados: number;
}

function Simulador({
  pasivoId,
  token,
  onConfirmado,
}: {
  pasivoId: string;
  token: string;
  onConfirmado: () => void;
}) {
  const [tipo, setTipo] = useState<'amortizacion_parcial' | 'cancelacion_total'>('amortizacion_parcial');
  const [numeroCuota, setNumeroCuota] = useState('');
  const [importe, setImporte] = useState('');
  const [estrategia, setEstrategia] = useState<'reducir_cuota' | 'reducir_plazo'>('reducir_cuota');
  const [resultado, setResultado] = useState<ResultadoSimulacion | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simular(evento: React.FormEvent) {
    evento.preventDefault();
    setCalculando(true);
    setError(null);
    setResultado(null);

    const body: Record<string, unknown> =
      tipo === 'cancelacion_total'
        ? { tipo, numero_cuota: Number(numeroCuota) }
        : { tipo, numero_cuota: Number(numeroCuota), importe: Number(importe), estrategia };

    try {
      const respuesta = await fetch(`/api/pasivos/${pasivoId}/simular`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se ha podido simular.');
      setResultado(cuerpo.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al simular.');
    } finally {
      setCalculando(false);
    }
  }

  async function confirmarDeVerdad() {
    if (!resultado) return;
    setConfirmando(true);
    setError(null);

    try {
      const respuesta = await fetch(`/api/pasivos/${pasivoId}/amortizaciones-extra`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero_cuota: resultado.numeroCuota,
          fecha: new Date().toISOString().slice(0, 10),
          importe: resultado.importeAportado,
          estrategia: tipo === 'cancelacion_total' ? 'reducir_plazo' : estrategia,
        }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido registrar la amortización.');
      }
      onConfirmado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar.');
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
      <p className="texto-ayuda" style={{ margin: '0 0 8px' }}>
        Esto solo calcula — no se guarda nada hasta que pulses "Confirmar y registrar".
      </p>
      <form onSubmit={simular} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 12 }}>
          Tipo de simulación
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
            className="campo-texto"
            style={{ marginTop: 4 }}
          >
            <option value="amortizacion_parcial">Amortización parcial (aportar dinero extra)</option>
            <option value="cancelacion_total">Cancelación total (saldar todo lo pendiente)</option>
          </select>
        </label>

        <label style={{ fontSize: 12 }}>
          Tras la cuota nº
          <input
            required
            type="number"
            min="1"
            value={numeroCuota}
            onChange={(e) => setNumeroCuota(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 4 }}
          />
        </label>

        {tipo === 'amortizacion_parcial' && (
          <>
            <label style={{ fontSize: 12 }}>
              Importe a aportar (€)
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                className="campo-texto"
                style={{ marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              Efecto deseado
              <select
                value={estrategia}
                onChange={(e) => setEstrategia(e.target.value as typeof estrategia)}
                className="campo-texto"
                style={{ marginTop: 4 }}
              >
                <option value="reducir_cuota">Reducir la cuota (mismo plazo)</option>
                <option value="reducir_plazo">Reducir el plazo (misma cuota, termina antes)</option>
              </select>
            </label>
          </>
        )}

        {error && <p className="mensaje-error">{error}</p>}

        <button type="submit" className="boton-primario" disabled={calculando} style={{ alignSelf: 'flex-start' }}>
          {calculando ? 'Calculando…' : 'Calcular'}
        </button>
      </form>

      {resultado && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <p className="etiqueta-mayus" style={{ margin: '0 0 2px' }}>Intereses que te ahorras</p>
              <p className="cifra cifra-positiva" style={{ margin: 0, fontSize: 18 }}>
                {formatearMoneda(resultado.interesesAhorrados)}
              </p>
            </div>
            <div>
              <p className="etiqueta-mayus" style={{ margin: '0 0 2px' }}>Meses que te ahorras</p>
              <p className="cifra" style={{ margin: 0, fontSize: 18 }}>{resultado.mesesAhorrados}</p>
            </div>
            <div>
              <p className="etiqueta-mayus" style={{ margin: '0 0 2px' }}>Cuota</p>
              <p className="cifra" style={{ margin: 0, fontSize: 18 }}>
                {resultado.cuotaDespues === null
                  ? 'Préstamo cancelado'
                  : `${formatearMoneda(resultado.cuotaAntes)} → ${formatearMoneda(resultado.cuotaDespues)}`}
              </p>
            </div>
          </div>
          <button className="boton-primario" onClick={confirmarDeVerdad} disabled={confirmando}>
            {confirmando ? 'Registrando…' : `Confirmar y registrar (aportar ${formatearMoneda(resultado.importeAportado)})`}
          </button>
        </div>
      )}
    </div>
  );
}

function FormularioCrearPasivo({
  token,
  espacioId,
  onCreado,
}: {
  token: string;
  espacioId: string;
  onCreado: () => void;
}) {
  const [tipo, setTipo] = useState<TipoPasivo>('hipoteca');
  const [nombre, setNombre] = useState('');
  const [capitalInicial, setCapitalInicial] = useState('');
  const [tipoInteres, setTipoInteres] = useState('');
  const [plazoMeses, setPlazoMeses] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [tipoTasa, setTipoTasa] = useState<TipoTasa>('fijo');
  const [indicadorReferencia, setIndicadorReferencia] = useState<Indicador>('euribor_12m');
  const [diferencial, setDiferencial] = useState('');
  const [mesesTramoFijo, setMesesTramoFijo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esHipoteca = tipo === 'hipoteca';
  const necesitaIndicador = esHipoteca && tipoTasa !== 'fijo';

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);

    const payload: Record<string, unknown> = {
      espacio_id: espacioId,
      tipo,
      nombre,
      capital_inicial: Number(capitalInicial),
      tipo_interes_anual: Number(tipoInteres) / 100,
      plazo_meses: Number(plazoMeses),
      fecha_inicio: fechaInicio,
    };

    if (esHipoteca) {
      payload.tipo_tasa = tipoTasa;
      payload.indicador_referencia = tipoTasa === 'fijo' ? 'ninguno' : indicadorReferencia;
      if (tipoTasa !== 'fijo') payload.diferencial = Number(diferencial) / 100;
      if (tipoTasa === 'mixto') payload.meses_tramo_fijo = Number(mesesTramoFijo);
    }

    try {
      const respuesta = await fetch('/api/pasivos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido crear el préstamo.');
      }
      setNombre('');
      setCapitalInicial('');
      setTipoInteres('');
      setPlazoMeses('');
      setFechaInicio('');
      setDiferencial('');
      setMesesTramoFijo('');
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el préstamo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Añadir préstamo/hipoteca</h2>
      <form onSubmit={crear} className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoPasivo)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          >
            {Object.entries(ETIQUETAS_TIPO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Nombre
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
            placeholder="Hipoteca vivienda habitual"
          />
        </label>

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Capital inicial (€)
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            value={capitalInicial}
            onChange={(e) => setCapitalInicial(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Tipo de interés inicial (%)
          <input
            required
            type="number"
            step="0.001"
            min="0"
            value={tipoInteres}
            onChange={(e) => setTipoInteres(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
            placeholder="ej. 3,10"
          />
        </label>

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Plazo (meses)
          <input
            required
            type="number"
            min="1"
            value={plazoMeses}
            onChange={(e) => setPlazoMeses(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Fecha de la primera cuota
          <input
            required
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>

        {esHipoteca && (
          <>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Tipo de tasa
              <select
                value={tipoTasa}
                onChange={(e) => setTipoTasa(e.target.value as TipoTasa)}
                className="campo-texto"
                style={{ marginTop: 6 }}
              >
                <option value="fijo">Fijo</option>
                <option value="variable">Variable</option>
                <option value="mixto">Mixto</option>
              </select>
            </label>

            {necesitaIndicador && (
              <>
                <label style={{ fontSize: 13, fontWeight: 500 }}>
                  Índice de referencia
                  <select
                    value={indicadorReferencia}
                    onChange={(e) => setIndicadorReferencia(e.target.value as Indicador)}
                    className="campo-texto"
                    style={{ marginTop: 6 }}
                  >
                    <option value="euribor_3m">Euríbor 3 meses</option>
                    <option value="euribor_6m">Euríbor 6 meses</option>
                    <option value="euribor_12m">Euríbor 12 meses</option>
                    <option value="otro">Otro</option>
                  </select>
                </label>
                <label style={{ fontSize: 13, fontWeight: 500 }}>
                  Diferencial (%)
                  <input
                    required
                    type="number"
                    step="0.001"
                    min="0"
                    value={diferencial}
                    onChange={(e) => setDiferencial(e.target.value)}
                    className="campo-texto"
                    style={{ marginTop: 6 }}
                    placeholder="ej. 0,99"
                  />
                </label>
              </>
            )}

            {tipoTasa === 'mixto' && (
              <label style={{ fontSize: 13, fontWeight: 500 }}>
                Meses del tramo fijo
                <input
                  required
                  type="number"
                  min="1"
                  value={mesesTramoFijo}
                  onChange={(e) => setMesesTramoFijo(e.target.value)}
                  className="campo-texto"
                  style={{ marginTop: 6 }}
                  placeholder="ej. 24"
                />
              </label>
            )}
          </>
        )}

        {error && <p className="mensaje-error">{error}</p>}

        <button type="submit" className="boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar préstamo'}
        </button>
      </form>
    </div>
  );
}
