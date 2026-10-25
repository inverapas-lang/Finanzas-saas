# Finanzas SaaS

App de finanzas personales multi-tenant. Backend API-first sobre Supabase (Postgres + Auth + RLS), frontend Next.js con diseño estilo Notion, lógica financiera en paquetes puros y testeados.

## Estructura

```
finanzas-saas/
├── supabase/migrations/        Esquema SQL + Row Level Security (7 migraciones)
├── packages/
│   ├── loan-engine/             Amortización de préstamos: fijo, variable, mixto, amortización anticipada
│   └── projection-engine/       Proyección de fin de mes/año a partir de recurrentes + reales
├── apps/web/                    Next.js: API (app/api/...) + web (app/dashboard/...)
└── api/openapi.yaml             Contrato de la API completa
```

## Estado real — qué está hecho, verificado, y qué falta

| Área | Estado | Verificado cómo |
|---|---|---|
| Base de datos (9 migraciones: núcleo multi-tenant, movimientos, patrimonio, hipotecas/divisas, revisiones de tipo, amortizaciones extra, invitaciones, storage de documentos) | ✅ Aplicada hasta la `0008`; **la `0009` (Storage) todavía no se ha aplicado** | Migraciones 1-8 ejecutadas contra tu Supabase real; la `0009` es nueva de esta ronda |
| `loan-engine` (motor de préstamos) | ✅ | 36 tests, incluida una regresión permanente de un bug real que encontramos |
| `projection-engine` (motor de proyecciones) | ✅ | 9 tests |
| API: `ingresos`, `gastos`, `proyeccion`, `cuentas-bancarias`, `categorias`, `activos`, `pasivos` (+ `cuadro`, `revisiones`, `amortizaciones-extra`, `simular`), `presupuestos`, `espacios/miembros`, `notificaciones`, `exportar`, `chat` | ✅ Implementado | Probado en real, excepto lo añadido en las últimas rondas (ver debajo) |
| Web: login, Panel, Movimientos (+ exportar CSV/Excel/PDF), Presupuestos, Préstamos e hipotecas (+ adjuntos), Activos (+ adjuntos), Usuarios, Notificaciones, Asistente financiero | ✅ Implementado, diseño estilo Notion | Pendiente de tu primera prueba en el PC para todo lo de las últimas rondas (multiusuario, notificaciones, exportación, documentos, chat) |
| Documentos adjuntos (Supabase Storage) | ✅ Código escrito | **No probado ni con la migración aplicada** — requiere `supabase db push` |
| Asistente financiero (chat con IA) | ✅ Completo: `lib/contexto-financiero.ts`, `lib/obtener-datos-financieros.ts`, `lib/validacion-chat.ts`, `app/api/chat/route.ts` y `app/dashboard/chat/page.tsx` | Compila sin errores (`tsc --noEmit`) contra los tipos reales de Next/Supabase/React. Lógica de agregación (patrimonio, gasto por categoría, presupuestos) verificada con 7 casos simulados. La llamada real a la API de Anthropic **sigue sin probarse** — requiere tu propia `ANTHROPIC_API_KEY`; sin ella, el endpoint devuelve un 503 controlado, no rompe la app |
| Despliegue | ✅ En producción en https://finanzas-saas-tan.vercel.app | Vercel (plan gratuito), redespliega solo con cada push a `main`. Ver `DESPLIEGUE.md` |

## Exportación

Desde Movimientos, botones "CSV" y "Excel" descargan todos los ingresos/gastos del espacio.

- **CSV**: separador `;` (no `,`) — Excel en español interpreta la coma como separador decimal, así que con `;` el archivo se abre bien directamente, sin pasos de importación. Lleva BOM UTF-8 para que los acentos no se rompan en Excel/Windows.
- **Excel (.xlsx)**: libro real generado con la librería `xlsx` (SheetJS), con los importes como números (no texto), para poder sumarlos/filtrarlos directamente.
- **PDF**: tabla con los movimientos + totales (ingresos, gastos, saldo) al final, generada con `pdfkit`. Salto de página automático si no caben todas las filas.

**Aviso de verificación**: la función de CSV y el cálculo de totales están verificados de verdad (11 casos ejecutados en total, incluidos caracteres especiales, BOM, y el clásico error de redondeo de coma flotante 0,1+0,2). Las funciones de Excel (`generarXLSX`) y PDF (`generarPDF`) **no se han podido ejecutar** en el entorno donde se escribieron — no había acceso a internet para instalar `xlsx` ni `pdfkit`. Revisadas a mano, pero pruébalas tú antes de confiar en ellas a ciegas.

## Notificaciones: decisión de diseño importante

