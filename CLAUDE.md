# Finanzas SaaS — contexto para Claude Code

App de finanzas personales multi-tenant (un "espacio financiero" por
familia/unidad), backend Supabase (Postgres + Auth + Storage + RLS),
frontend Next.js 15 (App Router, React 19), lógica financiera pura en
paquetes aparte con sus propios tests. Todo el código y los nombres de
variables/funciones están en español; los comentarios solo explican el
"por qué", nunca el "qué".

Repo: `inverapas-lang/Finanzas-saas`. Rama de trabajo:
`claude/new-session-g97n3o`. El usuario desarrolla desde su PC Windows
(con Supabase real) y yo desde este entorno en la nube (sin acceso a
`*.supabase.co` ni a `cdn.sheetjs.com` — ver "Verificación sin red" más
abajo).

## Estructura

```
apps/web/
  app/api/<recurso>/route.ts          endpoints REST (GET/POST)
  app/api/<recurso>/[id]/route.ts     (PATCH/DELETE)
  app/dashboard/<pantalla>/page.tsx   pantallas del panel
  app/dashboard/layout.tsx            resuelve sesión+espacio UNA vez para toda la sección
  components/                         componentes compartidos (BarraLateral, GraficoSVG, etc.)
  lib/validacion-<recurso>.ts         validación de payloads, lanza ErrorApi
  lib/agregaciones-*.ts               lógica pura de agregación para las pantallas
  lib/*.test.ts                       tests unitarios (vitest)
packages/
  loan-engine/          motor de amortización de préstamos (puro, con tests)
  projection-engine/    motor de proyección de cash-flow (puro, con tests)
supabase/migrations/    0001..0016, SQL + políticas RLS, aplicar en orden con `supabase db push`
scripts/
  importar-historico-excel.mjs         importador puntual del Excel personal del usuario
  datos-importacion/                   datos extraídos del Excel (JSON, NO va en git — datos personales reales)
```

## Convenciones de código (seguidas en todo el repo)

- **Autenticación**: `crearClienteSupabaseDeRequest(request)` en cada
  ruta API — nunca la service role key. La autorización real la decide
  Postgres RLS (`es_miembro(espacio_id)` para SELECT,
  `tiene_permiso(espacio_id, 'xxx:editar')` para INSERT/UPDATE/DELETE).
- **Validación**: cada recurso tiene `lib/validacion-<recurso>.ts` con
  `validarPayloadX` (alta, todo obligatorio) y `validarCambiosX` (PATCH
  parcial, solo valida lo presente). Siempre `Number.isFinite` en
  campos numéricos (no solo signo) — Infinity es JSON válido
  (`1e400`) y coló un bug real antes de añadir esta comprobación en
  todos los validadores.
- **Multi-tenant**: cualquier campo tipo FK que venga del cliente
  (`categoria_id`, `cuenta_id`...) se valida contra el mismo
  `espacio_id` antes de guardar, en la propia ruta — no basta con
  confiar en que el cliente mande el id correcto.
- **Frontend**: `useEspacioActivoContext()` (de
  `lib/contexto-espacio-activo.tsx`) da `{ token, espacio, error }` —
  la sesión y la lista de espacios del usuario se resuelven UNA vez en
  `app/dashboard/layout.tsx`, no en cada pantalla (antes de este
  refactor, cada pantalla repetía esa consulta en cada navegación).
  Cada pantalla solo devuelve `<main className="contenido">`, nunca su
  propio `<BarraLateral>` ni comprobación de sesión.
- **Guarda anti-carrera**: toda pantalla que carga datos propios de un
  espacio usa un `useRef` (`espacioIdVigente`) para ignorar respuestas
  que lleguen tarde tras cambiar de espacio con el selector.
- **Categorías**: soportan un nivel de jerarquía (`categoria_padre_id`).
- **Reglas recurrentes** (`reglas_recurrentes`): plantillas de
  ingresos/gastos periódicos (nómina, seguros...) que alimentan la
  proyección — no generan movimientos por sí solas.

