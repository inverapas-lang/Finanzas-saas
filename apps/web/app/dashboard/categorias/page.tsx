'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { BarraLateral } from '../../../components/BarraLateral';
import { Tags, Trash2 } from 'lucide-react';

interface Espacio {
  id: string;
  nombre: string;
}

interface Categoria {
  id: string;
  nombre: string;
  tipo: 'ingreso' | 'gasto';
  categoria_padre_id: string | null;
}

export default function PaginaCategorias() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pestana, setPestana] = useState<'ingreso' | 'gasto'>('gasto');
  const [error, setError] = useState<string | null>(null);

  const cargarCategorias = useCallback(async (accessToken: string, espacioId: string) => {
    const respuesta = await fetch(`/api/categorias?espacio_id=${espacioId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) throw new Error('No se han podido cargar las categorías.');
    setCategorias((await respuesta.json()).data ?? []);
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
        await cargarCategorias(sesion.session.access_token, primerEspacio.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos.');
      } finally {
        setCargandoSesion(false);
      }
    }

    inicializar();
  }, [router, cargarCategorias]);

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function eliminar(id: string) {
    if (!token || !confirm('¿Eliminar esta categoría? Los movimientos que la usan se quedan sin categoría.')) return;
    const respuesta = await fetch(`/api/categorias/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json();
      alert(cuerpo.error ?? 'No se ha podido eliminar.');
      return;
    }
    if (espacio) await cargarCategorias(token, espacio.id);
  }

  if (cargandoSesion) {
    return (
      <main className="pantalla-centrada">
        <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  const categoriasDelTipo = categorias.filter((c) => c.tipo === pestana);
  const raiz = categoriasDelTipo.filter((c) => !c.categoria_padre_id);
  const hijasDe = (id: string) => categoriasDelTipo.filter((c) => c.categoria_padre_id === id);

  return (
    <div className="app-layout">
      <BarraLateral nombreEspacio={espacio?.nombre ?? 'Finanzas'} onCerrarSesion={cerrarSesion} espacioId={espacio?.id} token={token ?? undefined} />
      <main className="contenido" style={{ maxWidth: 900, padding: '40px 48px' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Categorías</h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Se usan para clasificar ingresos y gastos en movimientos, presupuestos, reglas recurrentes y gráficos.
          </p>
        </header>

        {error && <p className="mensaje-error" style={{ marginBottom: 24 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--color-border)' }}>
          <BotonPestana activa={pestana === 'ingreso'} onClick={() => setPestana('ingreso')}>
            Ingresos
          </BotonPestana>
          <BotonPestana activa={pestana === 'gasto'} onClick={() => setPestana('gasto')}>
            Gastos
          </BotonPestana>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
              {pestana === 'ingreso' ? 'Categorías de ingreso' : 'Categorías de gasto'} ({categoriasDelTipo.length})
            </h2>
            <div className="tarjeta" style={{ padding: 0 }}>
              {raiz.length === 0 ? (
                <p className="estado-vacio">
                  Aún no hay ninguna categoría de {pestana === 'ingreso' ? 'ingreso' : 'gasto'}. Créalas con el
                  formulario de la derecha.
                </p>
              ) : (
                raiz.map((cat, i) => (
                  <div key={cat.id}>
                    <FilaCategoria categoria={cat} esUltima={i === raiz.length - 1 && hijasDe(cat.id).length === 0} onEliminar={() => eliminar(cat.id)} />
                    {hijasDe(cat.id).map((hija, j, arr) => (
                      <FilaCategoria
                        key={hija.id}
                        categoria={hija}
                        subcategoria
                        esUltima={i === raiz.length - 1 && j === arr.length - 1}
                        onEliminar={() => eliminar(hija.id)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {token && espacio && (
            <FormularioCategorias
              token={token}
              espacioId={espacio.id}
              tipo={pestana}
              categoriasRaiz={raiz}
              onCreadas={() => cargarCategorias(token, espacio.id)}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function BotonPestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
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

function FilaCategoria({
  categoria,
  subcategoria,
  esUltima,
  onEliminar,
}: {
  categoria: Categoria;
  subcategoria?: boolean;
  esUltima: boolean;
  onEliminar: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        paddingLeft: subcategoria ? 40 : 16,
        borderBottom: esUltima ? 'none' : '1px solid var(--color-border)',
      }}
    >
      <Tags size={14} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />
      <span style={{ flex: 1, fontSize: 14 }}>{categoria.nombre}</span>
      <button className="enlace-discreto" style={{ color: 'var(--color-red-text)' }} onClick={onEliminar} title="Eliminar">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function FormularioCategorias({
  token,
  espacioId,
  tipo,
  categoriasRaiz,
  onCreadas,
}: {
  token: string;
  espacioId: string;
  tipo: 'ingreso' | 'gasto';
  categoriasRaiz: Categoria[];
  onCreadas: () => void;
}) {
  const [modo, setModo] = useState<'una' | 'varias'>('una');
  const [nombre, setNombre] = useState('');
  const [padreId, setPadreId] = useState('');
  const [listado, setListado] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  async function crearUna(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const respuesta = await fetch('/api/categorias', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: espacioId,
          tipo,
          nombre,
          categoria_padre_id: padreId || null,
        }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido crear la categoría.');
      }
      setNombre('');
      onCreadas();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la categoría.');
    } finally {
      setGuardando(false);
    }
  }

  async function crearVarias(evento: React.FormEvent) {
    evento.preventDefault();
    const nombres = listado
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (nombres.length === 0) return;

    setGuardando(true);
    setError(null);
    setResultado(null);
    let creadas = 0;
    const errores: string[] = [];

    for (const nombreFila of nombres) {
      try {
        const respuesta = await fetch('/api/categorias', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ espacio_id: espacioId, tipo, nombre: nombreFila, categoria_padre_id: padreId || null }),
        });
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json();
          errores.push(`"${nombreFila}": ${cuerpo.error ?? 'error desconocido'}`);
        } else {
          creadas++;
        }
      } catch {
        errores.push(`"${nombreFila}": error de red`);
      }
    }

    setResultado(`${creadas} de ${nombres.length} categorías creadas.${errores.length ? ' Errores: ' + errores.join('; ') : ''}`);
    if (creadas > 0) {
      setListado('');
      onCreadas();
    }
    setGuardando(false);
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Añadir categorías</h2>
      <div className="tarjeta">
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          <button
            type="button"
            className={modo === 'una' ? 'boton-primario' : 'boton-secundario'}
            style={{ fontSize: 12, padding: '6px 10px' }}
            onClick={() => setModo('una')}
          >
            Una
          </button>
          <button
            type="button"
            className={modo === 'varias' ? 'boton-primario' : 'boton-secundario'}
            style={{ fontSize: 12, padding: '6px 10px' }}
            onClick={() => setModo('varias')}
          >
            Varias de golpe
          </button>
        </div>

        <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 12 }}>
          Categoría padre <span className="texto-ayuda">(opcional, para crear una subcategoría)</span>
          <select value={padreId} onChange={(e) => setPadreId(e.target.value)} className="campo-texto" style={{ marginTop: 6 }}>
            <option value="">Ninguna (categoría de nivel superior)</option>
            {categoriasRaiz.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        {modo === 'una' ? (
          <form onSubmit={crearUna} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Nombre
              <input
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="campo-texto"
                style={{ marginTop: 6 }}
                placeholder={tipo === 'ingreso' ? 'Dividendos' : 'Seguros'}
              />
            </label>
            {error && <p className="mensaje-error">{error}</p>}
            <button type="submit" className="boton-primario" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Crear categoría'}
            </button>
          </form>
        ) : (
          <form onSubmit={crearVarias} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Una por línea
              <textarea
                value={listado}
                onChange={(e) => setListado(e.target.value)}
                className="campo-texto"
                style={{ marginTop: 6, fontFamily: 'inherit' }}
                rows={6}
                placeholder={'Dividendos\nSeguros\nSuministros\n…'}
              />
            </label>
            {error && <p className="mensaje-error">{error}</p>}
            {resultado && <p className="texto-ayuda">{resultado}</p>}
            <button type="submit" className="boton-primario" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear todas'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
