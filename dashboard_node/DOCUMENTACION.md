# Dashboard de Horas Técnicos — Documentación del Proyecto

## Stack

| Componente | Tecnología |
|---|---|
| Backend | Node.js + Express 5 |
| Base de datos | MySQL (vTiger CRM 6.x) |
| Frontend | HTML + JavaScript vanilla + Bootstrap 5.3 |
| Conexión DB | mysql2/promise con pool de 10 conexiones |

## Estructura del proyecto

```
dashboard_node/
├── .env                   # Credenciales DB y URL del CRM
├── .env.example           # Plantilla del .env
├── server.js              # API REST (Express, todas las rutas)
├── db.js                  # Pool de conexión MySQL
├── package.json           # Dependencias: dotenv, express, mysql2
├── AGENTS.md              # Política de backups
├── iniciar.bat            # Script para arrancar el servidor
├── backups/
│   ├── create-backup.ps1  # Script de backup
│   └── backup_* /          # Backups automáticos
├── public/
│   └── index.html         # SPA con todas las vistas
└── README.md              # Documentación detallada
```

## Configuración (.env)

```env
DB_HOST=192.168.200.246
DB_USER=claw
DB_PASSWORD=Hxte12Yzz8K4CGlp
DB_NAME=vtigercrm600
DB_PORT=3306
PORT=3000
VTIGER_URL=https://crm.stinetwork.com.ar:8889
```

## Iniciar el servidor

```bash
cd dashboard_node
node server.js
# Servidor listo en puerto 3000
```

O ejecutar `iniciar.bat`.

---

## Base de datos — Tablas principales utilizadas

### Tablas de vTiger CRM

| Tabla | Propósito |
|---|---|
| `vtiger_users` | Técnicos/usuarios |
| `vtiger_crmentity` | Entidad base (createdtime, smownerid, deleted) |
| `vtiger_servicecontracts` | FS (Partes de servicio, field: contract_no, subject, sc_related_to) |
| `vtiger_servicecontractscf` | Campos personalizados de FS (fecha cf_960, hora inicio cf_932, hora fin cf_934, viajes cf_1211/cf_1213, ausencias cf_1046/cf_1048/cf_1050/cf_1052/cf_1054/cf_1227) |
| `vtiger_account` | Clientes |
| `vtiger_crmentityrel` | Relaciones entre módulos (FS ↔ Tickets, FS ↔ Tareas) |
| `vtiger_projecttask` | Tareas (projecttask_no, projecttaskname, projecttaskstatus) |
| `vtiger_projecttaskcf` | Campos personalizados de tareas (cf_1134 = solución) |
| `vtiger_project` | Proyectos (projectid, projectname, project_no) |
| `vtiger_troubletickets` | Tickets (ticket_no, title, status, solution) |
| `vtiger_ticketcf` | Campos personalizados de tickets |

### Campos clave de FS (vtiger_servicecontractscf)

| Campo | Descripción |
|---|---|
| `cf_960` | Fecha del FS (DATE) |
| `cf_932` | Hora de inicio (TIME) |
| `cf_934` | Hora de fin (TIME) |
| `cf_1211` | Viaje ida (minutos) |
| `cf_1213` | Viaje vuelta (minutos) |
| `cf_1046` | Ausente con justificación (checkbox) |
| `cf_1048` | Ausente sin aviso (checkbox) |
| `cf_1050` | Ausente autorizado (checkbox) |
| `cf_1052` | Llegada tarde autorizada (checkbox) |
| `cf_1054` | Llegada tarde injustificada (checkbox) |
| `cf_1227` | Licencia médica (checkbox) |

### IDs de usuario excluidos (no son técnicos de campo)

```sql
u.id NOT IN (5, 6, 7, 72)
```

---

## API — Rutas del servidor

### 1. `GET /` — Página principal
- Sirve `index.html` reemplazando `__VTIGER_URL__` por el valor de `.env`

### 2. `GET /api/config` — Config frontend
- Devuelve `{ vtigerUrl: "..." }`

### 3. `GET /api/horas?date=YYYY-MM-DD` — Resumen diario por técnico
- Agrupa FS por técnico en una fecha
- Suma horas totales, cuenta FS, arma lista de FS con formato: `contract_no (HH:MM-HH:MM)@@viaje:M:SS@@ausencia`
- Excluye usuarios 5, 6, 7, 72

### 4. `GET /api/fsdetalle?date=YYYY-MM-DD` — Detalle de FS diario
- Cada FS individual con cliente, horarios, horas, tickets relacionados, tareas relacionadas
- JOIN con `vtiger_crmentityrel` para contar tickets y tareas

### 5. `GET /api/horasreales?date=YYYY-MM-DD` — Horas reales por técnico (traslapadas)
- Mergea intervalos solapados por técnico, cap a 8h
- Devuelve técnicos con FS procesados + rangos de horas sin carga (8:00-18:00)

### 6. `GET /api/horas-mensual?year=&month=` — Resumen mensual por técnico
- Suma horas por técnico en un mes

