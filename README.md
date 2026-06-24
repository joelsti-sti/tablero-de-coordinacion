# Dashboard de Horas Técnicos

Dashboard web para consultar y visualizar horas cargadas por técnicos en vTiger CRM (módulo ServiceContracts/FS).

## Stack Tecnológico

- **Backend:** Node.js + Express 5 + mysql2
- **Frontend:** HTML5 + Bootstrap 5.3 + JavaScript vanilla
- **Base de datos:** MySQL (vTiger CRM 6.x)

## Configuración

Variables de entorno (`.env`):

| Variable | Descripción | Default |
|---|---|---|
| `DB_HOST` | Host MySQL | `192.168.200.246` |
| `DB_USER` | Usuario MySQL | `claw` |
| `DB_PASSWORD` | Contraseña MySQL | - |
| `DB_NAME` | Base de datos vTiger | `vtigercrm600` |
| `DB_PORT` | Puerto MySQL | `3306` |
| `PORT` | Puerto del servidor Express | `3000` |
| `VTIGER_URL` | URL del CRM (para enlaces) | - |

## Constante global: `EXCLUDED_USERS`

Definida en `server.js:11`:

```js
const EXCLUDED_USERS = '(5, 6, 7, 72)';
```

Se aplica en todos los endpoints via `u.id NOT IN (5, 6, 7, 72)` para excluir usuarios internos (admin, sincronización, etc.).

---

## Query Templates (SQL reutilizable)

### `FS_FROM`

Fragmento `FROM` que enlaza las 4 tablas base:

```sql
FROM vtiger_users u
INNER JOIN vtiger_crmentity e ON u.id = e.smownerid AND e.deleted = 0
INNER JOIN vtiger_servicecontracts sc ON e.crmid = sc.servicecontractsid
INNER JOIN vtiger_servicecontractscf scf ON e.crmid = scf.servicecontractsid
```

### `FS_ACCOUNT`

LEFT JOIN a `vtiger_account` para obtener el nombre del cliente:

```sql
LEFT JOIN vtiger_account a ON sc.sc_related_to = a.accountid
```

### `FS_WHERE`

Filtro común usado en casi todos los endpoints:

```sql
WHERE scf.cf_960 = ?           -- fecha del FS
  AND scf.cf_932 IS NOT NULL   -- hora inicio obligatoria
  AND scf.cf_934 IS NOT NULL   -- hora fin obligatoria
  AND u.deleted = 0
  AND u.id NOT IN (5, 6, 7, 72)
```

### `buildRelSubquery(modules, alias)`

Función que genera una subconsulta para contar relaciones (tickets, tareas) desde `vtiger_crmentityrel`:

```sql
SELECT fs_id, SUM(cnt) as <alias> FROM (
    SELECT crmid as fs_id, COUNT(*) as cnt FROM vtiger_crmentityrel
    WHERE module = 'ServiceContracts' AND relmodule IN (<modules>)
    GROUP BY crmid
    UNION ALL
    SELECT relcrmid as fs_id, COUNT(*) as cnt FROM vtiger_crmentityrel
    WHERE relmodule = 'ServiceContracts' AND module IN (<modules>)
    GROUP BY relcrmid
) t GROUP BY fs_id
```

---

## Tablas de base de datos involucradas

### `vtiger_servicecontracts`

| Campo | Tipo | Uso |
|---|---|---|
| `servicecontractsid` | int(11) PK | ID del FS (enlaza con `crmid` en `vtiger_crmentity`) |
| `subject` | varchar(100) | Nombre/título del FS |
| `contract_no` | varchar(100) | Número de FS (ej. `FS-2024-00123`) |
| `sc_related_to` | int(11) | ID de cuenta relacionada (`vtiger_account.accountid`) — valor `2` indica "Sin Cliente" |

### `vtiger_servicecontractscf`

Campos personalizados (Custom Fields) del módulo ServiceContracts.

