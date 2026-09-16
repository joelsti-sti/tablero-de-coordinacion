# Pendientes — Dashboard Unificado

Deuda técnica e issues abiertos. Más críticos primero.

---

## P1 — CRÍTICO: quitar credenciales hardcodeadas
- Descripción: `src/config/index.js:4-15` y `src/db/{crm.js,ocs_pg.js}` tienen
  passwords como fallback (`process.env.X || 'pass'`).
- Riesgo: secreto expuesto en el repo de GitHub ya subido →
  **rotar contraseñas** y que el código fallé si `.env` no define el valor.
- Archivos: `src/config/index.js`, `src/db/crm.js`, `src/db/ocs_pg.js`.

## P2 — CRÍTICO: dashboard en `0.0.0.0` sin auth + CORS abierto
- Descripción: `server.js:26` (`cors()` sin whitelist) y `server.js:406`
  (`listen(..., '0.0.0.0')`).
- Sugerencia: restringir origen, escuchar solo local/red interna y añadir
  auth simple (usuario+clave de cabecera o login).

## P3 — MEDIO: N+1 queries en inventarios
- `/api/crm/inventory` y `/api/eset/inventory` (`server.js:149,170`) hacen un
  `getCrmComputers`/`getEsetComputers` por cliente (65+ llamadas) en vez de
  una query agregada.
- Sugerencia: una sola query `JOIN` por cliente y/o paralelizar con `Promise.all`.

## P4 — MEDIO: documentación desactualizada
- `CRM_DATABASE_STRUCTURE.md` dice que equipos 2 y 3 "no se leen", pero
  `crm.service.js:57-61` ya los lee. Actualizar.

## P5 — BAJO: dos rutas OCS superpuestas
- `ocs.service.js` (crawl REST + cache) vs `ocs-pg.service.js` (tablas cache
  `sti_web.*`). Definir cuál es la oficial para no mantener dos.

## P6 — BAJO: single-file frontend
- `public/index.html` ~2050 líneas. Difícil de mantener. Posible split futuro.

---
_(Agregar aquí nuevos pendientes con fecha.)_