### 7. `GET /api/fs-sin-asociar?date=YYYY-MM-DD` — FS sin ticket ni tarea (diario)
- Busca FS que NO tengan relación con HelpDesk ni ProjectTask en `vtiger_crmentityrel`

### 8. `GET /api/fs-sin-asociar-mensual?year=&month=` — FS sin asociar (mensual)

### 9. `GET /api/horas-mensual-detalle?year=&month=` — Detalle mensual por cliente
- Devuelve datos agrupados por cliente y por día
- Usado para el calendario mensual y vista de días

### 10. `GET /api/fs-negativos?date=YYYY-MM-DD` — FS con horas negativas (diario)

### 11. `GET /api/fs-negativos-mensual?year=&month=` — FS negativos (mensual)

### 12. `GET /api/tareas-pendientes?year=&month=` — Tareas cerradas sin solución
- **Condición**: `status IN ('Completed', 'Cerrada')` AND `cf_1134` IS NULL OR empty
- **JOIN**: `vtiger_project` por nombre/número de proyecto, `vtiger_projecttaskcf` por solución

### 13. `GET /api/tickets-pendientes?year=&month=` — Tickets cerrados sin solución
- **Condición**: `status IN ('Closed', 'Cerrado/Para Entregar', 'Resuelto')` AND `solution` IS NULL OR empty

---

## Frontend — Tabs (pestañas)

| Tab | ID | Contenido |
|---|---|---|
| Resumen | `#resumen` | Cards de técnicos con horas/FS (color verde ≥8h, amarillo ≥5h, rojo <5h) |
| Horas Reales | `#reales` | Cards con horas reales (mergeadas, cap 8h) + alerta de horas sin carga |
| Billboard | `#billboard` | Grid compacto de técnicos activos |
| Detalle FS | `#detalle` | Tabla de FS diarios con tickets/tareas |
| Mensual | `#mensual` | Calendario mensual por cliente |
| Sin Asociar | `#sinasociar` | FS sin ticket/tarea (diario) |
| FS Sin Asociar | `#sinasociarmensual` | FS sin asociar mensual con filtros por técnico y cliente |
| Negativos | `#negativos` | FS con horas negativas |
| Tareas Pendientes | `#tareas` | Tareas cerradas sin solución (filtro por técnico) |
| Tickets Pendientes | `#tickets` | Tickets cerrados sin solución (filtro por técnico) |

### Características del frontend

- **Auto-refresh** cada 3 minutos en tabs de resumen diario
- **Filtro global** (barra superior) filtra por nombre/técnico/proyecto en la tabla activa
- **Filtro por técnico** mediante dropdown con checkboxes en tabs: FS Sin Asociar, Tareas, Tickets
- **Formato de horas**: `H:MM` mediante función `fmtHrs()`
- **Formato de viajes**: `viaje:H:MM`
- **Badges de ausencias**: colores según tipo (info = justificado, danger = sin aviso, secondary = viaje)
- **Enlaces a vTiger**: todos los registros (FS, tickets, tareas) linkean al CRM

### Variables globales JS clave

```js
VTIGER_URL          // URL base del CRM para enlaces
currentData         // cache de /api/horas
currentFsData       // cache de /api/fsdetalle
currentRealesData   // cache de /api/horasreales
currentSinAsociarData
currentNegativosData
currentTareasData
currentTicketsData
tareasTecFilter     // Set de técnicos seleccionados (null = todos)
ticketsTecFilter    // Set de técnicos seleccionados (null = todos)
```

---

## Formato de datos

### FS List (en Horas/Resumen)

Formato del `GROUP_CONCAT` (separador `|`):

```
contract_no (HH:MM-HH:MM)@@viaje:M:SS@@Ausente con Justificación
```

Los `@@` se parsean en el frontend para mostrar badges de viaje y ausencia.

### Fechas

- Todos los filtros por mes usan input `type="month"` (valor `YYYY-MM`)
- Las peticiones reciben `year` y `month` como query params separados
- Las fechas de FS (`cf_960`) son tipo DATE
- Las horas (`cf_932`, `cf_934`) son tipo TIME
- `createdtime` es DATETIME de `vtiger_crmentity`

---

## Funciones útiles del servidor (server.js)

| Función | Descripción |
|---|---|
| `parseTime(timeStr)` | "HH:MM:SS" → minutos desde medianoche |
| `mergeIntervals(intervals)` | Mergea intervalos `{start, end}` solapados |
| `minutesInHour(merged, hourStart, hourEnd)` | Minutos trabajados dentro de una hora específica |
| `buildRelSubquery(modules, alias)` | Genera subquery para contar relaciones en `vtiger_crmentityrel` |

## Backup

```powershell
.\backups\create-backup.ps1
# Crea backups/backup_YYYYMMDD_HHmmss/ con server.js, index.html, .env, db.js, package.json
```

---

## Para recrear el proyecto desde cero

```bash
mkdir dashboard_node && cd dashboard_node
npm init -y
npm install dotenv express mysql2
# Crear .env, db.js, server.js, public/index.html
node server.js
```