| Campo | Tipo | Uso |
|---|---|---|
| `servicecontractsid` | int(11) PK | FK a `vtiger_servicecontracts.servicecontractsid` |
| `cf_960` | date | **Fecha del servicio** (filtro principal por día/mes) |
| `cf_932` | time | **Hora de inicio** del servicio |
| `cf_934` | time | **Hora de fin** del servicio |
| `cf_1046` | varchar(3) | Checkbox — Ausente con Justificación |
| `cf_1048` | varchar(3) | Checkbox — Ausente sin aviso |
| `cf_1050` | varchar(3) | Checkbox — Ausente autorizado |
| `cf_1052` | varchar(3) | Checkbox — Llegada tarde autorizada |
| `cf_1054` | varchar(3) | Checkbox — Llegada tarde injustificada |
| `cf_1227` | varchar(3) | Checkbox — Licencia médica |

> **Nota:** Las checkboxes `cf_1046`, `cf_1048`, `cf_1050`, `cf_1052`, `cf_1054` y `cf_1227` existen en la tabla pero actualmente **no son consultadas** por ningún endpoint del dashboard.

### `vtiger_users`

| Campo | Tipo | Uso |
|---|---|---|
| `id` | int(11) PK | ID del usuario/técnico |
| `first_name` | varchar(32) | Nombre del técnico |
| `last_name` | varchar(32) | Apellido del técnico |
| `deleted` | int(1) | Soft delete (0 = activo, 1 = eliminado) |

### `vtiger_crmentity`

Entidad común del CRM — cada registro de módulo tiene un row aquí.

| Campo | Tipo | Uso |
|---|---|---|
| `crmid` | int(11) PK | ID de la entidad (coincide con `servicecontractsid`) |
| `smownerid` | int(11) | ID del usuario propietario (`vtiger_users.id`) |
| `deleted` | int(1) | Soft delete (0 = activo) |

### `vtiger_account`

| Campo | Tipo | Uso |
|---|---|---|
| `accountid` | int(11) PK | ID de la cuenta/cliente |
| `accountname` | varchar(100) | Nombre del cliente |

### `vtiger_crmentityrel`

Relaciones entre módulos (muchos a muchos).

| Campo | Tipo | Uso |
|---|---|---|
| `module` | varchar(50) | Módulo origen (ej. `ServiceContracts`, `HelpDesk`) |
| `relmodule` | varchar(50) | Módulo destino (ej. `HelpDesk`, `ProjectTask`) |
| `crmid` | int(11) | ID en el módulo origen |
| `relcrmid` | int(11) | ID en el módulo destino |

Se consulta en ambas direcciones (`module=ServiceContracts` y `relmodule=ServiceContracts`) para cubrir relaciones creadas desde cualquier lado.

### `vtiger_projecttask`

Módulo de tareas de proyecto — solo se usa como `'ProjectTask'` en `relmodule` de `vtiger_crmentityrel` para contar tareas relacionadas a un FS.

### `vtiger_helpdesk`

Módulo de tickets/soporte — solo se usa como `'HelpDesk'` en `relmodule` de `vtiger_crmentityrel` para contar tickets relacionados a un FS.

---

## Funciones de servidor auxiliares

### `parseTime(timeStr)`

Convierte string `"HH:MM:SS"` a minutos desde medianoche.

### `mergeIntervals(intervals)`

Mergea intervalos `{ start, end }` solapados o contiguos.

### `minutesInHour(mergedIntervals, hourStart, hourEnd)`

Calcula minutos ocupados dentro de una hora específica.

---

## Endpoints de la API

### `GET /` — Página principal

Sirve `public/index.html` reemplazando `__VTIGER_URL__` por el valor de `VTIGER_URL`.

### `GET /api/config` — Configuración del frontend

```json
{ "vtigerUrl": "https://crm.stinetwork.com.ar:8889" }
```

---

### `GET /api/horas` — Resumen diario por técnico

**Query params:** `date` (YYYY-MM-DD, default: hoy)

