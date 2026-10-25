import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Llama al RPC `completar_registro` (migración 0014): crea el perfil
 * `usuarios` + un espacio propio + membresía 'owner' la primera vez que
 * el usuario autenticado la ejecuta; en cualquier llamada posterior es
 * un no-op que solo devuelve su espacio existente. Seguro de llamar
 * tanto justo tras un signUp() con sesión inmediata como en cada login
 * (cubre el caso de que el proyecto exija confirmar el email antes de
 * dar sesión: el alta real ocurre entonces en ese primer login).
 *
 * Devuelve el id del espacio, o null si el RPC falla — en ese caso el
 * resto de la app cae en el mismo mensaje de "no perteneces a ningún
 * espacio" que ya mostraba antes de que existiera este bootstrap.
 */
export async function completarRegistroSiHaceFalta(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc('completar_registro');
  if (error) {
    console.error('Error completando el registro:', error);
    return null;
  }
  return (data as string) ?? null;
}
