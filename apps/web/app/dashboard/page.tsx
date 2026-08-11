'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../lib/supabase-browser';
import { formatearMoneda, formatearFecha, tituloImporteExacto, type DecimalesMoneda } from '../../lib/formato';
import { BarraLateral } from '../../components/BarraLateral';

interface Espacio {
  id: string;
  nombre: string;
}

interface Proyeccion {
  realConfirmadoIngresos: number;
  realConfirmadoGastos: number;
  proyectadoIngresos: number;
  proyectadoGastos: number;
  totalEstimadoIngresos: number;
  totalEstimadoGastos: number;
  saldoEstimado: number;
}

interface Ingreso {
  id: string;
  descripcion: string;
  importe_esperado: number;
  fecha_prevista: string;
}

const CLAVE_LOCALSTORAGE_DECIMALES = 'finanzas:decimales-mostrados';

function SelectorDecimales({
  valor,
  onCambiar,
}: {
  valor: DecimalesMoneda;
  onCambiar: (nuevo: DecimalesMoneda) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span className="texto-ayuda">Decimales</span>
      <select
        value={valor}
        onChange={(e) => onCambiar(Number(e.target.value) as DecimalesMoneda)}
        className="campo-texto"
        style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
      >
        <option value={0}>0</option>
        <option value={2}>2</option>
        <option value={4}>4</option>
      </select>
    </label>
  );
}

