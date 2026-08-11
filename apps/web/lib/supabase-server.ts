import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

/**
 * Crea un cliente Supabase autenticado como el usuario de la petición
 * (no con la service role). Esto es intencional: dejamos que Postgres RLS
 * (definido en supabase/migrations) sea quien decide qué puede leer/escribir
 * cada usuario, en vez de reimplementar esa lógica de permisos aquí.
 *
 * La API nunca debe usar la service role para operaciones de usuario:
 * eso saltaría RLS y rompería el aislamiento multi-tenant.
 */
export function crearClienteSupabaseDeRequest(request: NextRequest): SupabaseClient {
  const authHeader = request.headers.get('authorization');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno'
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });
}

export class ErrorApi extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
