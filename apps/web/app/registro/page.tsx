'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { crearClienteSupabaseNavegador } from '../../lib/supabase-browser';
import { completarRegistroSiHaceFalta } from '../../lib/completar-registro';

export default function PaginaRegistro() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [nombreEspacio, setNombreEspacio] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [revisaEmail, setRevisaEmail] = useState(false);

  async function registrar(evento: React.FormEvent) {
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

    const { data, error: errorSignUp } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre: nombre.trim(),
          nombre_espacio: nombreEspacio.trim() || 'Mi espacio',
        },
      },
    });

    if (errorSignUp) {
      setCargando(false);
      setError(
        errorSignUp.message === 'User already registered'
          ? 'Ya existe una cuenta con este email — inicia sesión en vez de registrarte.'
          : errorSignUp.message
      );
      return;
    }

    // Si el proyecto de Supabase exige confirmar el email antes de dar
    // sesión, signUp() no devuelve sesión todavía — el alta real (crear
    // usuarios/espacio/membresía) se completa en el primer login, no aquí.
    if (!data.session) {
      setCargando(false);
      setRevisaEmail(true);
      return;
    }

    await completarRegistroSiHaceFalta(supabase);
    router.push('/dashboard');
  }

  if (revisaEmail) {
    return (
      <main className="pantalla-centrada">
        <div className="tarjeta" style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>Revisa tu email</h1>
          <p className="texto-ayuda" style={{ margin: 0 }}>
            Te hemos enviado un enlace de confirmación a <strong>{email}</strong>. Ábrelo y luego vuelve aquí para
            iniciar sesión.
          </p>
          <Link href="/login" className="boton-primario" style={{ display: 'inline-block', marginTop: 20, textDecoration: 'none' }}>
            Ir a iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pantalla-centrada">
      <div className="tarjeta" style={{ width: '100%', maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Crear cuenta</h1>
        <p className="texto-ayuda" style={{ margin: '0 0 24px' }}>
          Tu espacio financiero personal, listo en un minuto.
        </p>

        <form onSubmit={registrar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Tu nombre
            <input
              required
              autoComplete="name"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Nombre del espacio <span className="texto-ayuda">(opcional, ej. "Finanzas familiares")</span>
            <input
              value={nombreEspacio}
              onChange={(e) => setNombreEspacio(e.target.value)}
              placeholder="Mi espacio"
              className="campo-texto"
              style={{ marginTop: 6 }}
            />
          </label>

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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="campo-texto"
              style={{ marginTop: 6 }}
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
            {cargando ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="texto-ayuda" style={{ marginTop: 16, textAlign: 'center' }}>
          ¿Ya tienes cuenta? <Link href="/login" className="enlace-discreto">Inicia sesión</Link>
        </p>
      </div>
    </main>
  );
}