export default function PaginaDashboard() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [proyeccion, setProyeccion] = useState<Proyeccion | null>(null);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [patrimonio, setPatrimonio] = useState<{ totalActivos: number; totalPasivos: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formDescripcion, setFormDescripcion] = useState('');
  const [formImporte, setFormImporte] = useState('');
  const [formFecha, setFormFecha] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Preferencia de decimales mostrados (0/2/4). Se guarda en localStorage
  // para que se recuerde entre visitas — es solo una preferencia visual de
  // este navegador, no algo que viva en la base de datos.
  const [decimales, setDecimales] = useState<DecimalesMoneda>(2);

  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE_LOCALSTORAGE_DECIMALES);
    if (guardado === '0' || guardado === '2' || guardado === '4') {
      setDecimales(Number(guardado) as DecimalesMoneda);
    }
  }, []);

  function cambiarDecimales(nuevo: DecimalesMoneda) {
    setDecimales(nuevo);
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_DECIMALES, String(nuevo));
  }

  const cargarDatos = useCallback(async (accessToken: string, espacioId: string) => {
    const headers = { Authorization: `Bearer ${accessToken}` };

    const [resProyeccion, resIngresos, resActivos, resPasivos] = await Promise.all([
      fetch(`/api/proyeccion?espacio_id=${espacioId}&hasta=fin_mes`, { headers }),
      fetch(`/api/ingresos?espacio_id=${espacioId}`, { headers }),
      fetch(`/api/activos?espacio_id=${espacioId}`, { headers }),
      fetch(`/api/pasivos?espacio_id=${espacioId}`, { headers }),
    ]);

    if (!resProyeccion.ok || !resIngresos.ok || !resActivos.ok || !resPasivos.ok) {
      throw new Error('No se han podido cargar los datos del espacio financiero.');
    }

    const dataProyeccion = await resProyeccion.json();
    const dataIngresos = await resIngresos.json();
    const dataActivos = await resActivos.json();
    const dataPasivos = await resPasivos.json();

    setProyeccion(dataProyeccion.data);
    setIngresos(dataIngresos.data ?? []);

    const totalActivos = (dataActivos.data ?? []).reduce(
      (acc: number, a: { valor_actual: number }) => acc + a.valor_actual,
      0
    );
    const totalPasivos = (dataPasivos.data ?? []).reduce(
      (acc: number, p: { capital_pendiente: number }) => acc + p.capital_pendiente,
      0
    );
    setPatrimonio({ totalActivos, totalPasivos });
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

      // Tomamos el primer espacio del que el usuario es miembro. Cuando haya
      // más de un espacio (varios clientes gestionados por un asesor, por
      // ejemplo), aquí irá un selector — de momento cogemos el primero.
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
        await cargarDatos(sesion.session.access_token, primerEspacio.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        setCargandoSesion(false);
      }
    }

    inicializar();
  }, [router, cargarDatos]);

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function crearIngreso(evento: React.FormEvent) {
    evento.preventDefault();
    if (!token || !espacio) return;
    setGuardando(true);
    setError(null);

    try {
      const respuesta = await fetch('/api/ingresos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          espacio_id: espacio.id,
          descripcion: formDescripcion,
          importe_esperado: Number(formImporte),
          fecha_prevista: formFecha,
        }),
      });

      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido crear el ingreso.');
      }

      setFormDescripcion('');
      setFormImporte('');
      setFormFecha('');
      await cargarDatos(token, espacio.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el ingreso.');
    } finally {
      setGuardando(false);
    }
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
        <header style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Panel</h1>
            <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
              Proyección hasta fin de mes
            </p>
          </div>
          <SelectorDecimales valor={decimales} onCambiar={cambiarDecimales} />
        </header>

        {error && <p className="mensaje-error" style={{ marginBottom: 24 }}>{error}</p>}

      {proyeccion && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 40,
          }}
        >
          <TarjetaCifra
            etiqueta="Ingresos estimados"
            valor={proyeccion.totalEstimadoIngresos}
            positivo
            decimales={decimales}
          />
          <TarjetaCifra
            etiqueta="Gastos estimados"
            valor={proyeccion.totalEstimadoGastos}
            positivo={false}
            decimales={decimales}
          />
          <TarjetaCifra
            etiqueta="Saldo estimado"
            valor={proyeccion.saldoEstimado}
            positivo={proyeccion.saldoEstimado >= 0}
            destacada
            decimales={decimales}
          />
        </section>
      )}

      {patrimonio && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Patrimonio</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            <TarjetaCifra
              etiqueta="Total activos"
              valor={patrimonio.totalActivos}
              positivo
              decimales={decimales}
            />
            <TarjetaCifra
              etiqueta="Total pasivos (pendiente)"
              valor={patrimonio.totalPasivos}
              positivo={false}
              decimales={decimales}
            />
            <TarjetaCifra
              etiqueta="Patrimonio neto"
              valor={patrimonio.totalActivos - patrimonio.totalPasivos}
              positivo={patrimonio.totalActivos - patrimonio.totalPasivos >= 0}
              destacada
              decimales={decimales}
            />
          </div>
        </section>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 32 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
            Ingresos
          </h2>
          <div className="tarjeta" style={{ padding: 0 }}>
            {ingresos.length === 0 ? (
              <p className="estado-vacio">
                Aún no hay ingresos aquí. Añade el primero con el formulario de la derecha.
              </p>
            ) : (
              <table className="tabla-filas-hover" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {ingresos.map((ingreso, i) => (
                    <tr
                      key={ingreso.id}
                      style={{
                        borderBottom:
                          i < ingresos.length - 1 ? '1px solid var(--color-border)' : 'none',
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 14 }}>{ingreso.descripcion}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                        {formatearFecha(ingreso.fecha_prevista)}
                      </td>
                      <td
                        className="cifra cifra-positiva"
                        style={{ padding: '12px 16px', textAlign: 'right', fontSize: 14 }}
                        title={tituloImporteExacto(ingreso.importe_esperado, decimales)}
                      >
                        {formatearMoneda(ingreso.importe_esperado, decimales)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
            Añadir ingreso
          </h2>
          <form
            onSubmit={crearIngreso}
            className="tarjeta"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Descripción
              <input
                required
                value={formDescripcion}
                onChange={(e) => setFormDescripcion(e.target.value)}
                className="campo-texto"
                style={{ marginTop: 6 }}
                placeholder="Nómina de julio"
              />
            </label>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Importe esperado (€)
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={formImporte}
                onChange={(e) => setFormImporte(e.target.value)}
                className="campo-texto"
                style={{ marginTop: 6 }}
              />
            </label>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Fecha prevista
              <input
                required
                type="date"
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className="campo-texto"
                style={{ marginTop: 6 }}
              />
            </label>
            <button type="submit" className="boton-primario" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar ingreso'}
            </button>
          </form>
        </div>
      </section>
      </main>
    </div>
  );
}

function TarjetaCifra({
  etiqueta,
  valor,
  positivo,
  decimales,
  destacada = false,
}: {
  etiqueta: string;
  valor: number;
  positivo: boolean;
  decimales: DecimalesMoneda;
  destacada?: boolean;
}) {
  return (
    <div
      className="tarjeta tarjeta-interactiva"
      style={destacada ? { borderColor: 'var(--color-text)' } : undefined}
    >
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {etiqueta}
      </p>
      <p
        className={`cifra ${positivo ? 'cifra-positiva' : 'cifra-negativa'}`}
        style={{ fontSize: 24, margin: 0 }}
        title={tituloImporteExacto(valor, decimales)}
      >
        {formatearMoneda(valor, decimales)}
      </p>
    </div>
  );
}
