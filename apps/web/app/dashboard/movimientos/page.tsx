'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { formatearMoneda, formatearFecha } from '../../../lib/formato';
import { BarraLateral } from '../../../components/BarraLateral';
import { Download, Upload, CalendarRange } from 'lucide-react';

interface Espacio {
  id: string;
  nombre: string;
}

interface Cuenta {
  id: string;
  nombre: string;
}

interface Categoria {
  id: string;
  nombre: string;
  tipo: 'ingreso' | 'gasto';
}

interface Ingreso {
  id: string;
  descripcion: string;
  importe_esperado: number;
  importe_real: number | null;
  fecha_prevista: string;
  fecha_cobrada: string | null;
  categoria_id: string | null;
  cuenta_id: string | null;
}

interface Gasto {
  id: string;
  descripcion: string;
  importe_previsto: number;
  importe_real: number | null;
  fecha_prevista: string;
  fecha_pagada: string | null;
  categoria_id: string | null;
  cuenta_id: string | null;
}

export default function PaginaMovimientos() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [pestana, setPestana] = useState<'ingresos' | 'gastos'>('ingresos');

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarTodo = useCallback(async (accessToken: string, espacioId: string) => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [resCuentas, resCategorias, resIngresos, resGastos] = await Promise.all([
      fetch(`/api/cuentas-bancarias?espacio_id=${espacioId}`, { headers }),
      fetch(`/api/categorias?espacio_id=${espacioId}`, { headers }),
      fetch(`/api/ingresos?espacio_id=${espacioId}`, { headers }),
      fetch(`/api/gastos?espacio_id=${espacioId}`, { headers }),
    ]);
    if (!resCuentas.ok || !resCategorias.ok || !resIngresos.ok || !resGastos.ok) {
      throw new Error('No se han podido cargar los movimientos.');
    }
    setCuentas((await resCuentas.json()).data ?? []);
    setCategorias((await resCategorias.json()).data ?? []);
    setIngresos((await resIngresos.json()).data ?? []);
    setGastos((await resGastos.json()).data ?? []);
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
        await cargarTodo(sesion.session.access_token, primerEspacio.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        setCargandoSesion(false);
      }
    }

    inicializar();
  }, [router, cargarTodo]);

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

  const categoriasDelTipo = categorias.filter((c) => c.tipo === (pestana === 'ingresos' ? 'ingreso' : 'gasto'));

  return (
    <div className="app-layout">
      <BarraLateral nombreEspacio={espacio?.nombre ?? 'Finanzas'} onCerrarSesion={cerrarSesion} espacioId={espacio?.id} token={token ?? undefined} />
      <main className="contenido" style={{ maxWidth: 960, padding: '40px 48px' }}>
        <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Movimientos</h1>
            <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
              Todos tus ingresos y gastos, previstos y ya confirmados.
            </p>
          </div>
          {token && espacio && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <BotonCargaMasiva
                token={token}
                espacioId={espacio.id}
                categorias={categorias}
                cuentas={cuentas}
                tipoInicial={pestana === 'ingresos' ? 'ingreso' : 'gasto'}
                onCreado={() => cargarTodo(token, espacio.id)}
              />
              <BotonImportar token={token} espacioId={espacio.id} onImportado={() => cargarTodo(token, espacio.id)} />
              <BotonesExportar token={token} espacioId={espacio.id} />
            </div>
          )}
        </header>

        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--color-border)' }}>
          <BotonPestana activa={pestana === 'ingresos'} onClick={() => setPestana('ingresos')}>
            Ingresos
          </BotonPestana>
          <BotonPestana activa={pestana === 'gastos'} onClick={() => setPestana('gastos')}>
            Gastos
          </BotonPestana>
        </div>

        {error && <p className="mensaje-error" style={{ marginBottom: 24 }}>{error}</p>}

        {cuentas.length === 0 && categorias.length === 0 && (
          <p className="texto-ayuda" style={{ marginBottom: 16 }}>
            Aún no tienes cuentas ni categorías creadas — puedes seguir registrando movimientos sin ellas,
            se añadirán como "sin asignar".
          </p>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32 }}>
          {token && espacio && pestana === 'ingresos' && (
            <>
              <ListaIngresos
                ingresos={ingresos}
                cuentas={cuentas}
                categorias={categorias}
                token={token}
                onCambio={() => cargarTodo(token, espacio.id)}
              />
              <FormularioIngreso
                token={token}
                espacioId={espacio.id}
                cuentas={cuentas}
                categorias={categoriasDelTipo}
                onCreado={() => cargarTodo(token, espacio.id)}
              />
            </>
          )}

          {token && espacio && pestana === 'gastos' && (
            <>
              <ListaGastos
                gastos={gastos}
                cuentas={cuentas}
                categorias={categorias}
                token={token}
                onCambio={() => cargarTodo(token, espacio.id)}
              />
              <FormularioGasto
                token={token}
                espacioId={espacio.id}
                cuentas={cuentas}
                categorias={categoriasDelTipo}
                onCreado={() => cargarTodo(token, espacio.id)}
              />
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function BotonPestana({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: activa ? '2px solid var(--color-text)' : '2px solid transparent',
        padding: '8px 4px',
        marginBottom: -1,
        fontSize: 14,
        fontWeight: activa ? 600 : 400,
        color: activa ? 'var(--color-text)' : 'var(--color-text-muted)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function nombreCuenta(cuentas: Cuenta[], id: string | null): string {
  if (!id) return 'Sin cuenta';
  return cuentas.find((c) => c.id === id)?.nombre ?? 'Sin cuenta';
}

function nombreCategoria(categorias: Categoria[], id: string | null): string {
  if (!id) return 'Sin categoría';
  return categorias.find((c) => c.id === id)?.nombre ?? 'Sin categoría';
}

function ListaIngresos({
  ingresos,
  cuentas,
  categorias,
  token,
  onCambio,
}: {
  ingresos: Ingreso[];
  cuentas: Cuenta[];
  categorias: Categoria[];
  token: string;
  onCambio: () => void;
}) {
  async function marcarCobrado(ingreso: Ingreso, importeReal: number) {
    await fetch(`/api/ingresos/${ingreso.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ importe_real: importeReal, fecha_cobrada: new Date().toISOString().slice(0, 10) }),
    });
    onCambio();
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este ingreso?')) return;
    await fetch(`/api/ingresos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    onCambio();
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
        Ingresos ({ingresos.length})
      </h2>
      <div className="tarjeta" style={{ padding: 0 }}>
        {ingresos.length === 0 ? (
          <p className="estado-vacio">Aún no hay ingresos aquí. Añade el primero con el formulario de la derecha.</p>
        ) : (
          <table className="tabla-filas-hover" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {ingresos.map((ingreso, i) => (
                <FilaMovimiento
                  key={ingreso.id}
                  descripcion={ingreso.descripcion}
                  fecha={ingreso.fecha_prevista}
                  importe={ingreso.importe_real ?? ingreso.importe_esperado}
                  confirmado={ingreso.fecha_cobrada !== null}
                  subtitulo={`${nombreCuenta(cuentas, ingreso.cuenta_id)} · ${nombreCategoria(categorias, ingreso.categoria_id)}`}
                  positivo
                  esUltima={i === ingresos.length - 1}
                  onConfirmar={(importe) => marcarCobrado(ingreso, importe)}
                  onEliminar={() => eliminar(ingreso.id)}
                  etiquetaConfirmar="Marcar cobrado"
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ListaGastos({
  gastos,
  cuentas,
  categorias,
  token,
  onCambio,
}: {
  gastos: Gasto[];
  cuentas: Cuenta[];
  categorias: Categoria[];
  token: string;
  onCambio: () => void;
}) {
  async function marcarPagado(gasto: Gasto, importeReal: number) {
    await fetch(`/api/gastos/${gasto.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ importe_real: importeReal, fecha_pagada: new Date().toISOString().slice(0, 10) }),
    });
    onCambio();
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return;
    await fetch(`/api/gastos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    onCambio();
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
        Gastos ({gastos.length})
      </h2>
      <div className="tarjeta" style={{ padding: 0 }}>
        {gastos.length === 0 ? (
          <p className="estado-vacio">Aún no hay gastos aquí. Añade el primero con el formulario de la derecha.</p>
        ) : (
          <table className="tabla-filas-hover" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {gastos.map((gasto, i) => (
                <FilaMovimiento
                  key={gasto.id}
                  descripcion={gasto.descripcion}
                  fecha={gasto.fecha_prevista}
                  importe={gasto.importe_real ?? gasto.importe_previsto}
                  confirmado={gasto.fecha_pagada !== null}
                  subtitulo={`${nombreCuenta(cuentas, gasto.cuenta_id)} · ${nombreCategoria(categorias, gasto.categoria_id)}`}
                  positivo={false}
                  esUltima={i === gastos.length - 1}
                  onConfirmar={(importe) => marcarPagado(gasto, importe)}
                  onEliminar={() => eliminar(gasto.id)}
                  etiquetaConfirmar="Marcar pagado"
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilaMovimiento({
  descripcion,
  fecha,
  importe,
  confirmado,
  subtitulo,
  positivo,
  esUltima,
  onConfirmar,
  onEliminar,
  etiquetaConfirmar,
}: {
  descripcion: string;
  fecha: string;
  importe: number;
  confirmado: boolean;
  subtitulo: string;
  positivo: boolean;
  esUltima: boolean;
  onConfirmar: (importe: number) => void;
  onEliminar: () => void;
  etiquetaConfirmar: string;
}) {
  const [editando, setEditando] = useState(false);
  const [importeEditado, setImporteEditado] = useState(String(importe));

  return (
    <tr style={{ borderBottom: esUltima ? 'none' : '1px solid var(--color-border)' }}>
      <td style={{ padding: '12px 16px' }}>
        <p style={{ margin: 0 }}>{descripcion}</p>
        <p className="texto-ayuda" style={{ margin: '2px 0 0', fontSize: 12 }}>{subtitulo}</p>
      </td>
      <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
        {formatearFecha(fecha)}
      </td>
      <td style={{ padding: '12px 16px' }}>
        {confirmado ? (
          <span className="texto-ayuda" style={{ fontSize: 11 }}>✓ confirmado</span>
        ) : editando ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="number"
              step="0.01"
              value={importeEditado}
              onChange={(e) => setImporteEditado(e.target.value)}
              className="campo-texto"
              style={{ width: 90, padding: '4px 6px', fontSize: 12 }}
            />
            <button
              className="enlace-discreto"
              style={{ fontSize: 12 }}
              onClick={() => {
                onConfirmar(Number(importeEditado));
                setEditando(false);
              }}
            >
              OK
            </button>
          </div>
        ) : (
          <button className="enlace-discreto" style={{ fontSize: 11 }} onClick={() => setEditando(true)}>
            {etiquetaConfirmar}
          </button>
        )}
      </td>
      <td className={`cifra ${positivo ? 'cifra-positiva' : 'cifra-negativa'}`} style={{ padding: '12px 16px', textAlign: 'right' }}>
        {formatearMoneda(importe)}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <button className="enlace-discreto" style={{ fontSize: 11, color: 'var(--color-red-text)' }} onClick={onEliminar}>
          Eliminar
        </button>
      </td>
    </tr>
  );
}

function FormularioIngreso({
  token,
  espacioId,
  cuentas,
  categorias,
  onCreado,
}: {
  token: string;
  espacioId: string;
  cuentas: Cuenta[];
  categorias: Categoria[];
  onCreado: () => void;
}) {
  const [descripcion, setDescripcion] = useState('');
  const [importe, setImporte] = useState('');
  const [fecha, setFecha] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const respuesta = await fetch('/api/ingresos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: espacioId,
          descripcion,
          importe_esperado: Number(importe),
          fecha_prevista: fecha,
          cuenta_id: cuentaId || null,
          categoria_id: categoriaId || null,
        }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido crear el ingreso.');
      }
      setDescripcion('');
      setImporte('');
      setFecha('');
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el ingreso.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Añadir ingreso</h2>
      <form onSubmit={crear} className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CampoTexto etiqueta="Descripción" valor={descripcion} onCambio={setDescripcion} placeholder="Nómina de julio" requerido />
        <CampoNumero etiqueta="Importe esperado (€)" valor={importe} onCambio={setImporte} requerido />
        <CampoFecha etiqueta="Fecha prevista" valor={fecha} onCambio={setFecha} requerido />
        <SelectorOpcional etiqueta="Cuenta" valor={cuentaId} onCambio={setCuentaId} opciones={cuentas} />
        <SelectorOpcional etiqueta="Categoría" valor={categoriaId} onCambio={setCategoriaId} opciones={categorias} />
        {error && <p className="mensaje-error">{error}</p>}
        <button type="submit" className="boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar ingreso'}
        </button>
      </form>
    </div>
  );
}

function FormularioGasto({
  token,
  espacioId,
  cuentas,
  categorias,
  onCreado,
}: {
  token: string;
  espacioId: string;
  cuentas: Cuenta[];
  categorias: Categoria[];
  onCreado: () => void;
}) {
  const [descripcion, setDescripcion] = useState('');
  const [importe, setImporte] = useState('');
  const [fecha, setFecha] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const respuesta = await fetch('/api/gastos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: espacioId,
          descripcion,
          importe_previsto: Number(importe),
          fecha_prevista: fecha,
          cuenta_id: cuentaId || null,
          categoria_id: categoriaId || null,
        }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido crear el gasto.');
      }
      setDescripcion('');
      setImporte('');
      setFecha('');
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el gasto.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Añadir gasto</h2>
      <form onSubmit={crear} className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CampoTexto etiqueta="Descripción" valor={descripcion} onCambio={setDescripcion} placeholder="Supermercado" requerido />
        <CampoNumero etiqueta="Importe previsto (€)" valor={importe} onCambio={setImporte} requerido />
        <CampoFecha etiqueta="Fecha prevista" valor={fecha} onCambio={setFecha} requerido />
        <SelectorOpcional etiqueta="Cuenta" valor={cuentaId} onCambio={setCuentaId} opciones={cuentas} />
        <SelectorOpcional etiqueta="Categoría" valor={categoriaId} onCambio={setCategoriaId} opciones={categorias} />
        {error && <p className="mensaje-error">{error}</p>}
        <button type="submit" className="boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar gasto'}
        </button>
      </form>
    </div>
  );
}

function CampoTexto({
  etiqueta,
  valor,
  onCambio,
  placeholder,
  requerido,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  placeholder?: string;
  requerido?: boolean;
}) {
  return (
    <label style={{ fontSize: 13, fontWeight: 500 }}>
      {etiqueta}
      <input
        required={requerido}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="campo-texto"
        style={{ marginTop: 6 }}
        placeholder={placeholder}
      />
    </label>
  );
}

function CampoNumero({
  etiqueta,
  valor,
  onCambio,
  requerido,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  requerido?: boolean;
}) {
  return (
    <label style={{ fontSize: 13, fontWeight: 500 }}>
      {etiqueta}
      <input
        required={requerido}
        type="number"
        step="0.01"
        min="0"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="campo-texto"
        style={{ marginTop: 6 }}
      />
    </label>
  );
}

function CampoFecha({
  etiqueta,
  valor,
  onCambio,
  requerido,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  requerido?: boolean;
}) {
  return (
    <label style={{ fontSize: 13, fontWeight: 500 }}>
      {etiqueta}
      <input
        required={requerido}
        type="date"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="campo-texto"
        style={{ marginTop: 6 }}
      />
    </label>
  );
}

function SelectorOpcional({
  etiqueta,
  valor,
  onCambio,
  opciones,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  opciones: { id: string; nombre: string }[];
}) {
  return (
    <label style={{ fontSize: 13, fontWeight: 500 }}>
      {etiqueta} <span className="texto-ayuda">(opcional)</span>
      <select value={valor} onChange={(e) => onCambio(e.target.value)} className="campo-texto" style={{ marginTop: 6 }}>
        <option value="">Sin {etiqueta.toLowerCase()}</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

function BotonesExportar({ token, espacioId }: { token: string; espacioId: string }) {
  const [descargando, setDescargando] = useState<'csv' | 'xlsx' | 'pdf' | null>(null);

  async function descargar(formato: 'csv' | 'xlsx' | 'pdf') {
    setDescargando(formato);
    try {
      const respuesta = await fetch(`/api/exportar?espacio_id=${espacioId}&formato=${formato}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!respuesta.ok) {
        alert('No se ha podido generar el archivo.');
        return;
      }
      const blob = await respuesta.blob();
      const url = window.URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `movimientos-${new Date().toISOString().slice(0, 10)}.${formato}`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      window.URL.revokeObjectURL(url);
    } finally {
      setDescargando(null);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="boton-secundario" onClick={() => descargar('csv')} disabled={descargando !== null}>
        <Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        {descargando === 'csv' ? 'Generando…' : 'CSV'}
      </button>
      <button className="boton-secundario" onClick={() => descargar('xlsx')} disabled={descargando !== null}>
        <Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        {descargando === 'xlsx' ? 'Generando…' : 'Excel'}
      </button>
      <button className="boton-secundario" onClick={() => descargar('pdf')} disabled={descargando !== null}>
        <Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        {descargando === 'pdf' ? 'Generando…' : 'PDF'}
      </button>
    </div>
  );
}

interface ResultadoImportacion {
  totalFilas: number;
  creados: number;
  erroresValidacion: { numeroFila: number; error: string }[];
  erroresInsercion: { numeroFila: number; error: string }[];
}

function BotonImportar({
  token,
  espacioId,
  onImportado,
}: {
  token: string;
  espacioId: string;
  onImportado: () => void;
}) {
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function importar(archivo: File) {
    setImportando(true);
    setError(null);
    setResultado(null);

    const formData = new FormData();
    formData.append('archivo', archivo);
    formData.append('espacio_id', espacioId);

    try {
      const respuesta = await fetch('/api/importar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }, // sin Content-Type: el navegador lo pone solo con el boundary correcto para FormData
        body: formData,
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se ha podido importar el archivo.');
      setResultado(cuerpo.data);
      onImportado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al importar.');
    } finally {
      setImportando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const totalErrores = resultado
    ? resultado.erroresValidacion.length + resultado.erroresInsercion.length
    : 0;

  return (
    <div style={{ position: 'relative' }}>
      <label className="boton-secundario" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <Upload size={14} />
        {importando ? 'Importando…' : 'Importar Excel'}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          disabled={importando}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) importar(archivo);
          }}
          style={{ display: 'none' }}
        />
      </label>

      {(resultado || error) && (
        <div
          className="tarjeta"
          style={{
            position: 'absolute',
            top: '110%',
            right: 0,
            zIndex: 10,
            width: 320,
            fontSize: 13,
          }}
        >
          {error && <p className="mensaje-error">{error}</p>}
          {resultado && (
            <>
              <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
                {resultado.creados} de {resultado.totalFilas} filas importadas
              </p>
              {totalErrores > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {[...resultado.erroresValidacion, ...resultado.erroresInsercion]
                    .sort((a, b) => a.numeroFila - b.numeroFila)
                    .map((e, i) => (
                      <p key={i} className="texto-ayuda" style={{ margin: '4px 0', color: 'var(--color-red-text)' }}>
                        Fila {e.numeroFila}: {e.error}
                      </p>
                    ))}
                </div>
              )}
              <button
                className="enlace-discreto"
                onClick={() => setResultado(null)}
                style={{ marginTop: 8 }}
              >
                Cerrar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const NOMBRES_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

interface FilaCargaMasiva {
  mes: number; // 1-12
  descripcion: string;
  importe: string;
  incluir: boolean;
}

function BotonCargaMasiva({
  token,
  espacioId,
  categorias,
  cuentas,
  tipoInicial,
  onCreado,
}: {
  token: string;
  espacioId: string;
  categorias: Categoria[];
  cuentas: Cuenta[];
  tipoInicial: 'ingreso' | 'gasto';
  onCreado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="boton-secundario" onClick={() => setAbierto(true)}>
        <CalendarRange size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        Carga masiva
      </button>
      {abierto && (
        <ModalCargaMasiva
          token={token}
          espacioId={espacioId}
          categorias={categorias}
          cuentas={cuentas}
          tipoInicial={tipoInicial}
          onCerrar={() => setAbierto(false)}
          onCreado={() => {
            onCreado();
            setAbierto(false);
          }}
        />
      )}
    </>
  );
}

function ModalCargaMasiva({
  token,
  espacioId,
  categorias,
  cuentas,
  tipoInicial,
  onCerrar,
  onCreado,
}: {
  token: string;
  espacioId: string;
  categorias: Categoria[];
  cuentas: Cuenta[];
  tipoInicial: 'ingreso' | 'gasto';
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>(tipoInicial);
  const [descripcionBase, setDescripcionBase] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [diaDelMes, setDiaDelMes] = useState('1');
  const [mesInicio, setMesInicio] = useState(1);
  const [mesFin, setMesFin] = useState(12);
  const [modoImporte, setModoImporte] = useState<'fijo' | 'variable'>('fijo');
  const [importeFijo, setImporteFijo] = useState('');
  const [importesPorMes, setImportesPorMes] = useState<string[]>(Array(12).fill(''));
  const [confirmados, setConfirmados] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoriasDelTipo = categorias.filter((c) => c.tipo === tipo);

  const filas: FilaCargaMasiva[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    if (mes < mesInicio || mes > mesFin) continue;
    const importe = modoImporte === 'fijo' ? importeFijo : importesPorMes[mes - 1];
    filas.push({
      mes,
      descripcion: descripcionBase.trim()
        ? `${descripcionBase.trim()} — ${NOMBRES_MES[mes - 1]} ${anio}`
        : `${NOMBRES_MES[mes - 1]} ${anio}`,
      importe,
      incluir: true,
    });
  }

  const totalFilasValidas = filas.filter((f) => f.importe.trim() !== '' && !Number.isNaN(Number(f.importe))).length;

  function pegarColumnaImportes(texto: string) {
    // Permite pegar directamente una columna de 12 (o menos) valores copiada
    // de un Excel/Sheets — una cifra por línea o separada por tabulador.
    const valores = texto
      .split(/[\n\t]+/)
      .map((v) => v.trim().replace(',', '.'))
      .filter((v) => v !== '');
    if (valores.length === 0) return;
    setImportesPorMes((anterior) => {
      const nuevo = [...anterior];
      let indice = mesInicio - 1;
      for (const valor of valores) {
        if (indice > mesFin - 1) break;
        nuevo[indice] = valor;
        indice++;
      }
      return nuevo;
    });
  }

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      const diaNumero = Number(diaDelMes);
      const dia = String(Number.isFinite(diaNumero) && diaNumero >= 1 && diaNumero <= 28 ? diaNumero : 1).padStart(
        2,
        '0'
      );
      const filasParaEnviar = filas
        .filter((f) => f.importe.trim() !== '')
        .map((f) => ({
          descripcion: f.descripcion,
          fecha_prevista: `${anio}-${String(f.mes).padStart(2, '0')}-${dia}`,
          importe: Number(f.importe),
        }));

      if (filasParaEnviar.length === 0) {
        throw new Error('Rellena al menos un importe para poder crear movimientos.');
      }

      const respuesta = await fetch('/api/movimientos/carga-masiva', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          espacio_id: espacioId,
          categoria_id: categoriaId || null,
          cuenta_id: cuentaId || null,
          confirmados,
          filas: filasParaEnviar,
        }),
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se ha podido crear los movimientos.');
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear los movimientos.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        zIndex: 100,
        overflowY: 'auto',
      }}
      onClick={onCerrar}
    >
      <div
        className="tarjeta"
        style={{ width: 640, maxWidth: '100%', padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Carga masiva</h2>
            <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
              Crea de golpe una serie mensual (nóminas de un año pasado, dividendos estimados, etc.)
            </p>
          </div>
          <button className="enlace-discreto" onClick={onCerrar}>
            Cerrar
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, margin: '16px 0', borderBottom: '1px solid var(--color-border)' }}>
          <BotonPestana activa={tipo === 'ingreso'} onClick={() => { setTipo('ingreso'); setCategoriaId(''); }}>
            Ingresos
          </BotonPestana>
          <BotonPestana activa={tipo === 'gasto'} onClick={() => { setTipo('gasto'); setCategoriaId(''); }}>
            Gastos
          </BotonPestana>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <CampoTexto
            etiqueta="Descripción base"
            valor={descripcionBase}
            onCambio={setDescripcionBase}
            placeholder={tipo === 'ingreso' ? 'Nómina' : 'Alquiler'}
          />
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Año
            <input
              type="number"
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>
          <SelectorOpcional etiqueta="Cuenta" valor={cuentaId} onCambio={setCuentaId} opciones={cuentas} />
          <SelectorOpcional etiqueta="Categoría" valor={categoriaId} onCambio={setCategoriaId} opciones={categoriasDelTipo} />
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Desde mes
            <select
              value={mesInicio}
              onChange={(e) => setMesInicio(Number(e.target.value))}
              className="campo-texto"
              style={{ marginTop: 6 }}
            >
              {NOMBRES_MES.map((n, i) => (
                <option key={i} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Hasta mes
            <select
              value={mesFin}
              onChange={(e) => setMesFin(Number(e.target.value))}
              className="campo-texto"
              style={{ marginTop: 6 }}
            >
              {NOMBRES_MES.map((n, i) => (
                <option key={i} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Día del mes <span className="texto-ayuda">(fecha prevista)</span>
            <input
              type="number"
              min="1"
              max="28"
              value={diaDelMes}
              onChange={(e) => setDiaDelMes(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
            <input type="checkbox" checked={confirmados} onChange={(e) => setConfirmados(e.target.checked)} />
            Ya {tipo === 'ingreso' ? 'cobrados' : 'pagados'} (año pasado, dato real)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          <button
            className={modoImporte === 'fijo' ? 'boton-primario' : 'boton-secundario'}
            style={{ fontSize: 12, padding: '6px 10px' }}
            onClick={() => setModoImporte('fijo')}
          >
            Mismo importe cada mes
          </button>
          <button
            className={modoImporte === 'variable' ? 'boton-primario' : 'boton-secundario'}
            style={{ fontSize: 12, padding: '6px 10px' }}
            onClick={() => setModoImporte('variable')}
          >
            Importe distinto cada mes
          </button>
        </div>

        {modoImporte === 'fijo' ? (
          <CampoNumero etiqueta="Importe mensual (€)" valor={importeFijo} onCambio={setImporteFijo} />
        ) : (
          <div style={{ marginBottom: 12 }}>
            <p className="texto-ayuda" style={{ margin: '0 0 6px' }}>
              Pega aquí una columna de importes copiada de Excel/Sheets (uno por línea) o rellénalos a mano abajo.
            </p>
            <textarea
              className="campo-texto"
              placeholder={'1200.50\n1200.50\n1350.00\n…'}
              rows={2}
              style={{ marginBottom: 8, fontFamily: 'monospace', fontSize: 12 }}
              onPaste={(e) => {
                const texto = e.clipboardData.getData('text');
                if (texto.includes('\n') || texto.includes('\t')) {
                  e.preventDefault();
                  pegarColumnaImportes(texto);
                }
              }}
              onChange={() => {
                /* solo se usa para capturar el pegado; el detalle se edita abajo */
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {filas.map((f) => (
                <label key={f.mes} style={{ fontSize: 12 }}>
                  {NOMBRES_MES[f.mes - 1].slice(0, 3)}
                  <input
                    type="number"
                    step="0.01"
                    value={importesPorMes[f.mes - 1]}
                    onChange={(e) =>
                      setImportesPorMes((anterior) => {
                        const nuevo = [...anterior];
                        nuevo[f.mes - 1] = e.target.value;
                        return nuevo;
                      })
                    }
                    className="campo-texto"
                    style={{ marginTop: 4, padding: '4px 6px' }}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="tarjeta" style={{ padding: 0, marginBottom: 12, maxHeight: 220, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.mes} style={{ borderBottom: i === filas.length - 1 ? 'none' : '1px solid var(--color-border)' }}>
                  <td style={{ padding: '6px 12px' }}>{f.descripcion}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: f.importe.trim() === '' ? 'var(--color-text-muted)' : undefined }}>
                    {f.importe.trim() === '' ? '—' : formatearMoneda(Number(f.importe))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <p className="mensaje-error" style={{ marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="boton-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button className="boton-primario" onClick={crear} disabled={guardando || totalFilasValidas === 0}>
            {guardando ? 'Creando…' : `Crear ${totalFilasValidas} movimiento${totalFilasValidas === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
