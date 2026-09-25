# Convenciones de código — Dashboard Unificado

_Actualizado: 2026-09-25_

## Reglas generales

- Node.js **CommonJS** (no ESM). `require()`/`module.exports`.
- Idioma: **español** en nombres de variables/columnas y comentarios. Sin
  comentarios salvo que se pidan. Estilo de AUSENCIA de comentarios mínimos.
- Frontend: vanilla JS + Bootstrap (vía CDN en `index.html`), sin framework.
- Payloads de API en español/camelCase (`horas_presencial`, `tag_ocs`, etc.).
- Sin scripts de lint/test reales (`npm test` = placeholder).

## Fuentes de datos (importante al tocar queries)

- MySQL vTiger: pool en `src/db/crm.js` (usa `process.env.CRM_DB_*`).
  Servicios pueden crear conexión propia (`crm.service.js`) o usar el pool
  (`horas.service.js`, `kpi-dev.service.js`).
- PostgreSQL cache: pool `src/db/ocs_pg.js`, solo tablas `sti_web.*`.
- `EXCLUDED_USERS = '(5, 6, 7, 72)'` (usuarios a excluir) — definido localmente
  en `horas.service.js:3` y `kpi/kpi-dev.service.js:3`.
- `cf_` son campos custom de vTiger. Campos clave documentados en
  `CRM_DATABASE_STRUCTURE.md` (⚠️ su nota "Missing from Current Implementation"
  está desactualizada: equipos 2 y 3 de contactos ya se leen).

## Reglas del módulo KPI DEV (`kpi/`)

- `kpi/kpi-dev.*` es una **copia aislada** para desarrollo: no tocar
  `horas.service.js`/`public/index.html` salvo que se pida explícitamente.
- Cambios aprobados en uso real se replican después en el dashboard principal.
- Rutas DEV son aditivas (`/api/kpi-mensual-dev`, `/api/kpi-dev/*`).

## Seguridad (obligatorio)

- **NUNCA** escribir credenciales, contraseñas ni contenido de `.env` en
  `.memory/`, `.opencontext/`, docs versionados ni commits (se suben a GitHub).
- No agregar NUEVOS defaults hardcodeados con contraseñas.
  Pendiente (P1): eliminar los existentes en `src/config/index.js:4-15`,
  `src/db/crm.js:4-8`, `src/db/ocs_pg.js:4-8` y rotar passwords.
- Pendiente (P2): CORS abierto (`server.js:27`) y `listen('0.0.0.0')`
  (`server.js:420`) sin auth — NO empeorar; documentado en `.memory/pendientes.md`.

## Cachés en disco

- OCS: `ocs_cache.json` (gitignored). ESET: `eset_cache.json` (patrón en
  `src/services/eset.service.js:12`; revisar si debe ir a `.gitignore`).
- Cargar caché una sola vez al arranque; gatillar recarga con
  `/api/load-ocs-cache` y `/api/load-eset-cache`.

## Memoria

- Usar `.memory/` (banco versionado, skill `memoria`) y OpenContext
  `.opencontext/` para registrar decisiones/errores/cambios con fecha
  `YYYY-MM-DD` y referencias `archivo:línea`.
- Entradas breves, append con la fecha más reciente primero.