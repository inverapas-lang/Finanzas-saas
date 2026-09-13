'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { crearClienteSupabaseNavegador } from '../../../../lib/supabase-browser';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

/**
 * A esta página redirige el BANCO (no nuestra app) cuando el usuario
 * termina el consentimiento en su web/app. GoCardless añade sus propios
 * parámetros de estado a la URL, pero el único que usamos es el nuestro
 * propio (`conexion_id`), que pasamos como parte de `redirect` al crear
 * la requisition — así sabemos qué conexión finalizar sin depender del
 * formato exacto de los parámetros de GoCardless.
 */
export default function PaginaCallbackBanco() {
  return (
    <Suspense
      fallback={
        <main className="pantalla-centrada">
          <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
        </main>
      }
    >
      <ContenidoCallbackBanco />
    </Suspense>
  );
}

function ContenidoCallbackBanco() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conexionId = searchParams.get('conexion_id');

  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [mensaje, setMensaje] = useState('Confirmando la vinculación con tu banco…');

  useEffect(() => {
    if (!conexionId) {
      setEstado('error');
      setMensaje('Falta el identificador de la conexión en la URL de vuelta del banco.');
      return;
    }

    const supabase = crearClienteSupabaseNavegador();

    async function finalizar() {
      const { data: sesion } = await supabase.auth.getSession();
      if (!sesion.session) {
        router.push('/login');
        return;
      }

      try {
        const respuesta = await fetch(`/api/bancos/conexiones/${conexionId}/finalizar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${sesion.session.access_token}` },
        });
        const cuerpo = await respuesta.json();
        if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se ha podido completar la vinculación.');

        const numCuentas = cuerpo.data.cuentas.length;
        setEstado('ok');
        setMensaje(`Banco vinculado — ${numCuentas} cuenta${numCuentas === 1 ? '' : 's'} lista${numCuentas === 1 ? '' : 's'} para sincronizar.`);
      } catch (e) {
        setEstado('error');
        setMensaje(e instanceof Error ? e.message : 'Error al completar la vinculación.');
      }
    }

    finalizar();
  }, [conexionId, router]);

  return (
    <main className="pantalla-centrada">
      <div className="tarjeta" style={{ maxWidth: 420, textAlign: 'center', padding: 32 }}>
        {estado === 'cargando' && <Loader2 size={32} className="texto-ayuda" style={{ margin: '0 auto 16px' }} />}
        {estado === 'ok' && (
          <CheckCircle2 size={32} style={{ color: 'var(--color-green-text)', margin: '0 auto 16px' }} />
        )}
        {estado === 'error' && (
          <XCircle size={32} style={{ color: 'var(--color-red-text)', margin: '0 auto 16px' }} />
        )}
        <p style={{ margin: '0 0 16px' }}>{mensaje}</p>
        {estado !== 'cargando' && (
          <Link href="/dashboard/bancos" className="boton-primario" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Volver a Bancos
          </Link>
        )}
      </div>
    </main>
  );
}
