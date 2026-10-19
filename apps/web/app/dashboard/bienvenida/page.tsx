'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useEspacioActivoContext } from '../../../lib/contexto-espacio-activo';
import { obtenerOCrearCategoria } from '../../../lib/categoria-cliente';
import { formatearMoneda } from '../../../lib/formato';
import { Sparkles, Check } from 'lucide-react';

type Periodicidad = 'semanal' | 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

const ETIQUETA_PERIODICIDAD: Record<Periodicidad, string> = {
  semanal: 'cada semana',
  mensual: 'cada mes',
  bimestral: 'cada 2 meses',
  trimestral: 'cada 3 meses',
  semestral: 'cada 6 meses',
  anual: 'cada año',
};

interface Seccion {
  clave: string;
  tipo: 'ingreso' | 'gasto';
  categoriaNombre: string;
  pregunta: string;
  ejemplo: string;
  periodicidadPorDefecto: Periodicidad;
}

const SECCIONES: Seccion[] = [
  {
    clave: 'ingresos',
    tipo: 'ingreso',
    categoriaNombre: 'Ingresos fijos',
    pregunta: '¿Tienes algún ingreso fijo que cobres regularmente — nómina, pensión, una renta que cobras...?',
    ejemplo: 'Nómina',
    periodicidadPorDefecto: 'mensual',
  },
  {
    clave: 'vivienda',
    tipo: 'gasto',
    categoriaNombre: 'Vivienda',
    pregunta: '¿Pagas alquiler o hipoteca?',
    ejemplo: 'Alquiler',
    periodicidadPorDefecto: 'mensual',
  },
  {
    clave: 'seguros',
    tipo: 'gasto',
    categoriaNombre: 'Seguros',
    pregunta: '¿Tienes seguros — hogar, coche, vida, salud...?',
    ejemplo: 'Seguro de hogar',
    periodicidadPorDefecto: 'anual',
  },
  {
    clave: 'suministros',
    tipo: 'gasto',
    categoriaNombre: 'Suministros',
    pregunta: '¿Pagas suministros fijos — luz, agua, gas, internet, móvil...?',
    ejemplo: 'Luz',
    periodicidadPorDefecto: 'mensual',
  },
  {
    clave: 'suscripciones',
    tipo: 'gasto',
    categoriaNombre: 'Suscripciones',
    pregunta: '¿Tienes suscripciones — streaming, gimnasio, software...?',
    ejemplo: 'Netflix',
    periodicidadPorDefecto: 'mensual',
  },
  {
    clave: 'prestamos',
    tipo: 'gasto',
    categoriaNombre: 'Préstamos',
    pregunta: '¿Pagas algún préstamo o tarjeta a plazos?',
    ejemplo: 'Préstamo del coche',
    periodicidadPorDefecto: 'mensual',
  },
  {
    clave: 'otros',
    tipo: 'gasto',
    categoriaNombre: 'Otros gastos fijos',
    pregunta: '¿Algún otro gasto fijo que no hayamos cubierto — cuota del gimnasio, colegio...?',
    ejemplo: 'Cuota del gimnasio',
    periodicidadPorDefecto: 'mensual',
  },
];

interface Turno {
  id: string;
  rol: 'bot' | 'usuario';
  contenido: React.ReactNode;
}

type Fase = 'gate' | 'formulario' | 'otro' | 'fin';

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

let contadorId = 0;
function idUnico(): string {
  contadorId += 1;
  return `t${contadorId}`;
}

