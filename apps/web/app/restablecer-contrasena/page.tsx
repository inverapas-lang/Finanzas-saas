'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteSupabaseNavegador } from '../../lib/supabase-browser';

export default function PaginaRestablecerContrasena() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardarContrasena(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmarPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    const supabase = crearClienteSupabaseNavegador();
    const { error: errorActualizar } = await supabase.auth.updateUser({ password });
    setCargando(false);

    if (errorActualizar) {
      // El caso más probable aquí es un enlace caducado o ya usado — el
      // cliente de Supabase nunca llegó a tener una sesión de
      // recuperación válida, así que updateUser falla con "Auth session
      // missing" o similar en vez de un error claro de "enlace caducado".
      setError(
        errorActualizar.message.toLowerCase().includes('session')
          ? 'El enlace ha caducado o ya se ha usado. Pide uno nuevo desde "¿Olvidaste tu contraseña?".'
          : errorActualizar.message
      );
      return;
    }

    router.push('/login?mensaje=' + encodeURIComponent('Contraseña actualizada. Inicia sesión con la nueva.'));
  }

  return (
    <main className="pantalla-centrada">
      <div className="tarjeta" style={{ width: '100%', maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Elige una contraseña nueva</h1>
        <p className="texto-ayuda" style={{ margin: '0 0 24px' }}>
          Escríbela dos veces para confirmarla.
        </p>

        <form onSubmit={guardarContrasena} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Contraseña nueva
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
              autoFocus
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Repite la contraseña
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmarPassword}
              onChange={(e) => setConfirmarPassword(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>

          {error && <p className="mensaje-error">{error}</p>}

          <button type="submit" className="boton-primario" disabled={cargando} style={{ marginTop: 8 }}>
            {cargando ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </main>
  );
}
