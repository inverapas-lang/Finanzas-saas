'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../../lib/supabase-browser';
import { BarraLateral } from '../../../components/BarraLateral';
import { Sparkles, Send } from 'lucide-react';

interface Espacio {
  id: string;
  nombre: string;
}

interface Mensaje {
  rol: 'usuario' | 'asistente';
  contenido: string;
}

const SUGERENCIAS = [
  '¿Cuál es mi patrimonio neto ahora mismo?',
  '¿Cómo va la proyección de este mes?',
  '¿Algún presupuesto se ha superado?',
  '¿En qué categoría he gastado más los últimos 3 meses?',
];

export default function PaginaChat() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef<HTMLDivElement>(null);

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

      setEspacio(espacios[0] as Espacio);
      setCargandoSesion(false);
    }

    inicializar();
  }, [router]);

  useEffect(() => {
    finalRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, enviando]);

  async function cerrarSesion() {
    const supabase = crearClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function enviarMensaje(texto: string) {
    const contenido = texto.trim();
    if (!contenido || enviando || !espacio || !token) return;

    const historialConNuevoMensaje = [...mensajes, { rol: 'usuario' as const, contenido }];
    setMensajes(historialConNuevoMensaje);
    setEntrada('');
    setEnviando(true);
    setError(null);

    try {
      const respuesta = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          espacio_id: espacio.id,
          mensajes: historialConNuevoMensaje,
        }),
      });

      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(cuerpo.error ?? 'No se ha podido contactar con el asistente.');
      }

      setMensajes([...historialConNuevoMensaje, cuerpo.data as Mensaje]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al hablar con el asistente.');
      // Deshacemos el mensaje del usuario del historial visible tampoco
      // hace falta: lo dejamos, así puede reintentar sin volver a escribirlo.
    } finally {
      setEnviando(false);
    }
  }

  function alEnviarFormulario(e: React.FormEvent) {
    e.preventDefault();
    enviarMensaje(entrada);
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
      <BarraLateral
        nombreEspacio={espacio?.nombre ?? 'Finanzas'}
        onCerrarSesion={cerrarSesion}
        espacioId={espacio?.id}
        token={token ?? undefined}
      />
      <main
        className="contenido"
        style={{
          maxWidth: 780,
          padding: '40px 48px',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          boxSizing: 'border-box',
        }}
      >
        <header style={{ marginBottom: 20, flexShrink: 0 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Sparkles size={20} strokeWidth={1.75} color="var(--color-accent)" />
            Asistente financiero
          </h1>
          <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
            Responde con tus datos financieros reales. No inventa cifras ni da consejos de
            inversión o fiscales.
          </p>
        </header>

        {espacio ? null : (
          <p className="mensaje-error" style={{ marginBottom: 16 }}>
            {error}
          </p>
        )}

        {espacio && (
          <>
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                paddingRight: 4,
                marginBottom: 16,
              }}
            >
              {mensajes.length === 0 && (
                <div className="tarjeta" style={{ marginBottom: 8 }}>
                  <p className="estado-vacio" style={{ padding: '20px 4px' }}>
                    Pregúntame sobre tu patrimonio, la proyección del mes, tus presupuestos o en
                    qué has gastado más.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {SUGERENCIAS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="boton-secundario"
                        onClick={() => enviarMensaje(s)}
                        disabled={enviando}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mensajes.map((m, i) => (
                <BurbujaMensaje key={i} mensaje={m} />
              ))}

              {enviando && (
                <div style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
                  <div
                    className="tarjeta"
                    style={{ padding: '10px 14px', color: 'var(--color-text-muted)', fontSize: 14 }}
                  >
                    Pensando…
                  </div>
                </div>
              )}

              <div ref={finalRef} />
            </div>

            {error && (
              <p className="mensaje-error" style={{ marginBottom: 12, flexShrink: 0 }}>
                {error}
              </p>
            )}

            <form
              onSubmit={alEnviarFormulario}
              style={{ display: 'flex', gap: 8, flexShrink: 0 }}
            >
              <input
                type="text"
                className="campo-texto"
                placeholder="Escribe tu pregunta…"
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                disabled={enviando}
                autoFocus
              />
              <button
                type="submit"
                className="boton-primario"
                disabled={enviando || entrada.trim().length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
              >
                <Send size={16} strokeWidth={1.75} />
                Enviar
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

function BurbujaMensaje({ mensaje }: { mensaje: Mensaje }) {
  const esUsuario = mensaje.rol === 'usuario';
  return (
    <div style={{ alignSelf: esUsuario ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
      <div
        className={esUsuario ? '' : 'tarjeta'}
        style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius)',
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          background: esUsuario ? 'var(--color-text)' : undefined,
          color: esUsuario ? '#fff' : 'var(--color-text)',
        }}
      >
        {mensaje.contenido}
      </div>
    </div>
  );
}
