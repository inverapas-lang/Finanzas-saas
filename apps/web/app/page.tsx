'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../lib/supabase-browser';
import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  Target,
  Landmark,
  TrendingUp,
  Sparkles,
  Building2,
  Table2,
  ArrowRight,
} from 'lucide-react';

const CARACTERISTICAS = [
  {
    Icono: Receipt,
    titulo: 'Ingresos y gastos, sin perder detalle',
    texto:
      'Registra cada movimiento con su categoría y cuenta, o cárgalos de golpe mes a mes. Mira la evolución en una rejilla tipo hoja de cálculo — concepto a la izquierda, meses en horizontal — o como lista.',
  },
  {
    Icono: PiggyBank,
    titulo: 'Presupuestos que avisan solos',
    texto: 'Define cuánto quieres gastar por categoría y recibe un aviso en cuanto te acercas al límite, no cuando ya lo has superado.',
  },
  {
    Icono: Target,
    titulo: 'Metas de ahorro',
    texto: 'Fondo de emergencia, un viaje, una entrada — pon un objetivo y una fecha, y sigue el progreso sin hacer cuentas a mano.',
  },
  {
    Icono: Landmark,
    titulo: 'Préstamos e hipotecas al detalle',
    texto: 'Cuadro de amortización completo, también para hipotecas a tipo variable o mixto, con revisiones de tipo de interés y amortizaciones anticipadas.',
  },
  {
    Icono: TrendingUp,
    titulo: 'Patrimonio histórico',
    texto: 'Cuentas, inversiones y deudas mes a mes — por bloques o cuenta por cuenta, con gráficos filtrables por fecha y concepto. Sabes de dónde viene tu patrimonio, no solo cuánto es hoy.',
  },
  {
    Icono: Building2,
    titulo: 'Conecta tus bancos',
    texto: 'Sincronización con tus cuentas reales vía Open Banking — los movimientos entran solos, sin teclearlos.',
  },
  {
    Icono: Sparkles,
    titulo: 'Un asistente que conoce tus datos',
    texto: 'Pregúntale por tu patrimonio neto, la proyección de este mes o en qué categoría has gastado más — responde con tus cifras reales, no inventa nada.',
  },
  {
    Icono: Table2,
    titulo: 'Varios espacios, una cuenta',
    texto: 'Finanzas personales, las de un familiar, las de un negocio — cambia de espacio financiero sin cerrar sesión.',
  },
];

const PASOS = [
  {
    numero: '1',
    titulo: 'Crea tu espacio',
    texto: 'Regístrate con tu email — en menos de un minuto tienes tu espacio financiero listo.',
  },
  {
    numero: '2',
    titulo: 'Cuéntale tus números',
    texto: 'Un asistente te pregunta por tu nómina, seguros, suscripciones... y los va guardando según respondes. También puedes importarlo todo de golpe desde un Excel.',
  },
  {
    numero: '3',
    titulo: 'Mira hacia delante',
    texto: 'Proyección del mes, presupuestos, patrimonio — todo actualizado solo, sin hojas de cálculo que mantener a mano.',
  },
];

export default function PaginaRaiz() {
  const router = useRouter();
  const [comprobandoSesion, setComprobandoSesion] = useState(true);

  useEffect(() => {
    const supabase = crearClienteSupabaseNavegador();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/dashboard');
      } else {
        setComprobandoSesion(false);
      }
    });
  }, [router]);

  if (comprobandoSesion) {
    return (
      <main className="pantalla-centrada">
        <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px clamp(16px, 5vw, 48px)',
          maxWidth: 1160,
          margin: '0 auto',
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <LayoutDashboard size={20} strokeWidth={1.75} color="var(--color-accent)" />
          Finanzas
        </span>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/login" className="enlace-discreto" style={{ fontSize: 14 }}>
            Iniciar sesión
          </Link>
          <Link
            href="/registro"
            className="boton-primario"
            style={{ fontSize: 14, padding: '8px 16px', textDecoration: 'none' }}
          >
            Crear cuenta
          </Link>
        </nav>
      </header>

      <section
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: 'clamp(40px, 8vw, 96px) clamp(16px, 5vw, 48px) 48px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 48px)',
            fontWeight: 700,
            lineHeight: 1.15,
            margin: '0 0 20px',
            letterSpacing: '-0.02em',
          }}
        >
          Tus finanzas personales, todas en un sitio
        </h1>
        <p
          style={{
            fontSize: 'clamp(16px, 2vw, 19px)',
            color: 'var(--color-text-muted)',
            margin: '0 0 32px',
            lineHeight: 1.6,
          }}
        >
          Ingresos, gastos, presupuestos, préstamos, inversiones y patrimonio — con proyección de cash-flow y un
          asistente que conoce tus números de verdad. Nada de hojas de cálculo que se quedan desactualizadas.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/registro"
            className="boton-primario"
            style={{ fontSize: 15, padding: '11px 22px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            Empezar gratis
            <ArrowRight size={16} strokeWidth={1.75} />
          </Link>
          <Link
            href="/login"
            className="boton-secundario"
            style={{ fontSize: 15, padding: '11px 22px', textDecoration: 'none' }}
          >
            Ya tengo cuenta
          </Link>
        </div>
      </section>

      <section
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '16px clamp(16px, 5vw, 48px) 80px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20,
          }}
        >
          {CARACTERISTICAS.map(({ Icono, titulo, texto }) => (
            <div key={titulo} className="tarjeta tarjeta-interactiva">
              <Icono size={22} strokeWidth={1.75} color="var(--color-accent)" style={{ marginBottom: 12 }} />
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>{titulo}</h3>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.55 }}>{texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--color-bg-sidebar)', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(48px, 8vw, 80px) clamp(16px, 5vw, 48px)' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', margin: '0 0 40px' }}>
            Listo en tres pasos
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 28,
            }}
          >
            {PASOS.map((paso) => (
              <div key={paso.numero}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--color-accent)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    marginBottom: 14,
                  }}
                >
                  {paso.numero}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>{paso.titulo}</h3>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.55 }}>{paso.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(56px, 10vw, 96px) clamp(16px, 5vw, 48px)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 12px' }}>Empieza cuando quieras</h2>
        <p style={{ fontSize: 15, color: 'var(--color-text-muted)', margin: '0 0 28px' }}>
          Crear tu espacio financiero lleva menos de un minuto.
        </p>
        <Link
          href="/registro"
          className="boton-primario"
          style={{ fontSize: 15, padding: '11px 24px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          Crear cuenta gratis
          <ArrowRight size={16} strokeWidth={1.75} />
        </Link>
      </section>

      <footer
        style={{
          borderTop: '1px solid var(--color-border)',
          padding: '24px clamp(16px, 5vw, 48px)',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 13,
        }}
      >
        Finanzas · hecho para llevar tus cuentas sin hojas de cálculo sueltas
      </footer>
    </main>
  );
}
