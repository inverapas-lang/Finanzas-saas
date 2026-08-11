'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../lib/supabase-browser';

export default function PaginaRaiz() {
  const router = useRouter();

  useEffect(() => {
    const supabase = crearClienteSupabaseNavegador();
    supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? '/dashboard' : '/login');
    });
  }, [router]);

  return (
    <main className="pantalla-centrada">
      <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
    </main>
  );
}
