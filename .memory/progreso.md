# Progreso — Dashboard Unificado

Estado actual, tareas en curso y próximos pasos.

---

## 2026-09-16 — Estado actual

- **Último análisis**: revisión completa del código (server, services, utils,
  frontend, config, docs).
- **Lo que se implementó hoy**: sistema de memoria persistente
  (`.memory/` + skill `memoria` + `AGENTS.md`) y marcado de técnicos activos
  sin carga de horas en la pestaña Horas (`getTecnicosSinCarga` en
  `horas.service.js`, tarjetas "Sin carga" en las 3 sub-pestañas de
  `public/index.html`).
- **En curso**: nada activo.
- **Próximos pasos sugeridos** (por prioridad, detalle en `pendientes.md`):
  1. Eliminar credenciales hardcodeadas y rotar passwords (P1).
  2. Restringir CORS y agregar auth al dashboard (P2).
  3. Refactor de N+1 en inventarios (P3).
  4. Actualizar `CRM_DATABASE_STRUCTURE.md` (P4).