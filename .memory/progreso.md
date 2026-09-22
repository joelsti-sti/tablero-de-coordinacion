# Progreso — Dashboard Unificado

Estado actual, tareas en curso y próximos pasos.

---

## 2026-09-21 — Mantenimientos Pendientes corregido (solo `kpi/`)

- Se reemplazó la lógica de "Mantenimientos Pendientes" (antes: FS del mes sin
  ticket/tarea asociada, daba 64) por una basada en **proyectos** "Mantenimiento
  <Mes> - <Cliente>" sin estado final (`completed`/`archived`/`Cancelado`).
  `Validando` = técnicamente terminado pero falta enviar informe → también
  cuenta como pendiente. Para septiembre 2026 daba 38 (27 sin validar + 11
  en Validando). Ver `kpi-dev.service.js` `getMantenimientosPendientes`.
- Falta evaluar en uso real; si se valida, replicar en `horas.service.js`
  (`getKpiMensual`, dashboard principal — `P4`-ish, decidir al validar).

## 2026-09-16 — Estado actual

- **Último análisis**: revisión completa del código (server, services, utils,
  frontend, config, docs).
- **Lo que se implementó hoy**: sistema de memoria persistente
  (`.memory/` + skill `memoria` + `AGENTS.md`), marcado de técnicos activos
  sin carga de horas en la pestaña Horas (`getTecnicosSinCarga` en
  `horas.service.js`, tarjetas "Sin carga" en las 3 sub-pestañas de
  `public/index.html`) y copia standalone de la pestaña KPI para desarrollo
  (`/kpi-dev.html` + `/api/kpi-mensual-dev`).
- **En curso (DEV, solo `kpi/`)**: agregado de "Tiempo por Cliente" —
  endpoint `/api/kpi-dev/tiempo-clientes` (`getTiempoPorCliente`) + pestañas
  en `/kpi-dev.html` (stacked bar chart, heatmap técnico x cliente y
  drill-down por técnico en "Productividad por Técnico"). Falta evaluar en
  uso real; si no se valida se descarta sin tocar el dashboard.
- **Próximos pasos sugeridos** (por prioridad, detalle en `pendientes.md`):
  1. Eliminar credenciales hardcodeadas y rotar passwords (P1).
  2. Restringir CORS y agregar auth al dashboard (P2).
  3. Refactor de N+1 en inventarios (P3).
  4. Actualizar `CRM_DATABASE_STRUCTURE.md` (P4).