# Contexto del proyecto: Finanzas SaaS

App de finanzas personales multi-tenant (backend Supabase + Postgres/RLS,
frontend Next.js estilo Notion, lógica financiera en paquetes puros
testeados). Retomamos el desarrollo aquí después de trabajar el diseño y
parte del código en Claude.ai (chat normal).

## Estructura
```
finanzas-saas/
├── supabase/migrations/        9 migraciones SQL + RLS
├── packages/
│   ├── loan-engine/             Motor de amortización (36 tests, todos pasan)
│   └── projection-engine/       Motor de proyección (9 tests, todos pasan)
├── apps/web/                    Next.js: API (app/api/...) + web (app/dashboard/...)
└── api/openapi.yaml             Contrato de la API
```

## Estado real (verificado, no asumido)

| Área | Estado |
|---|---|
| BBDD: migraciones 1-8 | Aplicadas contra Supabase real. **La 0009 (Storage de documentos) NO se ha aplicado todavía** |
| `loan-engine` / `projection-engine` | ✅ 45 tests reales ejecutados y en verde |
| API (23 endpoints) + Web (7 pantallas) | ✅ Implementado y compila sin errores de tipos (`tsc --noEmit`) |
| Asistente financiero (`/dashboard/chat` + `/api/chat`) | ✅ Código completo (recién añadido). Compila limpio. Lógica de agregación de datos verificada con mocks (7/7 casos). **La llamada real a la API de Anthropic nunca se ha probado** — no había `ANTHROPIC_API_KEY` disponible en el entorno donde se escribió |
| Exportación/Importación Excel (`xlsx`) y PDF (`pdfkit`) | Lógica de validación verificada, pero la lectura/escritura real de archivos **nunca se ha ejecutado** — el entorno de desarrollo anterior no tenía acceso al CDN de SheetJS ni a npm para esas libs |
| Documentos adjuntos (Supabase Storage) | Código escrito, rutas verificadas (6/6 casos), pero subida/descarga real **no probada** |
| Despliegue | Nunca se ha hecho `vercel deploy`. Sigue solo en local |
| Tests en `apps/web` | **No hay ningún framework de tests instalado** (ni vitest, ni ninguno) a diferencia de los dos packages. Las cifras "X/X verificado" que aparecen en el README para funciones de `apps/web/lib` se comprobaron con scripts sueltos que no quedaron guardados en el repo — no hay manera de re-ejecutarlas salvo que se vuelvan a escribir como tests reales |
| `apps/web/tsconfig.json` / `next.config.*` | No estaban en el export original. Next.js debería autogenerarlos en el primer `npm run dev`, pero si algo falla al arrancar, puede ser por ahí |

## Decisión de seguridad importante ya tomada
La dependencia `xlsx` apunta al CDN oficial de SheetJS
(`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), no a la versión de
npm, porque la de npm tiene una vulnerabilidad de Prototype Pollution
(CVE-2023-30533) sin parchear. No la cambies a la versión de npm.

## Qué pediría que hicieras primero, en este orden
1. `npm install` en la raíz y `npm run test` — confirma que los 45 tests
   de los dos motores siguen en verde en este entorno.
2. Aplicar la migración `0009_documentos_storage.sql` contra el Supabase
   real (`supabase db push`) y probar subida/descarga de un documento
   adjunto de verdad.
3. Configurar `ANTHROPIC_API_KEY` en las variables de entorno del cloud
   environment y probar `/dashboard/chat` con una pregunta real
   (ej. "¿cuál es mi patrimonio neto?").
4. Probar de verdad la exportación a Excel y PDF desde Movimientos con
   datos reales (nunca se ha ejecutado esa parte).
5. Cuando lo anterior esté verificado: `vercel deploy` desde `apps/web`.

## Cómo trabajar conmigo en este proyecto
- No des por bueno nada que no hayas ejecutado tú. Si algo "debería
  funcionar" pero no lo has corrido, dilo explícitamente en vez de darlo
  por hecho.
- Sigue el estilo de código existente: nombres de funciones/variables en
  español, separación en `lib/` de lógica pura vs. rutas de API,
  validadores `validacion-*.ts` que lanzan `ErrorApi`, mismo patrón de
  autenticación con `crearClienteSupabaseDeRequest` (nunca uses la
  service role key desde una ruta que actúa en nombre de un usuario).
- Antes de añadir una dependencia nueva, comprueba si ya hay una forma de
  hacerlo con lo que existe en el repo.
