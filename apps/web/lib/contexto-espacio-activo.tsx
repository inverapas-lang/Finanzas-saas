'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { EstadoEspacioActivo } from './useEspacioActivo';

const ContextoEspacioActivo = createContext<EstadoEspacioActivo | null>(null);

/**
 * El Provider vive en app/dashboard/layout.tsx, que llama a
 * useEspacioActivo() UNA sola vez para toda la sección /dashboard. Antes,
 * cada una de las 14 pantallas llamaba al hook por su cuenta: al no haber
 * layout compartido, navegar de una pantalla a otra desmontaba y volvía a
 * montar la barra lateral entera, repitiendo la consulta de sesión y la
 * lista de espacios en cada clic. Con el Provider, eso se resuelve una vez
 * al entrar en el dashboard y las pantallas solo leen el resultado.
 */
export function ProveedorEspacioActivo({
  value,
  children,
}: {
  value: EstadoEspacioActivo;
  children: ReactNode;
}) {
  return <ContextoEspacioActivo.Provider value={value}>{children}</ContextoEspacioActivo.Provider>;
}

export function useEspacioActivoContext(): EstadoEspacioActivo {
  const contexto = useContext(ContextoEspacioActivo);
  if (!contexto) {
    throw new Error('useEspacioActivoContext debe usarse dentro de app/dashboard/layout.tsx');
  }
  return contexto;
}