**SQL:**
```sql
SELECT
    u.first_name, u.last_name,
    SUM(TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600) as total_hours,
    COUNT(*) as fs_count,
    GROUP_CONCAT(
        CONCAT(sc.contract_no, ' (', TIME_FORMAT(scf.cf_932, '%H:%i'), '-', TIME_FORMAT(scf.cf_934, '%H:%i'), ')'
        ) SEPARATOR '|'
    ) as fs_list
<FS_FROM>
<FS_WHERE>
GROUP BY u.id
ORDER BY u.last_name, u.first_name
```

**Tablas consultadas:** `vtiger_users`, `vtiger_crmentity`, `vtiger_servicecontracts`, `vtiger_servicecontractscf`

**Respuesta:** `Array<{ first_name, last_name, total_hours, fs_count, fs_list }>`

---

### `GET /api/fsdetalle` — Detalle diario de FS con tickets y tareas

**Query params:** `date` (YYYY-MM-DD, default: hoy)

**SQL:**
```sql
SELECT
    u.first_name, u.last_name,
    sc.servicecontractsid as fs_id,
    sc.subject as fs_name,
    sc.contract_no as fs_numero,
    a.accountname as cliente,
    TIME(scf.cf_932) as hora_inicio,
    TIME(scf.cf_934) as hora_fin,
    TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas,
    COALESCE(t.tickets, 0) as tickets,
    COALESCE(ta.tareas, 0) as tareas
<FS_FROM>
<FS_ACCOUNT>
LEFT JOIN (buildRelSubquery(['HelpDesk'], 'tickets')) t ON sc.servicecontractsid = t.fs_id
LEFT JOIN (buildRelSubquery(['ProjectTask'], 'tareas')) ta ON sc.servicecontractsid = ta.fs_id
<FS_WHERE>
ORDER BY u.last_name, u.first_name, scf.cf_932
```

**Tablas consultadas:** `vtiger_users`, `vtiger_crmentity`, `vtiger_servicecontracts`, `vtiger_servicecontractscf`, `vtiger_account`, `vtiger_crmentityrel` (×2)

**Respuesta:** `Array<{ first_name, last_name, fs_id, fs_name, fs_numero, cliente, hora_inicio, hora_fin, horas, tickets, tareas }>`

---

### `GET /api/horasreales` — Horas reales (solapamiento) + rangos sin carga

**Query params:** `date` (YYYY-MM-DD, default: hoy)

**SQL (raw data):**
```sql
SELECT
    u.first_name, u.last_name,
    sc.subject as fs_name,
    sc.contract_no as fs_numero,
    a.accountname as cliente,
    TIME(scf.cf_932) as hora_inicio,
    TIME(scf.cf_934) as hora_fin
<FS_FROM>
<FS_ACCOUNT>
<FS_WHERE>
ORDER BY u.last_name, u.first_name, scf.cf_932
```

**Tablas consultadas:** `vtiger_users`, `vtiger_crmentity`, `vtiger_servicecontracts`, `vtiger_servicecontractscf`, `vtiger_account`

**Lógica del servidor:**
1. Obtiene todos los intervalos de cada técnico.
2. Por técnico: suma minutos totales, aplica merge de intervalos solapados, cap a 8h máx.
3. A nivel global: mergea todos los intervalos de todos los técnicos para detectar horas (8:00-18:00) sin carga.
4. Formatea: `"FS_NUMERO | Cliente | hh:mm-hh:mm"`.

**Respuesta:**
```json
{
  "tecnicos": [
    { "first_name": "...", "last_name": "...", "horasReales": 7.5, "fs_count": 3, "fs_list": ["...", "..."] }
  ],
  "horasSinCarga": ["9:00 - 10:00", "14:00 - 15:00"]
}
```

---

### `GET /api/horas-mensual` — Resumen mensual agregado por técnico

**Query params:** `year`, `month` (default: año/mes actual)

**SQL:**
```sql
SELECT
    u.first_name, u.last_name,
    SUM(TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600) as total_hours,
    COUNT(DISTINCT sc.servicecontractsid) as fs_count
<FS_FROM>
WHERE DATE_FORMAT(scf.cf_960, '%Y-%m') = ?
  AND scf.cf_932 IS NOT NULL
  AND scf.cf_934 IS NOT NULL
  AND u.deleted = 0
  AND u.id NOT IN (5, 6, 7, 72)
GROUP BY u.id, u.first_name, u.last_name
ORDER BY total_hours DESC
```