export default function PaginaBienvenida() {
  const { token, espacio, error: errorEspacio } = useEspacioActivoContext();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [indiceSeccion, setIndiceSeccion] = useState(0);
  const [fase, setFase] = useState<Fase>('gate');
  const [totalGuardados, setTotalGuardados] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const yaEmpezado = useRef(false);

  useEffect(() => {
    finalRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turnos, fase]);

  // Arranca la conversación en cuanto sabemos a qué espacio pertenece el
  // usuario — solo una vez (StrictMode en desarrollo monta los efectos dos
  // veces, y aquí duplicaría la primera pregunta si no se protegiera).
  useEffect(() => {
    if (!espacio || yaEmpezado.current) return;
    yaEmpezado.current = true;
    pushBot(
      `¡Hola! Vamos a registrar tus ingresos y gastos fijos para que la app empiece a trabajar para ti — ` +
        `te haré unas preguntas rápidas y voy guardando cada respuesta al momento, así que puedes parar cuando quieras ` +
        `y seguir luego desde Reglas recurrentes.`
    );
    pushBot(SECCIONES[0].pregunta);
  }, [espacio]);

  function pushBot(contenido: React.ReactNode) {
    setTurnos((t) => [...t, { id: idUnico(), rol: 'bot', contenido }]);
  }
  function pushUsuario(contenido: React.ReactNode) {
    setTurnos((t) => [...t, { id: idUnico(), rol: 'usuario', contenido }]);
  }

  function siguienteSeccion() {
    const siguiente = indiceSeccion + 1;
    if (siguiente >= SECCIONES.length) {
      setFase('fin');
      pushBot(
        <span>
          Con esto ya tienes lo principal registrado
          {totalGuardados > 0 ? ` (${totalGuardados} ${totalGuardados === 1 ? 'concepto' : 'conceptos'})` : ''}. Puedes
          revisarlo y ajustarlo en{' '}
          <Link href="/dashboard/reglas-recurrentes" className="enlace-discreto">
            Reglas recurrentes
          </Link>
          , o ver ya la proyección en el{' '}
          <Link href="/dashboard" className="enlace-discreto">
            Panel
          </Link>
          .
        </span>
      );
      return;
    }
    setIndiceSeccion(siguiente);
    setFase('gate');
    pushBot(SECCIONES[siguiente].pregunta);
  }

  function responderGate(si: boolean) {
    pushUsuario(si ? 'Sí' : 'No');
    if (si) {
      pushBot('Perfecto, cuéntame los detalles:');
      setFase('formulario');
    } else {
      siguienteSeccion();
    }
  }

  function responderOtro(si: boolean) {
    pushUsuario(si ? 'Sí, añadir otro' : 'No, continuar');
    if (si) {
      setFase('formulario');
    } else {
      siguienteSeccion();
    }
  }

  async function guardarItem(datos: { nombre: string; importe: number; periodicidad: Periodicidad; fechaInicio: string }) {
    if (!token || !espacio) return;
    const seccion = SECCIONES[indiceSeccion];
    setError(null);
    try {
      const categoriaId = await obtenerOCrearCategoria(token, espacio.id, seccion.tipo, seccion.categoriaNombre);
      const respuesta = await fetch('/api/reglas-recurrentes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacio_id: espacio.id,
          tipo: seccion.tipo,
          categoria_id: categoriaId,
          descripcion: datos.nombre,
          importe: datos.importe,
          periodicidad: datos.periodicidad,
          fecha_inicio: datos.fechaInicio,
        }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json();
        throw new Error(cuerpo.error ?? 'No se ha podido guardar.');
      }

      pushUsuario(
        `${datos.nombre} — ${formatearMoneda(datos.importe)} ${ETIQUETA_PERIODICIDAD[datos.periodicidad]}`
      );
      pushBot(
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Check size={15} color="var(--color-green-text)" />
          Guardado en {seccion.categoriaNombre}.
        </span>
      );
      setTotalGuardados((n) => n + 1);
      pushBot(`¿Quieres añadir otro de "${seccion.categoriaNombre}", o seguimos?`);
      setFase('otro');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    }
  }

  const seccionActual = SECCIONES[indiceSeccion];

  return (
    <main
      className="contenido"
      style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', height: '100dvh', boxSizing: 'border-box' }}
    >
      <header style={{ marginBottom: 20, flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={20} strokeWidth={1.75} color="var(--color-accent)" />
          Primeros pasos
        </h1>
        <p className="texto-ayuda" style={{ margin: '4px 0 0' }}>
          Vamos registrando tus ingresos y gastos fijos uno a uno — cada respuesta se guarda al momento, no hace
          falta terminar todo de una vez.
        </p>
      </header>

      {errorEspacio && <p className="mensaje-error" style={{ marginBottom: 16 }}>{errorEspacio}</p>}

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
            {turnos.map((t) => (
              <Burbuja key={t.id} turno={t} />
            ))}

            {fase === 'gate' && (
              <BurbujaAcciones>
                <button className="boton-primario" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => responderGate(true)}>
                  Sí
                </button>
                <button className="boton-secundario" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => responderGate(false)}>
                  No
                </button>
              </BurbujaAcciones>
            )}

            {fase === 'formulario' && (
              <FormularioItem
                ejemplo={seccionActual.ejemplo}
                periodicidadPorDefecto={seccionActual.periodicidadPorDefecto}
                onGuardar={guardarItem}
              />
            )}

            {fase === 'otro' && (
              <BurbujaAcciones>
                <button className="boton-primario" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => responderOtro(true)}>
                  Sí, añadir otro
                </button>
                <button className="boton-secundario" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => responderOtro(false)}>
                  No, continuar
                </button>
              </BurbujaAcciones>
            )}

            {fase === 'fin' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href="/dashboard" className="boton-primario" style={{ fontSize: 13, padding: '6px 14px', textDecoration: 'none' }}>
                  Ir al panel
                </Link>
                <Link
                  href="/dashboard/reglas-recurrentes"
                  className="boton-secundario"
                  style={{ fontSize: 13, padding: '6px 14px', textDecoration: 'none' }}
                >
                  Ver reglas recurrentes
                </Link>
              </div>
            )}

            <div ref={finalRef} />
          </div>

          {error && <p className="mensaje-error" style={{ marginBottom: 12, flexShrink: 0 }}>{error}</p>}
        </>
      )}
    </main>
  );
}

