# Cambios — Dashboard Unificado

Historial de modificaciones. Más recientes primero. Referenciar commit si aplica.

---

---

## 2026-09-21 — Filtros por tipo de servicio / soporte (solo `kpi/`)
- Los FS ya traen `cf_1026` (Tipo de servicio → unidad de negocio) y `cf_922`
  (Tipo de Soporte). Ahora el tablero dev los usa:
  - `kpi/kpi-dev.service.js`: `getFiltrosDev()` devuelve opciones; `getKpiMensualDev`
    y `getTiempoPorCliente` aceptan `unidadNegocio`/`tipoSoporte` y filtran las
    FS por `scf.cf_1026`/`scf.cf_922`. Se expone `filtros` aplicados y
    `desglose_unidad`/`desglose_tipo_soporte` (FS y horas por categoría).
    Cada FS lleva `unidad_negocio`.
  - `server.js`: rutas `/api/kpi-mensual-dev`, `/api/kpi-dev/tiempo-clientes`
    aceptan `unidad` y `soporte`; nueva ruta `/api/kpi-dev/filtros`.
  - `kpi/kpi-dev.html`: dos dropdowns (unidad de negocio y tipo de soporte) que
    disparan recarga; nueva sección "Desglose por Tipo de Servicio" (tabla por
    unidad de negocio + tipo de soporte, FS y horas).
- Verificado 2026-09: Laboratorio FO → 14 FS, 2 técnicos.
  Unidades: Administrativo, BI, Cableado estructurado, Comercial, Laboratorio FO,
  Seguridad electrónica, Soporte IT. Soportes: Cadeteria, Laboratorio Tecnico,
  Local Avanzado, Local Basico, Mantenimiento IT Local, Mantenimiento IT Remoto,
  Remoto Avanzado, Remoto Basico.

## 2026-09-21 — Próximos Mantenimientos por proyectos (solo `kpi/`)
- `kpi/kpi-dev.service.js`: se eliminó el query de FS (vtiger_servicecontracts
  con cf_960 del mes siguiente). Ahora `proximos_mantenimientos` usa
  `getMantenimientosPendientes(nextYear, nextMonth)` → proyectos
  projecttype='Mantenimiento' con cf_1255/cf_1090 del mes siguiente.
- `kpi/kpi-dev.html`: la sección ahora muestra Proyecto/Cliente/Modalidad/
  Estado/Inicio/Fin en vez de FS técnico. Octubre 2026: 0 (aún no cargados).

## 2026-09-21 — Recuadros de proyectos por tipo (solo `kpi/`)
- `kpi/kpi-dev.service.js`: nueva `getProyectosActivosPorTipo(tipos)` — proyectos
  por `projecttype` con estado no final (NOT IN completed/archived/Cancelado),
  sin filtro de mes. `getKpiMensualDev` ahora expone `proyectos_activos.src_it`
  y `proyectos_activos.src_obras`.
- `kpi/kpi-dev.html`: dos recuadros nuevos "Soporte IT - Proyectos Activos" y
  "Obras - Proyectos Activos" (tabla con proyecto, cliente, estado, fechas).
  Septiembre 2026: IT activos 157, Obras activas 11.

## 2026-09-21 — Mantenimientos: filtro por campos reales (solo `kpi/`)
- `kpi/kpi-dev.service.js` (`getMantenimientosPendientes`): se reemplazó el match
  por texto del nombre por campos reales de vTiger:
  - tipo de proyecto: `vtiger_project.projecttype = 'Mantenimiento'`
  - mes: `vtiger_projectcf.cf_1255` (picklist MES)
  - año: `vtiger_projectcf.cf_1090` (picklist Año de Plan de Trabajo)
  - cliente: `linktoaccountscontacts` → `vtiger_account`
  - modalidad: `cf_1253` (Presencial/Remoto) — nueva columna en la tabla del HTML.
