'use client';

import { useState } from 'react';
import Link from 'next/link';
import { crearClienteSupabaseNavegador } from '../../lib/supabase-browser';

export default function PaginaRecuperarContrasena() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviarEnlace(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setCargando(true);

    const supabase = crearClienteSupabaseNavegador();
    const { error: errorEnvio } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
    });

    setCargando(false);

    // Mostramos el mismo mensaje haya o no una cuenta con ese email: si
    // devolviéramos un error distinto cuando el email no existe, cualquiera
    // podría usar este formulario para comprobar qué emails están
    // registrados en la app.
    if (errorEnvio && errorEnvio.status !== 400 && errorEnvio.message !== 'User not found') {
      setError(errorEnvio.message);
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <main className="pantalla-centrada">
        <div className="tarjeta" style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>Revisa tu email</h1>
          <p className="texto-ayuda" style={{ margin: 0 }}>
            Si hay una cuenta con el email <strong>{email}</strong>, te hemos enviado un enlace para elegir una
            contraseña nueva.
          </p>
          <Link href="/login" className="boton-primario" style={{ display: 'inline-block', marginTop: 20, textDecoration: 'none' }}>
            Volver a iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pantalla-centrada">
      <div className="tarjeta" style={{ width: '100%', maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>¿Olvidaste tu contraseña?</h1>
        <p className="texto-ayuda" style={{ margin: '0 0 24px' }}>
          Te mandamos un enlace a tu email para elegir una nueva.
        </p>

        <form onSubmit={enviarEnlace} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
              autoFocus
            />
          </label>

          {error && <p className="mensaje-error">{error}</p>}

          <button type="submit" className="boton-primario" disabled={cargando} style={{ marginTop: 8 }}>
            {cargando ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>

        <p className="texto-ayuda" style={{ marginTop: 16, textAlign: 'center' }}>
          <Link href="/login" className="enlace-discreto">Volver a iniciar sesión</Link>
        </p>
      </div>
    </main>
  );
}
