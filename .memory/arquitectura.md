# Arquitectura — Dashboard Unificado

_Última actualización: 2026-09-25_

## Resumen

Dashboard interno de coordinación. Node.js + Express 5, frontend single-file,
consume 3 fuentes de inventario (vTiger CRM / OCS Inventory / ESET Protect)
y un conjunto grande de métricas de horas técnicas.

## Stack

- **Node.js** (CommonJS) + **Express 5** en `server.js` (puerto `3005`).
- **Frontend**: `public/index.html` (~2100 líneas, vanilla JS, sin framework,
  tabs por sección). El `__VTIGER_URL__` de `index.html` se reemplaza con
  `VTIGER_URL` al servir (`server.js:118`).
- **BDs**: MySQL vTiger (`src/db/crm.js`) y PostgreSQL cache (`src/db/ocs_pg.js`)
  → `sti_web.cache_ocs_computers` y `sti_web.cache_fs`.
- **APIs externas**: OCS Inventory REST (`ocs.service.js`) y ESET Protect
  OAuth2 (`eset.service.js`).

## Flujos clave

### Comparador CRM / OCS / ESET (`POST /api/compare/:idx`)
1. `refreshClientes()` mezcla `clientes.json` + abonados del CRM (`getAbonados`,
   `crm.service.js:82`).
2. `getCrmComputers` lee cuentas + contactos con hasta 3 equipos por contacto
   (campos `cf_1215`..`cf_1251`, `crm.service.js:52`).
3. OCS sale de caché en disco (`ocs_cache.json`, tags de `tag_ocs`).
4. ESET sale de caché o fetch directo por región (`us`,`eu`,`de`,`ca`,`jpn`).
5. `matchDevices` (`src/utils/matcher.js`) cruza por **serial → UUID → MAC**
   (en ese orden) y devuelve las 7 categorías (enTres, crmOcs, crmEset,
   ocsEset, soloCrm, soloOcs, soloEset).

### Horas técnicas (`src/services/horas.service.js`, ~905 líneas)
- ~15 consultas directas a vTiger sobre service contracts.
- La más completa: `getKpiMensual` (por técnico + KPI de tickets + FS sin
  asociar + próximos mantenimientos).
- Excluye usuarios de `EXCLUDED_USERS = (5, 6, 7, 72)`.

### Inventario OCS desde PostgreSQL (`ocs-pg.service.js`)
- Tablas cache `sti_web.cache_ocs_computers` (computers, workgroups, summary)
  y `sti_web.cache_fs` (registros de servicio).

### Copia DEV del KPI (`kpi/`, aislada — no toca el dashboard)
- `kpi/kpi-dev.service.js` (~530 líneas) + `kpi/kpi-dev.html` (~530 líneas):
  copia standalone de la pestaña KPI para probar cambios sin riesgo. Incluye
  vacaciones/ausencias/llegadas tarde, mantenimientos por proyectos,
  tiempo por cliente y filtros por unidad de negocio / tipo de soporte.
- Rutas aditivas en `server.js`: `/api/kpi-mensual-dev`, `/api/kpi-dev/tiempo-clientes`
  y `/api/kpi-dev/filtros`. Sirve `/kpi-dev.html` vía `express.static` (`server.js:124`).

## Configuración

- `src/config/index.js` centraliza conexiones. **⚠️ Tiene passwords en
  defaults hardcodeados** (ver `pendientes.md`).
- `.env` para override (gitignored).
- Parámetros de ESET documentados en `ESET_API.md`; estructura CRM en
  `CRM_DATABASE_STRUCTURE.md` (⚠️ la nota "Missing from Current Implementation"
  está desactualizada: equipos 2 y 3 ya se leen).
- `clientes.json`: ~65 clientes con `tag_ocs`, `email_eset`, `sheets`.

## Herramientas auxiliares

- `find_tag.js`: diagnostica campos TAG en la DB vTiger.
- `iniciar-dashboard.bat`: instala deps e inicia el servidor con navegador.

## Agentes instalados (`.opencode/agents/`, 2026-09-25)

- 20 subagentes de la colección "Agency Agents"
  (https://github.com/msitarzewski/agency-agents) elegidos según el portfolio
  de ~14 proyectos en `../proyectos_IA`. Disponibles por `@mention` o vía Task.
- Ingeniería (14): backend-architect, software-architect, database-optimizer,
  database-reliability-engineer, data-engineer, code-reviewer,
  codebase-onboarding-engineer, senior-developer, git-workflow-master,
  minimal-change-engineer, developer-tooling-engineer, technical-writer, sre,
  incident-response-commander.
- Seguridad (3): secrets-credential-hygiene-engineer, application-security-engineer,
  compliance-auditor.
- Gestión (2): project-shepherd, senior-project-manager. Testing (1): api-tester.