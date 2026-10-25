'use client';

import { useEffect, useRef, useState } from 'react';
import { useEspacioActivoContext } from '../../../lib/contexto-espacio-activo';
import { Sparkles, Send, Check, X } from 'lucide-react';
import type { PropuestaCambios } from '../../../lib/tipos-propuesta';
import {
  construirPeticionCambio,
  formatearValorCampo,
  nombreCampo,
  notaParaHistorial,
  tituloCambio,
  type EstadoPropuesta,
  type ResultadoCambio,
} from '../../../lib/aplicar-propuesta';

interface Mensaje {
  rol: 'usuario' | 'asistente';
  contenido: string;
  propuesta?: PropuestaCambios | null;
  estadoPropuesta?: EstadoPropuesta;
  resultados?: ResultadoCambio[];
}

const SUGERENCIAS = [
  '¿Cuál es mi patrimonio neto ahora mismo?',
  '¿Cuánto gasté en total el año pasado, mes a mes?',
  '¿En qué categoría he gastado más los últimos 3 meses?',
  'Cambia el importe de la luz de este mes a 85 €',
];

/**
 * Lo que se manda a /api/chat: el texto de cada mensaje y, en los del
 * asistente con propuesta, una nota con los cambios y lo que hizo el
 * usuario con ellos (ver notaParaHistorial).
 */
function historialParaApi(mensajes: Mensaje[]) {
  return mensajes.map((m) => ({
    rol: m.rol,
    contenido: m.propuesta
      ? `${m.contenido}\n\n${notaParaHistorial(m.propuesta, m.estadoPropuesta ?? 'pendiente', m.resultados)}`
      : m.contenido,
  }));
}