**Tablas consultadas:** `vtiger_users`, `vtiger_crmentity`, `vtiger_servicecontracts`, `vtiger_servicecontractscf`

**Respuesta:** `Array<{ first_name, last_name, total_hours, fs_count }>`

---

### `GET /api/fs-sin-asociar` — FS del día sin ticket/tarea asociada

**Query params:** `date` (YYYY-MM-DD, default: hoy)

**Lógica:**
1. Consulta `vtiger_crmentityrel` para obtener todos los `fs_id` que SÍ tienen relación con `HelpDesk` o `ProjectTask`.
2. Obtiene los FS del día con el query estándar.
3. Filtra en Node: excluye los que están en `relatedIds` y los que tienen `sc_related_to = 2`.

**SQL base:**
```sql
SELECT
    u.first_name, u.last_name,
    sc.servicecontractsid as fs_id,
    sc.sc_related_to,
    sc.subject as fs_name,
    sc.contract_no as fs_numero,
    scf.cf_960 as fs_fecha,
    a.accountname as cliente,
    TIME(scf.cf_932) as hora_inicio,
    TIME(scf.cf_934) as hora_fin,
    TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas
<FS_FROM>
<FS_ACCOUNT>
<FS_WHERE>
ORDER BY u.last_name, u.first_name, scf.cf_932
```

**Tablas consultadas:** `vtiger_users`, `vtiger_crmentity`, `vtiger_servicecontracts`, `vtiger_servicecontractscf`, `vtiger_account`, `vtiger_crmentityrel`

**Respuesta:** `Array<{ first_name, last_name, fs_id, sc_related_to, fs_name, fs_numero, fs_fecha, cliente, hora_inicio, hora_fin, horas }>`

---

### `GET /api/fs-sin-asociar-mensual` — FS sin asociar por mes

**Query params:** `year`, `month` (default: año/mes actual)

**SQL:**
```sql
SELECT
    u.first_name, u.last_name,
    sc.servicecontractsid as fs_id,
    sc.sc_related_to,
    sc.subject as fs_name,
    sc.contract_no as fs_numero,
    scf.cf_960 as fs_fecha,
    a.accountname as cliente,
    TIME(scf.cf_932) as hora_inicio,
    TIME(scf.cf_934) as hora_fin,
    TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas
<FS_FROM>
<FS_ACCOUNT>
WHERE scf.cf_960 BETWEEN ? AND ?
  AND scf.cf_932 IS NOT NULL
  AND scf.cf_934 IS NOT NULL
  AND u.deleted = 0
  AND u.id NOT IN (5, 6, 7, 72)
ORDER BY scf.cf_960, u.last_name, u.first_name, scf.cf_932
```

Usa `firstDay`/`lastDay` calculados desde el año/mes. Misma lógica de filtrado post-query que `/api/fs-sin-asociar`.

**Respuesta:** `Array<{ first_name, last_name, fs_id, sc_related_to, fs_name, fs_numero, fs_fecha, cliente, hora_inicio, hora_fin, horas }>`

---

### `GET /api/horas-mensual-detalle` — Detalle mensual por cliente con calendario

**Query params:** `year`, `month` (default: año/mes actual)

**SQL:**
```sql
SELECT
    COALESCE(a.accountname, 'Sin Cliente') as cliente,
    a.accountid,
    DATE_FORMAT(scf.cf_960, '%Y-%m-%d') as fecha,
    u.first_name, u.last_name,
    sc.subject as fs_name,
    sc.contract_no as fs_numero,
    TIME(scf.cf_932) as hora_inicio,
    TIME(scf.cf_934) as hora_fin,
    TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas
<FS_FROM>
<FS_ACCOUNT>
WHERE DATE_FORMAT(scf.cf_960, '%Y-%m') = ?
  AND scf.cf_932 IS NOT NULL
  AND scf.cf_934 IS NOT NULL
  AND u.deleted = 0
  AND u.id NOT IN (5, 6, 7, 72)
ORDER BY a.accountname, fecha, scf.cf_932
```

