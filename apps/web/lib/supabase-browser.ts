'use client';

import { createBrowserClient } from '@supabase/ssr';

let cliente: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Cliente Supabase para componentes de cliente (navegador). Usa la anon key
 * y gestiona la sesión del usuario (login/logout) vía cookies, para que las
 * llamadas a nuestra propia API puedan reenviar el token de sesión.
 */
export function crearClienteSupabaseNavegador() {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  cliente = createBrowserClient(url, anonKey);
  return cliente;
}
