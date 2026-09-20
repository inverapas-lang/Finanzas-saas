'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { crearClienteSupabaseNavegador } from '../../lib/supabase-browser';
import { completarRegistroSiHaceFalta } from '../../lib/completar-registro';

export default function PaginaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function iniciarSesion(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setCargando(true);

    const supabase = crearClienteSupabaseNavegador();
    const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });

    setCargando(false);

    if (errorLogin) {
      setError(
        errorLogin.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos.'
          : errorLogin.message
      );
      return;
    }

    // No-op para quien ya tiene perfil; para un alta cuyo primer login
    // es este (proyecto con confirmación de email obligatoria), es aquí
    // donde de verdad se crea su espacio por primera vez.
    await completarRegistroSiHaceFalta(supabase);

    router.push('/dashboard');
  }

  return (
    <main className="pantalla-centrada">
      <div className="tarjeta" style={{ width: '100%', maxWidth: 380 }}>
        <h1
          style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}
        >
          Finanzas
        </h1>
        <p className="texto-ayuda" style={{ margin: '0 0 24px' }}>
          Accede a tu espacio financiero.
        </p>

        <form onSubmit={iniciarSesion} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Contraseña
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>

          {error && <p className="mensaje-error">{error}</p>}

          <button type="submit" className="boton-primario" disabled={cargando} style={{ marginTop: 8 }}>
            {cargando ? 'Accediendo…' : 'Acceder'}
          </button>
        </form>

        <p className="texto-ayuda" style={{ marginTop: 16, textAlign: 'center' }}>
          ¿No tienes cuenta? <Link href="/registro" className="enlace-discreto">Regístrate</Link>
        </p>
      </div>
    </main>
  );
}