**Tablas consultadas:** `vtiger_users`, `vtiger_crmentity`, `vtiger_servicecontracts`, `vtiger_servicecontractscf`, `vtiger_account`

**Agrupación en servidor:** Los rows se agrupan en Node por cliente → días → lista de FS.

**Respuesta:**
```json
[
  {
    "nombre": "Cliente X",
    "accountid": 123,
    "total_horas": 42.5,
    "total_fs": 12,
    "dias_visitados": 5,
    "dias": {
      "2026-06-01": {
        "fecha": "2026-06-01",
        "dia_semana": 1,
        "horas": 8.5,
        "fs_count": 3,
        "tecnicos": 2,
        "fs_list": ["FS-001 | Juan Pérez | 09:00-13:00 (4.0h)", "..."]
      }
    }
  }
]
```

---

### `GET /api/fs-negativos` — FS con horas negativas (hora_fin < hora_inicio)

**Query params:** `date` (YYYY-MM-DD, default: hoy)

**SQL:**
```sql
SELECT
    u.first_name, u.last_name,
    sc.subject as fs_name,
    sc.contract_no as fs_numero,
    a.accountname as cliente,
    TIME(scf.cf_932) as hora_inicio,
    TIME(scf.cf_934) as hora_fin,
    TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas
<FS_FROM>
<FS_ACCOUNT>
<FS_WHERE>
HAVING horas < 0
ORDER BY u.last_name, u.first_name, scf.cf_932
```

**Tablas consultadas:** `vtiger_users`, `vtiger_crmentity`, `vtiger_servicecontracts`, `vtiger_servicecontractscf`, `vtiger_account`

**Respuesta:** `Array<{ first_name, last_name, fs_name, fs_numero, cliente, hora_inicio, hora_fin, horas }>`

---

## Tabs del frontend

### Tab: 📊 Resumen (`#resumen`)

**API endpoint:** `GET /api/horas?date=...`

**Visualización:** Tarjetas (cards) — una por técnico.

| Columna/Elemento | Fuente |
|---|---|
| Nombre del técnico | `first_name + last_name` |
| Horas totales | `total_hours` |
| Cantidad de FS | `fs_count` |
| Lista de FS (hover) | `fs_list` (formateado: contrato + rango horario) |
| **Total horas del día** | Suma de `total_hours` de todos los técnicos |

**Color de cabecera:** verde (≥8h), amarillo (≥5h), rojo (<5h).

---

### Tab: ⏱️ Horas Reales (`#reales`)

**API endpoint:** `GET /api/horasreales?date=...`

**Visualización:** Tarjetas — una por técnico.

| Columna/Elemento | Fuente |
|---|---|
| Nombre del técnico | `first_name + last_name` |
| Horas reales | `horasReales` (cap 8h, con merge de solapamientos) |
| Cantidad de FS | `fs_count` |
| Lista de FS | `fs_list` (formato: `FS \| Cliente \| hh:mm-hh:mm`) |
| **Rangos sin carga** | `horasSinCarga` (alert) |
| **Total horas reales** | Suma de `horasReales` |

**Jornada laboral considerada:** 8:00 a 18:00 (10 horas).

---

### Tab: 📺 Billboard (`#billboard`)

**API endpoint:** `GET /api/horasreales?date=...`

**Visualización:** Grilla de tarjetas compactas (solo técnicos con horas > 0).

| Elemento | Fuente |
|---|---|
| Nombre del técnico | `first_name + last_name` |
| Horas | `horasReales` |
| **Color** | `bg-success` (≥8h), `bg-warning` (≥5h), `bg-danger` (<5h) |

Auto-actualización sin transiciones; preserva el último valor conocido.

---

### Tab: 📋 Detalle FS (`#detalle`)

**API endpoint:** `GET /api/fsdetalle?date=...`

