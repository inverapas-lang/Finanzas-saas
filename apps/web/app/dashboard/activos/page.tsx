'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { formatearMoneda, formatearFecha, formatearPorcentaje } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { Adjuntos } from '../../../components/Adjuntos';

interface Espacio {
  id: string;
  nombre: string;
}

type TipoActivo = 'vivienda' | 'fondo' | 'accion' | 'etf' | 'deposito' | 'efectivo' | 'otro';

interface Activo {
  id: string;
  tipo: TipoActivo;
  nombre: string;
  valor_actual: number;
  moneda: string;
  fecha_valoracion: string;
  rentabilidad_estimada: number | null;
  notas: string | null;
}

const ETIQUETAS_TIPO: Record<TipoActivo, string> = {
  vivienda: 'Vivienda',
  fondo: 'Fondo de inversión',
  accion: 'Acción',
  etf: 'ETF',
  deposito: 'Depósito',
  efectivo: 'Efectivo',
  otro: 'Otro',
};

export default function PaginaActivos() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [activos, setActivos] = useState<Activo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarActivos = useCallback(async (accessToken: string, espacioId: string) => {
    const respuesta = await fetch(`/api/activos?espacio_id=${espacioId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) throw new Error('No se han podido cargar los activos.');
    const cuerpo = await respuesta.json();
    setActivos(cuerpo.data ?? []);
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
        await cargarActivos(sesion.session.access_token, primerEspacio.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        setCargandoSesion(false);
      }
    }

    inicializar();
  }, [router, cargarActivos]);

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  const totalActivos = activos.reduce((acc, a) => acc + a.valor_actual, 0);

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
        <header style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Activos</h1>
            <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
              Viviendas, fondos, depósitos, efectivo... todo lo que forma tu patrimonio.
            </p>
          </div>
          {activos.length > 0 && (
            <div style={{ textAlign: 'right' }}>
              <p className="etiqueta-mayus" style={{ margin: '0 0 2px' }}>Total activos</p>
              <p className="cifra cifra-positiva" style={{ margin: 0, fontSize: 20 }}>
                {formatearMoneda(totalActivos)}
              </p>
            </div>
          )}
        </header>

        {error && (
          <p className="mensaje-error" style={{ marginBottom: 24 }}>
            {error}
          </p>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {activos.length === 0 ? (
              <div className="tarjeta">
                <p className="estado-vacio">
                  Aún no hay activos aquí. Añade el primero con el formulario de la derecha.
                </p>
              </div>
            ) : (
              activos.map((activo) =>
                token && espacio ? (
                  <TarjetaActivo
                    key={activo.id}
                    activo={activo}
                    token={token}
                    espacioId={espacio.id}
                    onCambio={() => cargarActivos(token, espacio.id)}
                  />
                ) : null
              )
            )}
          </div>

          {token && espacio && (
            <FormularioCrearActivo
              token={token}
              espacioId={espacio.id}
              onCreado={() => cargarActivos(token, espacio.id)}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function TarjetaActivo({
  activo,
  token,
  espacioId,
  onCambio,
}: {
  activo: Activo;
  token: string;
  espacioId: string;
  onCambio: () => void;
}) {
  const [mostrarActualizar, setMostrarActualizar] = useState(false);
  const [nuevoValor, setNuevoValor] = useState(String(activo.valor_actual));
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function actualizarValor(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const respuesta = await fetch(`/api/activos/${activo.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor_actual: Number(nuevoValor) }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido actualizar el valor.');
      }
      setMostrarActualizar(false);
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar.');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar "${activo.nombre}"? Esta acción no se puede deshacer.`)) return;
    setBorrando(true);
    setError(null);
    try {
      const respuesta = await fetch(`/api/activos/${activo.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!respuesta.ok && respuesta.status !== 204) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido eliminar.');
      }
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar.');
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="tarjeta tarjeta-interactiva">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{activo.nombre}</p>
          <p className="texto-ayuda" style={{ margin: '2px 0 0' }}>{ETIQUETAS_TIPO[activo.tipo]}</p>
        </div>
        {activo.rentabilidad_estimada !== null && (
          <p className="cifra" style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
            {formatearPorcentaje(activo.rentabilidad_estimada)} anual est.
          </p>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <p className="etiqueta-mayus" style={{ margin: '0 0 2px' }}>Valor actual</p>
        <p className="cifra cifra-positiva" style={{ margin: 0, fontSize: 20 }}>
          {formatearMoneda(activo.valor_actual)}
        </p>
        <p className="texto-ayuda" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Valorado a mano el {formatearFecha(activo.fecha_valoracion)}
        </p>
      </div>

      {error && <p className="mensaje-error" style={{ marginTop: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <button className="enlace-discreto" onClick={() => setMostrarActualizar((v) => !v)}>
          {mostrarActualizar ? 'Cancelar' : 'Actualizar valor'}
        </button>
        <button className="enlace-discreto" onClick={eliminar} disabled={borrando} style={{ color: 'var(--color-red-text)' }}>
          {borrando ? 'Eliminando…' : 'Eliminar'}
        </button>
      </div>

      {mostrarActualizar && (
        <form onSubmit={actualizarValor} style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, flex: 1 }}>
            Nuevo valor (€)
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={nuevoValor}
              onChange={(e) => setNuevoValor(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 4 }}
            />
          </label>
          <button type="submit" className="boton-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}

      <Adjuntos espacioId={espacioId} entidadTipo="activo" entidadId={activo.id} />
    </div>
  );
}

function FormularioCrearActivo({
  token,
  espacioId,
  onCreado,
}: {
  token: string;
  espacioId: string;
  onCreado: () => void;
}) {
  const [tipo, setTipo] = useState<TipoActivo>('vivienda');
  const [nombre, setNombre] = useState('');
  const [valorActual, setValorActual] = useState('');
  const [rentabilidad, setRentabilidad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);

    const payload: Record<string, unknown> = {
      espacio_id: espacioId,
      tipo,
      nombre,
      valor_actual: Number(valorActual),
    };
    if (rentabilidad !== '') {
      payload.rentabilidad_estimada = Number(rentabilidad) / 100;
    }

    try {
      const respuesta = await fetch('/api/activos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido crear el activo.');
      }
      setNombre('');
      setValorActual('');
      setRentabilidad('');
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el activo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Añadir activo</h2>
      <form onSubmit={crear} className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoActivo)}
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
            placeholder="Piso Alicante"
          />
        </label>

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Valor actual (€)
          <input
            required
            type="number"
            step="0.01"
            min="0"
            value={valorActual}
            onChange={(e) => setValorActual(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
          />
        </label>

        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Rentabilidad anual estimada (%) — opcional
          <input
            type="number"
            step="0.01"
            value={rentabilidad}
            onChange={(e) => setRentabilidad(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 6 }}
            placeholder="ej. 3,5"
          />
        </label>

        <p className="texto-ayuda" style={{ margin: 0 }}>
          La valoración es siempre manual — no hay ninguna fuente automática conectada todavía.
        </p>

        {error && <p className="mensaje-error">{error}</p>}

        <button type="submit" className="boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar activo'}
        </button>
      </form>
    </div>
  );
}
