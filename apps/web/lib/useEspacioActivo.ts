'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from './supabase-browser';
import { completarRegistroSiHaceFalta } from './completar-registro';

const CLAVE_LOCALSTORAGE = 'finanzas:espacio-activo-id';

export interface Espacio {
  id: string;
  nombre: string;
}

export interface EstadoEspacioActivo {
  /** true mientras se resuelve la sesión y la lista de espacios — antes de esto, ni token ni espacio son de fiar. */
  cargando: boolean;
  token: string | null;
  espacio: Espacio | null;
  /** Todos los espacios de los que el usuario es miembro, para el selector. */
  espacios: Espacio[];
  /** Cambia el espacio activo (y lo recuerda en este navegador para la próxima visita). */
  cambiarEspacio: (id: string) => void;
  /** Solo se rellena si el usuario no pertenece a ningún espacio — caso raro tras el registro (ver completar_registro). */
  error: string | null;
}

/**
 * Hook compartido por todas las pantallas del dashboard: resuelve la
 * sesión, carga TODOS los espacios del usuario (antes cada pantalla solo
 * cogía el primero con `.limit(1)`, sin forma de cambiar) y recuerda cuál
 * está activo en `localStorage` — es una preferencia de este navegador,
 * no algo que viva en la base de datos, igual que el selector de
 * decimales del panel.
 *
 * Si la lista viene vacía se reintenta una vez tras llamar a
 * completar_registro() (migración 0014): cubre el caso de que este sea
 * el primer login real de un usuario cuyo alta se completa aquí mismo.
 */
export function useEspacioActivo(): EstadoEspacioActivo {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [espacios, setEspacios] = useState<Espacio[]>([]);
  const [espacioId, setEspacioId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = crearClienteSupabaseNavegador();

    async function cargarEspacios() {
      const { data, error: errorEspacios } = await supabase
        .from('espacios_financieros')
        .select('id, nombre')
        .order('created_at', { ascending: true });
      if (errorEspacios) return [];
      return (data ?? []) as Espacio[];
    }

    async function inicializar() {
      const { data: sesion } = await supabase.auth.getSession();
      if (!sesion.session) {
        router.push('/login');
        return;
      }
      setToken(sesion.session.access_token);

      let lista = await cargarEspacios();
      if (lista.length === 0) {
        await completarRegistroSiHaceFalta(supabase);
        lista = await cargarEspacios();
      }

      if (lista.length === 0) {
        setError('No perteneces a ningún espacio financiero todavía.');
        setCargando(false);
        return;
      }

      setEspacios(lista);

      const guardadoId = window.localStorage.getItem(CLAVE_LOCALSTORAGE);
      const activo = lista.find((e) => e.id === guardadoId) ?? lista[0];
      setEspacioId(activo.id);
      setCargando(false);
    }

    inicializar();
  }, [router]);

  const cambiarEspacio = useCallback((id: string) => {
    setEspacioId(id);
    window.localStorage.setItem(CLAVE_LOCALSTORAGE, id);
  }, []);

  const espacio = espacios.find((e) => e.id === espacioId) ?? null;

  return { cargando, token, espacio, espacios, cambiarEspacio, error };
}