export default function PaginaChat() {
  const { token, espacio, error: errorEspacio } = useEspacioActivoContext();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finalRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, enviando]);

  const aplicandoAlguna = mensajes.some((m) => m.estadoPropuesta === 'aplicando');

  async function enviarMensaje(texto: string) {
    const contenido = texto.trim();
    if (!contenido || enviando || aplicandoAlguna || !espacio || !token) return;

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
          mensajes: historialParaApi(historialConNuevoMensaje),
        }),
      });

      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(cuerpo.error ?? 'No se ha podido contactar con el asistente.');
      }

      const nuevo: Mensaje = {
        rol: 'asistente',
        contenido: cuerpo.data.contenido,
        propuesta: cuerpo.data.propuesta ?? null,
        estadoPropuesta: cuerpo.data.propuesta ? 'pendiente' : undefined,
      };
      setMensajes([...historialConNuevoMensaje, nuevo]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al hablar con el asistente.');
      // El mensaje del usuario se queda en el historial visible, así puede
      // reintentar sin volver a escribirlo.
    } finally {
      setEnviando(false);
    }
  }

  function actualizarMensaje(indice: number, cambios: Partial<Mensaje>) {
    setMensajes((previos) => previos.map((m, i) => (i === indice ? { ...m, ...cambios } : m)));
  }

  /**
   * Aplica los cambios uno a uno con las rutas de API normales. Si alguno
   * falla se sigue con el resto y se marca cuál falló: cada cambio es
   * independiente y así el usuario ve exactamente qué quedó guardado.
   */
  async function aplicarPropuesta(indice: number) {
    const propuesta = mensajes[indice]?.propuesta;
    if (!propuesta || !espacio || !token) return;

    actualizarMensaje(indice, { estadoPropuesta: 'aplicando' });
    const resultados: ResultadoCambio[] = [];
    for (const cambio of propuesta.cambios) {
      const peticion = construirPeticionCambio(cambio, espacio.id);
      try {
        const respuesta = await fetch(peticion.url, {
          method: peticion.metodo,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(peticion.cuerpo ? { 'content-type': 'application/json' } : {}),
          },
          body: peticion.cuerpo ? JSON.stringify(peticion.cuerpo) : undefined,
        });
        if (respuesta.ok) {
          resultados.push({ ok: true });
        } else {
          const cuerpo = await respuesta.json().catch(() => ({}));
          resultados.push({ ok: false, error: cuerpo.error ?? `Error ${respuesta.status}` });
        }
      } catch {
        resultados.push({ ok: false, error: 'Sin conexión con el servidor' });
      }
    }
    actualizarMensaje(indice, { estadoPropuesta: 'aplicada', resultados });
  }

  function alEnviarFormulario(e: React.FormEvent) {
    e.preventDefault();
    enviarMensaje(entrada);
  }

  return (
      <main
        className="contenido"
        style={{
          maxWidth: 780,
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
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
            Pregunta por tus números o pídele que los ajuste. Los cambios que proponga no se
            guardan hasta que pulses «Aplicar».
          </p>
        </header>

        {espacio ? null : (
          <p className="mensaje-error" style={{ marginBottom: 16 }}>
            {errorEspacio || error}
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
                    Pregúntame por tu patrimonio, tus gastos e ingresos de cualquier mes o año, o
                    pídeme que corrija, añada o borre un movimiento.
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
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <BurbujaMensaje mensaje={m} />
                  {m.propuesta && (
                    <TarjetaPropuesta
                      propuesta={m.propuesta}
                      estado={m.estadoPropuesta ?? 'pendiente'}
                      resultados={m.resultados}
                      bloqueada={enviando || aplicandoAlguna}
                      onAplicar={() => aplicarPropuesta(i)}
                      onDescartar={() => actualizarMensaje(i, { estadoPropuesta: 'descartada' })}
                    />
                  )}
                </div>
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
                placeholder="Pregunta o pide un ajuste…"
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                disabled={enviando}
                autoFocus
              />
              <button
                type="submit"
                className="boton-primario"
                disabled={enviando || aplicandoAlguna || entrada.trim().length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
              >
                <Send size={16} strokeWidth={1.75} />
                Enviar
              </button>
            </form>
          </>
        )}
      </main>
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

function TarjetaPropuesta({
  propuesta,
  estado,
  resultados,
  bloqueada,
  onAplicar,
  onDescartar,
}: {
  propuesta: PropuestaCambios;
  estado: EstadoPropuesta;
  resultados?: ResultadoCambio[];
  bloqueada: boolean;
  onAplicar: () => void;
  onDescartar: () => void;
}) {
  const fallidos = resultados?.filter((r) => !r.ok).length ?? 0;

  return (
    <div className="tarjeta" style={{ alignSelf: 'flex-start', width: '100%', maxWidth: 620, fontSize: 14 }}>
      <div className="etiqueta-mayus" style={{ marginBottom: 6 }}>
        Cambios propuestos ({propuesta.cambios.length})
      </div>
      <p style={{ margin: '0 0 12px' }}>{propuesta.resumen}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {propuesta.cambios.map((cambio, i) => {
          const resultado = resultados?.[i];
          const campos =
            cambio.accion === 'eliminar'
              ? Object.keys(cambio.antes ?? {})
              : Object.keys(cambio.valores);
          return (
            <div
              key={i}
              style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}
            >
              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                {resultado && (resultado.ok ? (
                  <Check size={14} color="var(--color-green-text)" />
                ) : (
                  <X size={14} color="var(--color-red-text)" />
                ))}
                {tituloCambio(cambio)}
              </div>
              {campos.map((campo) => (
                <div
                  key={campo}
                  style={{ display: 'flex', gap: 8, color: 'var(--color-text-muted)', marginTop: 2 }}
                >
                  <span style={{ minWidth: 130 }}>{nombreCampo(campo)}</span>
                  {cambio.accion === 'eliminar' ? (
                    <span style={{ textDecoration: 'line-through' }}>
                      {formatearValorCampo(campo, cambio.antes?.[campo], propuesta.categorias)}
                    </span>
                  ) : (
                    <span>
                      {cambio.antes && (
                        <>
                          {formatearValorCampo(campo, cambio.antes[campo], propuesta.categorias)}
                          {' → '}
                        </>
                      )}
                      <strong style={{ color: 'var(--color-text)' }}>
                        {formatearValorCampo(campo, cambio.valores[campo], propuesta.categorias)}
                      </strong>
                    </span>
                  )}
                </div>
              ))}
              {resultado && !resultado.ok && (
                <div style={{ color: 'var(--color-red-text)', marginTop: 2 }}>{resultado.error}</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        {estado === 'pendiente' && (
          <>
            <button type="button" className="boton-primario" onClick={onAplicar} disabled={bloqueada}>
              Aplicar cambios
            </button>
            <button type="button" className="boton-secundario" onClick={onDescartar} disabled={bloqueada}>
              Descartar
            </button>
          </>
        )}
        {estado === 'aplicando' && <span className="texto-ayuda">Aplicando cambios…</span>}
        {estado === 'aplicada' && (
          <span style={{ color: fallidos ? 'var(--color-red-text)' : 'var(--color-green-text)' }}>
            {fallidos
              ? `Aplicada con errores: ${fallidos} de ${propuesta.cambios.length} cambios no se guardaron.`
              : 'Cambios aplicados.'}
          </span>
        )}
        {estado === 'descartada' && <span className="texto-ayuda">Propuesta descartada. No se ha cambiado nada.</span>}
      </div>
    </div>
  );
}