La tabla `notificaciones` del esquema SQL **no se usa**. Está pensada para que un proceso programado (cron) la rellene periódicamente, y no hemos montado esa infraestructura (requeriría Supabase Edge Functions con triggers de tiempo). En su lugar, `/api/notificaciones` calcula las alertas **al vuelo** en cada petición: pagos/cobros próximos (próximos 7 días) o vencidos, y presupuestos del periodo actual ya superados. Es más simple y nunca se desactualiza, a costa de no guardar histórico de alertas pasadas ni permitir marcarlas como "leídas" — si en el futuro hace falta eso, sí tendría sentido usar la tabla `notificaciones` de verdad con un job programado.

## Invitar a tu mujer o a tu gestor

Desde `/dashboard/usuarios` (solo visible/operable si eres `owner` del espacio):
1. La persona que quieras invitar debe **registrarse primero ella misma** en la aplicación (con su propio email y contraseña) — esta app no crea cuentas ajenas ni envía correos de invitación automáticos, por diseño de seguridad (evita usar la service role desde el navegador).
2. Una vez tenga cuenta, tú introduces su email y eliges su rol (`usuario` = puede editar, `asesor`/`invitado` = solo lectura).
3. La búsqueda del usuario por email pasa por una función SQL (`buscar_usuario_por_email`) que solo devuelve el id si coincide exacto — nunca expone el resto de la tabla de usuarios a otro usuario.

## Asistente financiero (chat con IA)

`/dashboard/chat`: le preguntas por tus números y, si se lo pides, los ajusta.

- **Preguntas:** tiene un resumen de la situación actual (patrimonio, proyección del mes, gasto por categoría de los últimos 3 meses, presupuestos, préstamos) y, para todo lo demás, consulta tus datos con herramientas: categorías, movimientos concretos, totales por mes o categoría de cualquier periodo e histórico de patrimonio línea a línea.
- **Ajustes:** puede proponer modificar, crear o eliminar gastos, ingresos y valores del histórico de patrimonio. **Nunca escribe por su cuenta**: la propuesta aparece como una tarjeta con el valor actual → el nuevo y los botones «Aplicar cambios» / «Descartar». Al aplicar, el navegador llama a las rutas de API de siempre (`/api/gastos`, `/api/ingresos`, `/api/patrimonio-historico-item`) con tu sesión, así que pasan por las mismas validaciones y permisos (RLS) que si lo editaras a mano.

Piezas:
- `app/api/chat/route.ts`: bucle de herramientas con el SDK oficial `@anthropic-ai/sdk`, modelo `claude-opus-5-5` (esfuerzo `medium`), con *fallback* automático de Anthropic si el modelo rechaza una petición. Máximo 10 consultas por mensaje.
- `lib/herramientas-asistente.ts`: definición y ejecución de las herramientas. Leen siempre con el cliente Supabase del usuario, nunca con la service role. `proponer_cambios` valida la propuesta, comprueba que cada id existe en el espacio activo y rellena el «antes» con lo que hay en la base de datos, no con lo que diga la IA.
- `lib/validacion-propuesta.ts`: valida la forma de la propuesta con los mismos validadores que las rutas de API.
- `lib/aplicar-propuesta.ts`: qué petición corresponde a cada cambio y la nota que se añade al historial para que la IA sepa en el siguiente mensaje si la propuesta se aplicó o se descartó.

Configuración: necesita `ANTHROPIC_API_KEY` (console.anthropic.com, de pago por uso, sin relación con tu cuenta de Claude.ai) en `apps/web/.env.local` y en las variables de Vercel. Solo la usa el servidor. Sin ella, `/api/chat` responde un 503 controlado y el resto de la app funciona igual.

Coste: cada mensaje recalcula el resumen y manda el historial completo de la conversación; las preguntas que necesitan varias consultas hacen varias llamadas al modelo. Las conversaciones largas cuestan más por mensaje.

Verificación: la lógica (validación de propuestas, herramientas contra un Supabase simulado, bucle de la ruta con el SDK simulado, construcción de peticiones) está cubierta por tests de `vitest`. **La llamada real a la API de Anthropic no se ha probado todavía** desde este entorno (no hay clave real en `.env.local`).

## Importación de Excel

Desde Movimientos, botón "Importar Excel". Usa las mismas columnas que la exportación (Tipo, Descripción, Categoría, Cuenta, Fecha prevista, Fecha confirmada, Importe, Importe real) — exportar → añadir filas nuevas (históricas o previsiones futuras) → volver a importar es el flujo pensado.

