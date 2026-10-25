# Producción (Vercel)

La app está desplegada y en uso desde el 26/10/2026.

| | |
|---|---|
| URL | **https://finanzas-saas-tan.vercel.app** |
| Plataforma | Vercel, plan Hobby (gratuito, uso personal/no comercial) |
| Proyecto Vercel | `finanzas-saas` |
| Root Directory | `apps/web` (monorepo con npm workspaces) |
| Rama de producción | `main` — cada push/merge a `main` redespliega solo |
| Base de datos | Supabase `zhwfegjnhlnuoyxeuwdq`, la misma que en local |

**Por qué Vercel y no el servidor de AWS:** el EC2 del usuario
(t3.micro, 908 MB de RAM, sin swap) aloja los bots de trading. Next.js
no cabe para compilar ahí y, en marcha, dejaría el servidor sin memoria;
el OOM killer de Linux mataría probablemente `bot_alpaca.py`, que es el
proceso más grande. No desplegar nada de esta app en ese servidor.

## Cómo publicar un cambio

1. Rama + PR contra `main`.
2. Si el cambio trae una migración nueva: `supabase db push` **antes**
   de fusionar, para que producción no consulte tablas que aún no existen.
3. Fusionar la PR. Vercel compila y publica en 2-3 minutos (se ve en
   Vercel → Deployments). Si la compilación falla, producción sigue
   sirviendo la versión anterior.

## Variables de entorno (Vercel → Settings → Environment Variables)

Las de Supabase las crea la integración de Supabase en Vercel.

| Variable | Estado | Nota |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | La pone la integración | Debe contener `zhwfegjnhlnuoyxeuwdq` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | La pone la integración | Nombre nuevo de la "anon key" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Añadida a mano | Nombre clásico. El código (`lib/supabase-config.ts`) acepta esta o la anterior y prioriza esta |
| `ANTHROPIC_API_KEY` | Opcional | Sin ella, `/dashboard/chat` responde un 503 controlado y el resto funciona |
| `GOCARDLESS_SECRET_ID` / `GOCARDLESS_SECRET_KEY` | Opcional | Solo para `/dashboard/bancos` |
| `POSTGRES_*`, `SUPABASE_SECRET_KEY`, `SUPABASE_URL`… | Las pone la integración | La app no las usa. `SUPABASE_SECRET_KEY` salta RLS: no usarla nunca desde una ruta que actúa en nombre de un usuario |

Tras cambiar una variable hay que redesplegar (Deployments → ⋮ →
Redeploy) para que surta efecto.

## Supabase Auth (ya configurado)

Supabase → Authentication → URL Configuration:
- **Site URL:** `https://finanzas-saas-tan.vercel.app`
- **Redirect URLs:** `https://finanzas-saas-tan.vercel.app/**` y
  `http://localhost:3000/**`

Si algún día se añade un dominio propio (Vercel → Settings → Domains),
hay que cambiar también estas dos cosas, o los correos de confirmación
y de recuperación de contraseña seguirán llevando a la URL antigua.

## Comprobaciones tras un despliegue importante

- [ ] `/` (landing pública) carga sin sesión.
- [ ] Login con un usuario real y Movimientos / Patrimonio cargan datos.
- [ ] `/recuperar-contrasena` envía un correo cuyo enlace apunta a la URL
      de producción, no a `localhost`.
- [ ] Si hay `ANTHROPIC_API_KEY`: una pregunta en `/dashboard/chat`.

## Notas

- Producción y `npm run dev` en local comparten la misma base de datos
  real: lo que se cambie en local se ve en producción.
- El Supabase gratuito se pausa tras ~7 días sin actividad; si la web da
  errores de conexión, revisar en supabase.com/dashboard si está pausado.
- `xlsx` sigue fijado al CDN de SheetJS (no a npm, por CVE-2023-30533).
  Vercel compila sin problema con esa URL.
