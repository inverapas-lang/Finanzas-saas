# Desplegar a producción (Vercel)

Checklist para cuando quieras hacerlo — pensado para copiar y pegar, sin
que haga falta investigar nada en el momento. Nada de esto lo puedo
ejecutar yo: necesita tu cuenta de Vercel y tu proyecto de Supabase.

## 1. Antes de desplegar

- [ ] `git pull origin claude/new-session-g97n3o` y confirma que
      `npm run dev` funciona en local sin errores.
- [ ] Aplica todas las migraciones pendientes: `supabase db push`
      (comprueba con `supabase migration list` que no falta ninguna de
      las 16).
- [ ] Decide la rama de despliegue: lo más simple es desplegar
      directamente `claude/new-session-g97n3o` (o fusionarla antes a
      `main`/`master` si prefieres que producción siga esa rama en vez
      de la de trabajo — Vercel puede apuntar a cualquiera de las dos).

## 2. Crear el proyecto en Vercel

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importa
   `inverapas-lang/Finanzas-saas` desde GitHub.
2. **Root Directory**: `apps/web` (el repo es un monorepo con npm
   workspaces — Vercel detecta Next.js automáticamente una vez indicas
   esta carpeta).
3. **Framework Preset**: Next.js (debería autodetectarse).
4. Build/Install command: deja los que proponga Vercel por defecto: con
   `Root Directory = apps/web` y los `workspaces` del `package.json`
   raíz, Vercel instala y compila bien sin tocar nada más.

## 3. Variables de entorno (Project Settings → Environment Variables)

Copia los valores reales desde tu `apps/web/.env.local` — nunca subas
ese archivo a git, pero sí se pegan uno a uno en el panel de Vercel.

| Variable | Obligatoria | Nota |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | La de tu proyecto Supabase actual |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Anon key pública, no es secreta |
| `ANTHROPIC_API_KEY` | No | Sin ella, `/dashboard/chat` responde un 503 controlado — el resto de la app funciona igual. Se pide en console.anthropic.com |
| `GOCARDLESS_SECRET_ID` / `GOCARDLESS_SECRET_KEY` | No | Solo si quieres `/dashboard/bancos` (sincronización bancaria) ya en producción |
| `SUPABASE_SERVICE_ROLE_KEY` | No | No la usa ningún código de cara al usuario — solo hace falta si algún día añades un job de administración. No la pongas si no la necesitas |

Márcalas para los tres entornos (Production/Preview/Development) salvo
que quieras separarlos a propósito.

## 4. Paso que se olvida fácil: URLs de Supabase Auth

Los enlaces de confirmación de email y de recuperación de contraseña
que manda Supabase usan la "Site URL" configurada en el proyecto —
si no la actualizas, esos enlaces seguirán apuntando a `localhost:3000`
una vez en producción.

En el dashboard de Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://tu-dominio-de-vercel.vercel.app` (o tu dominio
  propio si lo conectas).
- **Redirect URLs**: añade esa misma URL (y `http://localhost:3000` si
  quieres seguir probando en local a la vez).

## 5. Dominio propio (opcional)

Vercel → tu proyecto → **Settings → Domains** → añade el dominio y
sigue las instrucciones de DNS que te dé (un registro CNAME o A, según
el proveedor). Si lo haces, actualiza también la Site URL de Supabase
del paso 4 al dominio definitivo.

## 6. Después de desplegar — qué probar

- [ ] `/` (landing pública) carga sin sesión.
- [ ] `/registro` crea una cuenta nueva y el email de confirmación (si
      el proyecto lo exige) llega con un enlace que apunta al dominio
      correcto, no a localhost.
- [ ] Login → redirige a `/dashboard/bienvenida` en un usuario nuevo.
- [ ] Una pantalla con datos reales (Movimientos, Patrimonio) carga
      bien — confirma que las variables de Supabase son las correctas.
- [ ] Si configuraste `ANTHROPIC_API_KEY`: prueba una pregunta en
      `/dashboard/chat`.

## Lo que no cambia por desplegar

- Sigue siendo el mismo proyecto de Supabase (misma base de datos) que
  usas en local — no hace falta "migrar datos", production y tu
  `npm run dev` local comparten los mismos datos reales salvo que
  decidas crear un proyecto de Supabase separado para producción (no
  es necesario para un uso personal/familiar).
- `xlsx` sigue fijado al CDN de SheetJS — Vercel sí tiene acceso de
  red normal en build, así que esto no da ningún problema ahí (el
  único sitio donde da problemas es este entorno sandboxed sin acceso
  a `cdn.sheetjs.com`).