function Burbuja({ turno }: { turno: Turno }) {
  const esUsuario = turno.rol === 'usuario';
  return (
    <div style={{ alignSelf: esUsuario ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
      <div
        className={esUsuario ? '' : 'tarjeta'}
        style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius)',
          fontSize: 14,
          lineHeight: 1.5,
          background: esUsuario ? 'var(--color-text)' : undefined,
          color: esUsuario ? '#fff' : 'var(--color-text)',
        }}
      >
        {turno.contenido}
      </div>
    </div>
  );
}

function BurbujaAcciones({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 8 }}>
      {children}
    </div>
  );
}

function FormularioItem({
  ejemplo,
  periodicidadPorDefecto,
  onGuardar,
}: {
  ejemplo: string;
  periodicidadPorDefecto: Periodicidad;
  onGuardar: (datos: { nombre: string; importe: number; periodicidad: Periodicidad; fechaInicio: string }) => Promise<void>;
}) {
  const [nombre, setNombre] = useState('');
  const [importe, setImporte] = useState('');
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(periodicidadPorDefecto);
  const [fechaInicio, setFechaInicio] = useState(hoyIso());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    const importeNumero = Number(importe);
    if (!nombre.trim()) {
      setError('Ponle un nombre.');
      return;
    }
    if (!Number.isFinite(importeNumero) || importeNumero <= 0) {
      setError('El importe tiene que ser mayor que 0.');
      return;
    }
    setGuardando(true);
    try {
      await onGuardar({ nombre: nombre.trim(), importe: importeNumero, periodicidad, fechaInicio });
      setNombre('');
      setImporte('');
      setPeriodicidad(periodicidadPorDefecto);
      setFechaInicio(hoyIso());
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      className="tarjeta"
      style={{ alignSelf: 'flex-start', maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <label style={{ fontSize: 13, fontWeight: 500 }}>
        Nombre
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={ejemplo}
          className="campo-texto"
          style={{ marginTop: 4 }}
        />
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 110 }}>
          Importe (€)
          <input
            type="number"
            step="0.01"
            min="0"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 130 }}>
          Frecuencia
          <select
            value={periodicidad}
            onChange={(e) => setPeriodicidad(e.target.value as Periodicidad)}
            className="campo-texto"
            style={{ marginTop: 4 }}
          >
            {(Object.entries(ETIQUETA_PERIODICIDAD) as [Periodicidad, string][]).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 130 }}>
          Próximo cobro/pago <span className="texto-ayuda">(opcional)</span>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="campo-texto"
            style={{ marginTop: 4 }}
          />
        </label>
      </div>
      {error && <p className="mensaje-error" style={{ margin: 0 }}>{error}</p>}
      <button type="submit" className="boton-primario" disabled={guardando} style={{ alignSelf: 'flex-start', fontSize: 13, padding: '6px 16px' }}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}
