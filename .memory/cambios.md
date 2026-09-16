# Cambios — Dashboard Unificado

Historial de modificaciones. Más recientes primero. Referenciar commit si aplica.

---

## 2026-09-16 — Técnicos sin carga de horas en pestaña Horas (commit `c467f0e`)
- `horas.service.js`: nuevo helper `getTecnicosSinCarga(date)` (técnicos con FS
  válido en los últimos 30 días que NO cargaron horas en la fecha consultada).
  Corregido con `HAVING SUM(cf_960 = ?) = 0` (un `!= ?` por fila causaba que
  técnicos con FS el día analizado plus FS anterior salieran como sin carga).
- `/api/horas` y `/api/horasreales` ahora devuelven `tecnicosSinCarga`.
- `public/index.html`: se marcan como tarjetas grises "Sin carga" (0:00) en
  las 3 sub-pestañas (Resumen, Horas Reales, Billboard).

## 2026-09-16 — Sistema de memoria + skill opencode
- Añadido `.opencode/skills/memoria/SKILL.md` (skill de memoria persistente).
- Añadido `.memory/` (banco de memoria versionado: index, arquitectura,
  decisiones, cambios, errores, pendientes, progreso).
- Añadido `AGENTS.md` con convenciones del proyecto y enlace a la memoria.
- Semilla de memoria con el análisis inicial del código (arquitectura,
  hallazgos de seguridad y deuda técnica).