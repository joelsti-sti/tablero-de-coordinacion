# Arquitectura — Dashboard Unificado (Tablero de Coordinación)

_Actualizado: 2026-09-25_

## Resumen

Dashboard interno de coordinación de STI Network. Node.js + Express 5,
frontend single-file, consume 3 fuentes de inventario (vTiger CRM / OCS
Inventory / ESET Protect) y métricas de horas técnicas desde vTiger.

## Stack

- Node.js CommonJS + Express 5 (`server.js`, puerto 3005, `listen('0.0.0.0')`).
- Frontend: `public/index.html` (~2100 líneas, vanilla JS + Bootstrap CSS,
  tabs por sección, sin framework). `__VTIGER_URL__` se reemplaza server-side
  con `VTIGER_URL` (`server.js:117-121`).
- BDs:
  - MySQL vTiger: `src/db/crm.js` (pool) + `src/services/crm.service.js`.
  - PostgreSQL cache: `src/db/ocs_pg.js` (pool) + `src/services/ocs-pg.service.js`
    → tablas `sti_web.cache_ocs_computers` y `sti_web.cache_fs`.
- APIs externas:
  - OCS Inventory REST (`src/services/ocs.service.js`): crawl paginado,
    caché en disco `ocs_cache.json` (`.gitignore`).
  - ESET Protect OAuth2 (`src/services/eset.service.js`): regiones
    `us|eu|de|ca|jpn`, caché en disco `eset_cache.json` (gitignored a nivel
    de patrón `*.json`? NO — no está en .gitignore, revisar).

## Módulos

- `server.js` (~425 líneas): arranque, refresh de clientes (60 min), cachés,
  ~28 rutas API, error handler, servir estáticos de `/public` y `/kpi`.
- `src/config/index.js`: centraliza conexiones/endpoints. ⚠️ Passwords en
  defaults hardcodeados (ver coding_rules / pendientes P1).
- `src/services/crm.service.js`: `getCrmComputers`, `getCrmContracts`,
  `getAbonados`.
- `src/services/horas.service.js` (~905 líneas, 20 funciones): consultas
  directas a vTiger service contracts; `EXCLUDED_USERS=(5,6,7,72)`;
  `getKpiMensual` como función más completa.
- `src/services/ocs-pg.service.js`: inventario desde PostgreSQL cache.
- `src/utils/matcher.js`: `matchDevices(crm, ocs, eset)` cruza por
  serial → UUID → MAC (en ese orden) → 7 categorías (enTres, crmOcs, crmEset,
  ocsEset, soloCrm, soloOcs, soloEset).
- `src/utils/normalization.js`: `normalizeMac`, `normalizeSerial`,
  `normalizeHostname`, `sleep`.
- `kpi/` — copia DEV aislada del módulo KPI:
  - `kpi/kpi-dev.service.js` (~530 líneas): `getKpiMensualDev`,
    `getTiempoPorCliente`, `getMantenimientosPendientes`,
    `getProyectosActivosPorTipo`, `getFiltrosDev`. Pool `../src/db/crm`,
    `EXCLUDED_USERS` local.
  - `kpi/kpi-dev.html` (~530 líneas): pestaña KPI standalone para probar
    cambios sin tocar `index.html`.

## Flujos clave

### Comparador CRM/OCS/ESET (`POST /api/compare/:idx`)
1. `refreshClientes()` mezcla `clientes.json` + abonados CRM (`getAbonados`,
   `crm.service.js:151`).
2. `getCrmComputers` lee cuentas + contactos con hasta 3 equipos por contacto
   (campos `cf_1215`..`cf_1251`, `crm.service.js:52`).
3. OCS desde caché en disco (`ocs_cache.json`, tags de `tag_ocs`).
4. ESET desde caché o fetch directo por región.
5. `matchDevices` cruza serial→UUID→MAC.

### Horas técnicas
- ~15 consultas a vTiger sobre `vtiger_servicecontracts` / `vtiger_servicecontractscf`.
- La más completa: `getKpiMensual` (por técnico + KPI tickets + FS sin
  asociar + próximos mantenimientos).

### Inventario OCS desde PostgreSQL
- `sti_web.cache_ocs_computers` (computers, workgroups, summary) y
  `sti_web.cache_fs` (registros de servicio).

## Configuración / env vars

`PORT`, `VTIGER_URL`, `CRM_DB_HOST|PORT|USER|PASSWORD|NAME`,
`OCS_PG_HOST|PORT|USER|PASSWORD|DATABASE`, `OCS_API_URL|USER|PASS`,
`OCS_CACHE_PATH`, `OCS_CACHE_REFRESH_INTERVAL`, `ESET_CACHE_PATH`,
`ESET_MASTER_PASSWORD`, `OCS_CUSTOM_MASTER_PASSWORD`. `.env` gitignored.
NO escribir valores de `.env` en memoria/contexto.

## Datos de referencia

- `clientes.json`: ~65 clientes con `empresa`, `email_eset`, `password_eset`,
  `tag_ocs`, `sheets` (Google Sheets ids). Se mezcla al vuelo con abonados CRM.
- Docs: `ESET_API.md` (integración ESET), `CRM_DATABASE_STRUCTURE.md`
  (estructura vTiger). ⚠️ `CRM_DATABASE_STRUCTURE.md` tiene una nota
  "Missing from Current Implementation" **desactualizada**: equipos 2 y 3 ya
  se leen en `crm.service.js:66-95`.
- `find_tag.js`: script de diagnóstico de campos TAG en vTiger.
- `iniciar-dashboard.bat`: instala deps e inicia el server con navegador.

## Git

- Remote: `https://github.com/joelsti-sti/tablero-de-coordinacion.git`, rama `main`.
- Último commit al 2026-09-24: `98876bb` (vacaciones/ausencias KPI dev).

## Agentes (`.opencode/agents/`)

- 20 subagentes "Agency Agents" instalados el 2026-09-25 (por `@mention`/Task),
  seleccionados según todo el portfolio de `../proyectos_IA`.
- 14 ingeniería + 3 seguridad + 2 gestión de proyectos + 1 testing (lista en
  `.memory/arquitectura.md`). Origen: https://github.com/msitarzewski/agency-agents.