- Septiembre 2026 → 35 pendientes (20 Sin iniciar, 5 in progress, 10 Validando).
  Excluye los "Mantenimiento servidores clientes..." (projecttype IT).

## 2026-09-21 — Corrección "Otros" en Tiempo por Cliente (solo `kpi/`)
- `kpi/kpi-dev.service.js` (`getTiempoPorCliente`): se eliminó el umbral de 2 hs
  y el agrupado "Otros". Ahora se listan todos los clientes reales por técnico
  con sus horas/modalidad/viaje/FS.
- `kpi/kpi-dev.html`: limpieza de referencias a "Otros" en `topClientes` y texto
  del stacked chart.

## 2026-09-21 — Corrección Mantenimientos Pendientes (solo `kpi/`)
- El contador anterior ("FS del mes sin ticket/tarea") no reflejaba la operación
  real: los mantenimientos se ejecutan vía proyectos "Mantenimiento <Mes> - <Cliente>"
  con estado en `vtiger_project.projectstatus` (vinculado al cliente por
  `linktoaccountscontacts`).
- `kpi/kpi-dev.service.js`: nuevo `getMantenimientosPendientes(year, month)` —
  proyectos con `projectname LIKE 'Mantenimiento %'` + mes en curso, sin estado
  `completed`/`archived`/`Cancelado`. `Validando` cuenta como pendiente
  (falta enviar el informe). Excluye ambos sentidos del YYYY-MM-DD
  por año (startdate o createdtime).
- `getKpiMensualDev` ahora expone `mantenimientos_pendientes = { total, proyectos,
  por_estado }` en lugar de `total_sin_asociar`/presenciales/remotos/otros.
- `kpi/kpi-dev.html`: card "Mantenimientos Pendientes" y tabla de proyectos
  pendientes (nombre link a Project, cliente, estado, inicio/fin). `Validando`
  se muestra como "Falta enviar informe" (badge azul).

---

## 2026-09-16 — Mejora KPI DEV: tiempo de técnico por cliente (solo `kpi/`)
- `kpi/kpi-dev.service.js`: nuevo `getTiempoPorCliente(year, month)` — devuelve
  por técnico el desglose de horas por cliente (modalidad Presencial/Remoto/
  Otro), minutos de viaje (`cf_1211`+`cf_1213`) y conteo de FS. Clientes con
  <2 hs al mes se agrupan en "Otros". Mismos filtros que el KPI (`cf_960`,
  `EXCLUDED_USERS`, `STI` como cliente).
- `server.js`: ruta aditiva `GET /api/kpi-dev/tiempo-clientes?year=&month=`.
- `kpi/kpi-dev.html`: 2 pestañas ("Resumen KPI" / "Tiempo por Cliente").
  - Stacked bar chart (SVG puro, sin librerías): X = técnicos, Y = horas,
    barra segmentada por cliente con tooltip; leyenda de colores por cliente.
  - Mapa de calor técnico x cliente (top 12 clientes + "Otros"), celdas con
    intensidad roja según horas.
  - Drill-down: botón `>` en "Productividad por Técnico" expande una sub-tabla
    por cliente (horas, presencial/remoto, viaje, FS, %).
- Sin tocar el dashboard/productiva original. Probar en `/kpi-dev.html`.

## 2026-09-16 — Copia DEV de la pestaña KPI (para trabajar sin tocar el original)
- Nueva carpeta `kpi/` con la copia aislada del módulo KPI:
  - `kpi/kpi-dev.html`: pestaña KPI standalone (HTML+CSS+JS de `index.html`).
  - `kpi/kpi-dev.service.js`: `getKpiMensualDev`, copia de `getKpiMensual`
    (misma lógica, pool `../src/db/crm`, `EXCLUDED_USERS` local).
- `server.js`: nueva ruta aditiva `GET /api/kpi-mensual-dev`
  (`require('./kpi/kpi-dev.service')`) y `express.static` sobre `kpi/`
  para servir `/kpi-dev.html`. No toca la ruta ni el servicio original.

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