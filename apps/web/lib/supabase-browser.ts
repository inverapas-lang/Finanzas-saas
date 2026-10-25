'use client';

import { createBrowserClient } from '@supabase/ssr';
import { leerConfigSupabase } from './supabase-config';

let cliente: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Cliente Supabase para componentes de cliente (navegador). Usa la anon key
 * y gestiona la sesión del usuario (login/logout) vía cookies, para que las
 * llamadas a nuestra propia API puedan reenviar el token de sesión.
 */
export function crearClienteSupabaseNavegador() {
  if (cliente) return cliente;

  const { url, clavePublica } = leerConfigSupabase();
  cliente = createBrowserClient(url, clavePublica);
  return cliente;
}