**Visualización:** Tabla HTML.

| Columna | Fuente en API |
|---|---|
| Técnico | `first_name + last_name` |
| FS | `fs_numero` (link a vTiger) |
| Cuenta | `cliente` (accountname) |
| Número | `fs_numero` |
| Hora Inicio | `hora_inicio` |
| Hora Fin | `hora_fin` |
| Horas | `horas` (badge: verde ≥7h, amarillo ≥5h, rojo <5h) |
| Tickets | `tickets` (badge azul) |
| Tareas | `tareas` (badge info) |

---

### Tab: 📅 Mensual (`#mensual`)

**API endpoint:** `GET /api/horas-mensual-detalle?year=...&month=...`

**Visualización:** Selector de mes + buscador de cliente + vista de calendario.

**Vista cliente no seleccionado:**
- Modo cards (toggle): tarjetas de cliente con total_horas, total_fs, días_visitados
- Modo búsqueda: dropdown con sugerencias

**Vista cliente seleccionado:**
- **Calendario mensual** con celdas coloreadas:
  - Verde (≥6h), Amarillo (≥3h), Rojo (<3h), Azul (sin servicio)
- **Detalle del día** (al hacer clic en un día):
  - Día de semana, fecha, horas, FS count, técnicos, lista de FS

| Elemento del calendario | Fuente |
|---|---|
| Horas del día | `dias[fecha].horas` |
| FS del día | `dias[fecha].fs_count` |
| Técnicos del día | `dias[fecha].tecnicos` |
| Lista de FS | `dias[fecha].fs_list` |
| Total cliente | `total_horas`, `total_fs`, `dias_visitados` |

---

### Tab: ⚠️ Sin Asociar (`#sinasociar`)

**API endpoint:** `GET /api/fs-sin-asociar?date=...`

**Visualización:** Tabla HTML (mismas columnas que Detalle FS, sin tickets/tareas).

| Columna | Fuente |
|---|---|
| Técnico | `first_name + last_name` |
| FS | `fs_numero` (link a vTiger) |
| Cuenta | `cliente` |
| Número | `fs_numero` |
| Hora Inicio | `hora_inicio` |
| Hora Fin | `hora_fin` |
| Horas | `horas` |

---

### Tab: 📋 FS Sin Asociar (Mensual) (`#sinasociarmensual`)

**API endpoint:** `GET /api/fs-sin-asociar-mensual?year=...&month=...`

**Visualización:** Tabla HTML con filtros desplegables por técnico y cliente.

| Columna | Fuente |
|---|---|
| Fecha | `fs_fecha` |
| Técnico | `first_name + last_name` (filtrable) |
| FS | `fs_numero` (link a vTiger) |
| Cuenta | `cliente` (filtrable) |
| Número | `fs_numero` |
| Hora Inicio | `hora_inicio` |
| Hora Fin | `hora_fin` |
| Horas | `horas` |

#### Filtros desplegables

- **`tecFilterDropdown`** — Filtro por técnico en columna Técnico
- **`cliFilterDropdown`** — Filtro por cuenta/cliente en columna Cuenta

Ambos se cierran al hacer clic fuera.

---

### Tab: ⏮️ Negativos (`#negativos`)

**API endpoint:** `GET /api/fs-negativos?date=...`

**Visualización:** Tabla HTML.

| Columna | Fuente |
|---|---|
| Técnico | `first_name + last_name` |
| FS | `fs_name` (link a vTiger) |
| Cuenta | `cliente` |
| Número | `fs_numero` |
| Hora Inicio | `hora_inicio` (texto rojo) |
| Hora Fin | `hora_fin` (texto rojo) |
| Horas | `horas` (badge rojo, valor negativo) |

---

## Filtro global de técnico

Input de texto `#filterInput` que filtra en cliente (sin recarga) las tabs: Resumen, Horas Reales, Detalle FS, Sin Asociar, Negativos.

## Auto-refresh

El frontend actualiza todos los endpoints cada **3 minutos** (180000 ms) mediante `setInterval`.
