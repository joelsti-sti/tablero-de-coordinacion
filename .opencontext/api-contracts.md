# Contratos de API — Dashboard Unificado

_Actualizado: 2026-09-25_. Todas las rutas en `server.js`. Respuestas JSON.
Errores: HTTP 500 `{ error: message }` (middleware final `server.js:415`).

## Clientes

| Método | Ruta | Parámetros | Devuelve |
|---|---|---|---|
| GET | `/api/clientes` | — | `[{id, empresa, tag_ocs, has_eset, fromCrm}]` |
| POST | `/api/clientes/refresh` | — | `{ok, total, lastUpdate}` (fuerza `refreshClientes()`) |
| GET | `/api/clientes/last-update` | — | `{lastUpdate, total}` |

## Comparación CRM/OCS/ESET

| Método | Ruta | Parámetros | Devuelve |
|---|---|---|---|
| GET | `/api/crm/inventory` | — | Todos los devices CRM (`getCrmComputers` por cliente, N+1) |
| GET | `/api/eset/inventory` | — | Devices ESET (usu `getEsetCacheStatus()` si hay caché, si no fetch por cliente) |
| GET | `/api/eset/inventory/:clienteName` | nombre URL-encoded | Devices ESET de un cliente |
| GET | `/api/eset-cache-status` | — | `{loading, progress, count, accounts}` |
| POST | `/api/load-eset-cache` | — | `{status: 'started'|'already_loading'}` |
| GET | `/api/eset/clients` | — | `[{empresa, email_eset, tag_ocs}]` |
| GET | `/api/eset/licencias` | — | `[{empresa, tag_ocs, contracts}]` |
| GET | `/api/contracts` | — | `[{empresa, tag_ocs, contracts}]` |
| GET | `/api/ocs-cache-status` | — | `{loading, progress, count, tags, refreshIntervalMs}` |
| POST | `/api/load-ocs-cache` | — | `{status: 'started'|'already_loading'}` |
| POST | `/api/compare/:clienteIndex` | índice en array de clientes | Ver payload abajo |

Payload `/api/compare/:idx`:
`{cliente, totalCRM, totalOCS, totalOCSservers, totalOCSterminals, totalESET, contracts, matchedDevices, summary:{enTres, crmOcs, crmEset, ocsEset, soloCrm, soloOcs, soloEset}}`.
`matchedDevices[]` = `{crm:{present,data}, ocs:{present,data}, eset:{present,data}}`.

## Horas técnicas (vTiger)

| Método | Ruta | Parámetros |
|---|---|---|
| GET | `/api/horas` | `date` |
| GET | `/api/fsdetalle` | `date`, `tecnico` |
| GET | `/api/horasreales` | `date` |
| GET | `/api/horas-mensual` | `year`, `month` |
| GET | `/api/fs-sin-asociar` | `date` |
| GET | `/api/fs-sin-asociar-mensual` | `year`, `month` |
| GET | `/api/horas-mensual-detalle` | `year`, `month` |
| GET | `/api/fs-negativos` | `date` |
| GET | `/api/fs-negativos-mensual` | `year`, `month` |
| GET | `/api/tareas-pendientes` | `year`, `month` |
| GET | `/api/tickets-pendientes` | `year`, `month` |
| GET | `/api/fs-sin-asociar-full` | `year`, `month` |
| GET | `/api/tecnicos-menor6` | `year`, `month` |
| GET | `/api/kpi-mensual` | `year`, `month` |

Nota: `/api/horas` y `/api/horasreales` devuelven además `tecnicosSinCarga`
(técnicos activos sin carga en la fecha, implementado 2026-09-16).

## KPI DEV (aislado, `kpi/kpi-dev.service.js`)

| Método | Ruta | Parámetros |
|---|---|---|
| GET | `/api/kpi-mensual-dev` | `year`, `month`, `unidad`, `soporte` |
| GET | `/api/kpi-dev/tiempo-clientes` | `year`, `month`, `unidad`, `soporte` |
| GET | `/api/kpi-dev/filtros` | — (opciones para dropdowns de unidad negocio / tipo soporte) |

## OCS Inventory PostgreSQL (cache `sti_web.*`)

| Método | Ruta | Parámetros |
|---|---|---|
| GET | `/api/ocs/computers` | `workgroup`, `search`, `tipo` (`virtual`/`fisico`) |
| GET | `/api/ocs/computers-cross` | `workgroup` |
| GET | `/api/ocs/workgroups` | — |
| GET | `/api/ocs/summary` | — (totales, virtuales, sin bios/uuid, disk_health, os_distribution, ram_avg_by_wg) |
| GET | `/api/fs/registros` | `search`, `tecnico` |

## UI / estáticos

- `GET /` — sirve `public/index.html` con `__VTIGER_URL__` inyectado.
- `express.static` sobre `/public` y `/kpi` (sirve `/kpi-dev.html`).