- Categorías que no existen se **crean automáticamente**. Cuentas que no existen **no** se crean solas (para evitar duplicados por una errata de escritura) — el movimiento se importa sin cuenta asociada.
- Admite fechas en `AAAA-MM-DD` o `DD/MM/AAAA`, e importes con coma o punto decimal.
- Procesa todas las filas de una vez y muestra un resumen con el número de fila exacto de cada error — no para en el primer fallo.
- **Decisión de seguridad importante**: cambié la dependencia `xlsx` a la versión distribuida por el propio CDN de SheetJS (`cdn.sheetjs.com`), no la del registro de npm. La versión de npm tiene una vulnerabilidad de "Prototype Pollution" (CVE-2023-30533) sin parchear — el mantenedor solo publica la versión corregida en su propio CDN. Mientras solo exportábamos (escribíamos) Excel, esto no nos afectaba; ahora que importamos (leemos archivos subidos por el usuario), sí era relevante y había que arreglarlo antes de construir esta función, no después.

**Aviso de verificación**: la lógica de validación por fila (`mapearFilaImportada`) está verificada de verdad — 12/12 casos, incluidos formatos de fecha alternativos, importes en formato español, y objetos `Date` reales. La lectura real del archivo Excel con la librería `xlsx` **no se ha podido ejecutar** en este entorno (sin red para instalar ni `xlsx` original ni la versión del CDN). Pruébalo con un archivo real antes de confiar en ello para datos importantes.

## Documentos adjuntos

Cada préstamo/hipoteca y cada activo tiene una sección "Documentos adjuntos" (facturas, escrituras, contratos, tasaciones). Usa Supabase Storage (bucket privado `documentos`, límite 10 MB por archivo).

- La subida va **directa del navegador a Supabase Storage** (no pasa por nuestro servidor) — es el patrón estándar de Supabase, más simple y más rápido que hacerlo pasar por una ruta de API.
- Seguridad: la ruta de cada archivo empieza siempre por el `espacio_id` (`{espacio_id}/{tipo}/{entidad_id}/...`), y las políticas RLS del bucket comprueban ese primer segmento contra `es_miembro`/`tiene_permiso` — mismo modelo de permisos que el resto de la aplicación.
- Las descargas usan enlaces firmados de 60 segundos (`createSignedUrl`), no URLs públicas permanentes.

**Aviso de verificación**: la función que construye las rutas (`construirRutaDocumento`) está verificada de verdad (6/6 casos: tildes, símbolos raros, unicidad, extensión). La subida/descarga real contra Supabase Storage **no se ha podido probar** en este entorno (sin acceso a Supabase desde aquí) — pruébalo tú antes de confiar en ello con documentos importantes.

## Guía paso a paso

### 1. Requisitos previos
- Node.js 20+ en tu ordenador.
- Cuenta gratuita en [supabase.com](https://supabase.com) — ya la tienes creada y con el esquema aplicado.
- Cuenta gratuita en [vercel.com](https://vercel.com) — ya creada; ahí está desplegada la app.

### 2. Variables de entorno
```bash
cd apps/web
cp .env.example .env.local
# Edita .env.local con tu Project URL y anon key (Supabase → Project Settings → API).
# Vale igual la "publishable key" con el nombre NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
```

### 3. Instalar dependencias y correr los tests
```bash
npm install
npm run test
```
Debe salir `36 passed` en `loan-engine` y `9 passed` en `projection-engine`.

### 4. Arrancar en local
```bash
npm run dev
```
Abre `http://localhost:3000` (o el puerto que indique la terminal, si el 3000 está ocupado).

### 5. Aplicar migraciones nuevas cuando las haya
```bash
supabase link --project-ref <tu-project-ref>   # solo si la carpeta ha cambiado de ubicación
supabase db push
```

### 6. Producción
La app está en **https://finanzas-saas-tan.vercel.app**. No hay que desplegar a mano: Vercel está conectado al repositorio de GitHub y publica una versión nueva cada vez que algo llega a `main`. Detalles y checklist en `DESPLIEGUE.md`.

---

## Decisiones de diseño que conviene recordar

- **El motor de amortización nunca inventa valores de Euribor.** Las revisiones de tipo variable/mixto se registran a mano (`/api/pasivos/:id/revisiones`) con el valor real publicado ese día.
- **Los tipos de cambio de divisas** se resuelven contra el día hábil más reciente disponible (no exigen coincidencia exacta de fecha), vía la función SQL `convertir_a_moneda_base`.
- **El cuadro de amortización se recalcula siempre desde el origen** (cuota 1), nunca de forma parcial — es más simple y evita arrastrar un capital pendiente intermedio mal calculado.
- **La valoración automática de activos** (`fuente_valoracion: 'api_externa'`) está bloqueada a propósito: no hay ninguna integración conectada (Idealista y similares son productos B2B de pago, no hay API pública gratuita).