## Funcionalidades implementadas

**Núcleo**: registro/login (email+contraseña, `completar_registro()` en
el primer login resuelve el alta cuando el proyecto exige confirmar
email), ingresos/gastos/cuentas/categorías, presupuestos, metas de
ahorro, activos/pasivos (con motor de amortización e hipotecas a tipo
variable/mixto), proyección de cash-flow, notificaciones de
pagos/cobros próximos, integración bancaria (GoCardless/Open Banking),
asistente financiero por chat (`/dashboard/chat`, requiere
`ANTHROPIC_API_KEY` — sin ella responde 503 controlado, no rompe nada).
El asistente consulta datos con herramientas y puede **proponer**
cambios en gastos, ingresos y patrimonio histórico, pero nunca escribe:
el usuario los aplica desde la tarjeta de la propuesta y se guardan por
las rutas de API normales. No dar a la IA una herramienta que escriba
directamente en la base de datos (ver README > Asistente financiero).

**Multi-espacio**: selector de espacio en la barra lateral
(`useEspacioActivo` + contexto) para usuarios que pertenecen a más de
uno.

**Informes y vistas tipo hoja de cálculo** (pedido explícito del
usuario: "concepto a la izquierda, meses en horizontal, como mi
Excel"):
- `/dashboard/informes`: tabla dinámica categoría × mes con selector
  Tabla/Acordeón (`TablaDinamicaCategorias`).
- `/dashboard/movimientos`: vista "Lista" (de siempre) y vista "Anual"
  (`VistaAnualMovimientos` + `lib/agregaciones-vista-anual.ts`) —
  rejilla categoría × mes editable celda a celda (clic para editar,
  POST si no existe movimiento ese mes, PATCH si ya existe uno solo;
  si hay varios movimientos en la misma categoría/mes la celda muestra
  la suma pero no es editable ahí, se marca con un asterisco).
- `GraficoSVG` (SVG puro, sin librería externa): tipos barras/líneas/
  puntos; con más de 12 etiquetas las rota y muestra solo una de cada
  N para que no se solapen.

**Patrimonio histórico** (`/dashboard/patrimonio`) — el área más
grande añadida esta ronda, dos niveles:
1. **Totales por bloque** (`patrimonio_historico`, migración 0015):
   cuentas, inversiones líquidas/intocables/ilíquidas, deuda — una
   fila por mes. Tabla transpuesta (concepto en filas, fechas en
   columnas), filtro Desde/Hasta, agrupación Por mes/Por año (en vista
   anual cada columna es el cierre del último mes disponible de ese
   año, nunca una suma — el patrimonio es una foto, no un caudal).
2. **Detalle por concepto** (`patrimonio_historico_item`, migración
   0016, sección `DetallePatrimonio` debajo de lo anterior): cada
   cuenta/inversión/deuda por su nombre ("Cta Santander", "Revolut
   Piso Alicante", "Nissan"...), rejilla editable agrupada por bloque
   + gráfico con selector de conceptos (checkboxes buscables) y tipo
   de gráfico. El patrimonio neto se calcula igual en los dos niveles:
   `cuentas + inversiones líquidas + inversiones intocables − deuda`
   (las ilíquidas quedan fuera del neto "de cabecera", son solo
   informativas).

**Asistente de carga inicial** (`/dashboard/bienvenida`, pantalla
"Primeros pasos" en la barra lateral, destino tras `/registro`):
conversación tipo chat-bot que pregunta por bloques (ingresos fijos,
vivienda, seguros, suministros, suscripciones, préstamos, otros) y
guarda cada respuesta al momento (categoría + `reglas_recurrentes` vía
la API normal) — no espera a terminar toda la conversación.

**Importación masiva desde Excel** (`scripts/importar-historico-excel.mjs`,
uso puntual del usuario, no es una pantalla de la app): inicia sesión
con las credenciales reales del usuario (nunca service role), crea
categorías de forma idempotente, carga movimientos mensuales y
patrimonio histórico (totales y detalle). Idempotente también en
movimientos (comprueba qué fechas ya existen antes de insertar) y en
patrimonio (restricción `unique` + `upsert`) — seguro de relanzar si se
interrumpe a mitad. Los datos reales extraídos del Excel del usuario
(`scripts/datos-importacion/*.json`) están en `.gitignore` — nunca se
suben a git, se le pasan al usuario como archivo aparte cuando hace
falta regenerarlos.

## Verificación sin red (este entorno no llega a Supabase ni al CDN de SheetJS)

1. `tsc --noEmit`: `node_modules/.bin/tsc --project apps/web/tsconfig.json --noEmit 2>&1 | grep -v "xlsx"` (los 2-3 errores de `xlsx` son esperados, ese paquete no está instalado aquí).
2. `npm run test` desde la raíz — corre los tres workspaces (`loan-engine`, `projection-engine`, `web`).
3. Para un `next build` completo (recomendable antes de cambios grandes): quitar temporalmente la línea `"xlsx"` de `apps/web/package.json`, crear un stub mínimo en `apps/web/node_modules/xlsx/` (`package.json`+`index.d.ts`+`index.js` con `utils.aoa_to_sheet/json_to_sheet/book_new/book_append_sheet/encode_cell`, `read`, `write`), compilar con `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` dummy, y borrar el stub + restaurar `package.json` al terminar. **Nunca** cambiar `xlsx` a la versión de npm (CVE-2023-30533 sin parchear) — la dependencia apunta a pinned CDN de SheetJS a propósito.
4. Tras cada cambio: commitear en una rama, push y PR contra `main`. Al fusionar, Vercel redespliega producción; si hay migración nueva, aplicarla con `supabase db push` **antes** de fusionar para que producción no use tablas que aún no existen.

## Decisiones ya tomadas que no hay que reabrir

- No hay botón de "entrar sin contraseña" ni bypass de autenticación,
  ni siquiera para pruebas — se pidió explícitamente y se rechazó por
  riesgo de seguridad en una app con datos financieros reales.
- `xlsx` fijado al CDN de SheetJS, no a npm (ver arriba).
- El patrimonio neto de cabecera NUNCA incluye las inversiones
  ilíquidas (vivienda, participaciones bloqueadas...) — son solo
  informativas. Si una pantalla nueva calcula patrimonio neto, debe
  usar la misma fórmula que `calcularPatrimonioNeto` en
  `app/dashboard/patrimonio/page.tsx`.

## Producción (Vercel)

- Desplegado en **https://finanzas-saas-tan.vercel.app** (Vercel plan
  Hobby, proyecto `finanzas-saas`, Root Directory `apps/web`). Cada push
  a `main` redespliega solo. Vercel se eligió frente al EC2 del usuario
  porque ese servidor (t3.micro, 908 MB sin swap) aloja sus bots de
  trading y no hay que arriesgarlos — no desplegar nada ahí.
- Misma base de datos que en local: Supabase `zhwfegjnhlnuoyxeuwdq`,
  con migraciones aplicadas hasta la `0016`. Site URL y Redirect URLs de
  Supabase Auth ya apuntan a la URL de Vercel (y a `localhost:3000`).
- Variables en Vercel: las crea la integración de Supabase, que usa el
  nombre nuevo `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; además hay una
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` añadida a mano. `lib/supabase-config.ts`
  acepta cualquiera de las dos (prioriza ANON).

## Pendiente / sin confirmar

- `ANTHROPIC_API_KEY`: estado real sin confirmar en este entorno — el
  asistente de chat (`/dashboard/chat`) nunca se ha probado con una
  llamada real a la API de Anthropic hasta donde consta en este
  documento.
- El Supabase del usuario es de plan gratuito y se **pausa solo tras
  ~7 días de inactividad** — si un `supabase db push` o un login dan
  error de conexión/timeout, lo primero es comprobar en
  supabase.com/dashboard si el proyecto está pausado y reactivarlo.
