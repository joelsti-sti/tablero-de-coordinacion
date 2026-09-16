# Errores — Dashboard Unificado

Registro de errores: síntoma → causa raíz → solución → prevención.
Más recientes primero. Sin resolver = estado `PENDIENTE` (mover luego a `pendientes.md`).

---

## 2026-09-16 — Técnicos con FS del día aparecían como "sin carga"
- **Síntoma**: en la pestaña Horas, técnicos con formularios cargados en el día
  analizado salían en gris como "sin carga".
- **Causa raíz**: en `getTecnicosSinCarga` (`horas.service.js`) se usó
  `AND scf.cf_960 != ?`. Eso filtraba filas individuales, pero si el técnico
  tenía OTRO FS en los últimos 30 días, esas filas seguían existiendo y el
  técnico quedaba en el grupo (GROUP BY u.id).
- **Solución**: reemplazar por `HAVING SUM(scf.cf_960 = ?) = 0`, que descarta
  al técnico completo si tiene al menos un FS/pendiente calendario el día
  consultado.
- **Prevención**: al filtrar "por fecha" sobre un grupo de filas por persona,
  usar agregado (HAVING) en vez de condición por fila.

## 2026-09-16 — Hallazgos iniciales (revisión de código, aún no probados como fallas runtime)

### P1 — Credenciales hardcodeadas en defaults
- **Síntoma (potencial)**: cualquier persona con acceso al repo conoce
  credenciales de MySQL, PostgreSQL y OCS API aunque funcione.
- **Causa**: `src/config/index.js` y `src/db/{crm,ocs_pg}.js` usan
  `process.env.X || 'password'` como fallback.
- **Estado**: PENDIENTE → ver `pendientes.md` (item #1).
- **Prevención**: fallar si falta `.env`, no tener fallbacks.

### P2 — Servidor expuesto sin auth y CORS abierto
- **Síntoma (potencial)**: `app.use(cors())` abierto y `listen('0.0.0.0')`
  (`server.js:26,406`) expone el dashboard a la red.
- **Estado**: PENDIENTE → ver `pendientes.md` (item #2).

---

_(Registrar aquí nuevos errores cuando ocurran.)_