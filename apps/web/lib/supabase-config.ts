/**
 * URL y clave pública de Supabase, compartidas por el cliente de navegador
 * y el de servidor.
 *
 * La clave pública se acepta con dos nombres:
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY: el nombre clásico (el de .env.example).
 * - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: el que crea la integración de
 *   Supabase en Vercel. Supabase renombró la "anon key" a "publishable key";
 *   hacen lo mismo y las dos respetan RLS.
 * Si están las dos, manda ANON_KEY (es la que ya funcionaba en producción).
 *
 * Cada variable se lee con su nombre literal (process.env.NEXT_PUBLIC_...)
 * porque Next.js solo incrusta en el bundle del navegador las referencias
 * escritas así; un acceso dinámico llegaría vacío al cliente.
 */
export function leerConfigSupabase(): { url: string; clavePublica: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clavePublica =
    // || y no ??: una variable creada vacía en Vercel debe dejar pasar a la otra.
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !clavePublica) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o la clave pública (NEXT_PUBLIC_SUPABASE_ANON_KEY o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) en las variables de entorno'
    );
  }

  return { url, clavePublica };
}
