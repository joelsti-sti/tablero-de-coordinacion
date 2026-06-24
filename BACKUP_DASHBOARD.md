# BACKUP - Dashboard Comparación CRM / OCS / ESET

**Fecha backup:** 2026-06-24
**Versión:** 1.0.0

---

## Índice

1. [Descripción General](#1-descripción-general)
2. [Estructura del Proyecto](#2-estructura-del-proyecto)
3. [Arquitectura y Flujo](#3-arquitectura-y-flujo)
4. [Endpoints de la API](#4-endpoints-de-la-api)
5. [Configuración](#5-configuración)
6. [Formato de clientes.json](#6-formato-de-clientesjson)
7. [Respuesta de /api/compare/:index](#7-respuesta-de-apicompareindex)
8. [Fuentes de Datos](#8-fuentes-de-datos)
   - 8.1 CRM (Vtiger MySQL)
   - 8.2 OCS Inventory API
   - 8.3 ESET Protect API
9. [Algoritmo de Matching](#9-algoritmo-de-matching)
10. [Posibles Mejoras](#10-posibles-mejoras)
11. [Problemas Conocidos](#11-problemas-conocidos)

---

## 1. Descripción General

Aplicación Node.js/Express que compara inventarios de equipos desde **3 fuentes distintas** (CRM Vtiger, OCS Inventory, ESET Protect) y las correlaciona para detectar discrepancias. Los resultados se visualizan en un dashboard web single-page (HTML + JS vanilla).

**Stack técnico:**
- **Backend:** Node.js + Express 5 + mysql2 + axios
- **Frontend:** HTML5 + CSS3 + Vanilla JS (sin frameworks)
- **Formato:** CommonJS
- **Puerto:** 3005

---

## 2. Estructura del Proyecto

```
comparacion-ocs-crm-eset/
├── server.js                    # Entry point - Express server + rutas API
├── package.json                 # Dependencias y scripts
├── clientes.json                # Catálogo de clientes (credenciales y tags)
├── ocs_cache.json               # Caché OCS generado automáticamente
├── ESET-API-REFERENCIA.md       # Documentación de la API de ESET
├── README.md                    # Este archivo
├── src/
│   ├── config/
│   │   └── index.js             # Configuración (DB, OCS, ESET, puerto)
│   ├── services/
│   │   ├── crm.service.js       # Consulta MySQL a Vtiger CRM
│   │   ├── ocs.service.js       # API OCS Inventory (con caché)
│   │   └── eset.service.js      # API ESET Protect (multi-región)
│   └── utils/
│       ├── normalization.js     # Normalización de MAC, serial, hostname
│       └── matcher.js           # Algoritmo de matching entre fuentes
└── public/
    └── dashboard.html           # Frontend SPA del dashboard
```

---

## 3. Arquitectura y Flujo

```
                  ┌──────────────────┐
                  │   clientes.json  │
                  │  (50+ clientes)  │
                  └────────┬─────────┘
                           │
  ┌────────────────────────┼──────────────────────────┐
  │                        │                          │
  ▼                        ▼                          ▼
┌─────────────┐   ┌──────────────┐   ┌──────────────────┐
│ CRM Service │   │ OCS Service  │   │  ESET Service    │
│  (MySQL)    │   │ (REST + caché)│   │(REST multi-region)│
│ vtiger CRM  │   │ ocsapi/v1    │   │ device-management│
└──────┬──────┘   └──────┬───────┘   └────────┬─────────┘
       │                 │                     │
       └─────────────────┼─────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │   matcher.js │
                  │  (matching)  │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │   server.js  │
                  │  (API REST)  │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  dashboard   │
                  │    .html     │
                  └──────────────┘
```

**Flujo de una comparación:**

1. Usuario selecciona cliente y hace clic en "Comparar"
2. `server.js` recibe `POST /api/compare/:index`
3. Ejecuta en paralelo (`Promise.all`):
   - `getCrmComputers(cliente)` → MySQL → devices + contracts
   - `getEsetComputers(cliente)` → ESET API (prueba regiones hasta encontrar datos)
   - `getOcsComputers(cliente)` → Caché local OCS (precargada)
4. `matchDevices(crm, ocs, eset)` cruza los 3 listados
5. Devuelve JSON con devices matcheados + summary + contracts
6. Dashboard renderiza stats, summary y tabla

---

## 4. Endpoints de la API

### `GET /api/clientes`
Lista todos los clientes del catálogo.

**Response:**
```json
[
  { "id": 0, "empresa": "Aconcagua / Aconcagua Lanus", "tag_ocs": "ACONCAGUA", "has_eset": true },
  ...
]
```

### `GET /api/ocs-cache-status`
Estado actual del caché OCS.

**Response:**
```json
{ "loading": false, "progress": "OCS Crawl complete: 15000 computers in 45.2s", "count": 15000, "tags": 65 }
```

### `POST /api/load-ocs-cache`
Dispara la recarga completa del caché OCS en background (asíncrono).

**Response:**
```json
{ "status": "started" }
```
o
```json
{ "status": "already_loading", "progress": "Crawling OCS... 5000 records found" }
```

### `POST /api/compare/:clienteIndex`
Ejecuta la comparación completa para un cliente.

**Response:** Ver [sección 7](#7-respuesta-de-apicompareindex).

---

## 5. Configuración

Archivo: `src/config/index.js`

```javascript
{
  CRM_DB: {
    host: '192.168.200.246',
    port: 3306,
    user: 'claw',
    password: '***',
    database: 'vtigercrm600'
  },
  OCS_DEFAULT: {
    baseURL: 'https://ocs.stinetwork.com.ar:44380/ocsapi/v1',
    auth: { username: 'stinetwork', password: '***' }
  },
  ESET_CONFIG: {                    // NO SE USA actualmente (la región se prueba dinámicamente)
    iamUrl: 'https://us.business-account.iam.eset.systems',
    deviceApiUrl: 'https://us.device-management.eset.systems'
  },
  PORT: 3005,
  OCS_CACHE_PATH: './ocs_cache.json'
}
```

---

## 6. Formato de clientes.json

```json
{
  "empresa": "Nombre del Cliente / Otra Razón Social",
  "email_eset": "usuario@stidns.com",        // null si no tiene ESET
  "password_eset": "contraseña",              // null si no tiene ESET
  "tag_ocs": "TAG_OCS",                       // string o array de strings
  "ocs_custom_url": "https://..." ,            // opcional: servidor OCS externo
  "ocs_custom_user": "user",                   // opcional
  "ocs_custom_pass": "pass",                   // opcional
  "sheets": {                                 // IDs de Google Sheets (no usado en API actual)
    "generales": "sheetId",
    "terminales": "sheetId",
    "servidores": "sheetId"
  }
}
```

**Campos clave:**
- `empresa`: Se divide por `/` para buscar múltiples cuentas en CRM (ej. `"Indelplas / De la Fuente Ricardo"` busca ambas)
- `tag_ocs`: Puede ser string o array. Se normaliza a mayúsculas.
- `email_eset` / `password_eset`: Credenciales ESET. Si son `null`, se salta la consulta ESET.
- `ocs_custom_*`: Para clientes con servidor OCS propio (ej. Ardal).

---

## 7. Respuesta de /api/compare/:index

```json
{
  "cliente": "Indelplas / De la Fuente Ricardo",
  "totalCRM": 25,
  "totalOCS": 30,
  "totalESET": 20,
  "contracts": [
    {
      "accountId": 123,
      "accountName": "Indelplas",
      "estacionesTrabajo": 30,
      "servidoresFisicos": 2,
      "servidoresVirtuales": 1
    }
  ],
  "matchedDevices": [ ... ],
  "summary": {
    "enTres": 15,
    "crmOcs": 5,
    "crmEset": 2,
    "ocsEset": 3,
    "soloCrm": 3,
    "soloOcs": 10,
    "soloEset": 0
  }
}
```

**matchedDevices[]** - Cada entry:

```json
{
  "matchMethod": "serial|uuid|mac|hostname|none",
  "crm": {
    "present": true,
    "hostname": "PC-123",
    "serialNumber": "ABC123",
    "macAddress": ["aabbccddeeff"],
    "uuid": "550e8400-e29b-...",
    "info": "Indelplas",
    "contactName": "Juan Perez",
    "usuarioActivo": true
  },
  "ocs": {
    "present": true,
    "hostname": "PC-123",
    "serialNumber": "ABC123",
    "uuid": "550e8400-e29b-...",
    "macAddress": ["aabbccddeeff"],
    "info": "INDELPLAS"
  },
  "eset": {
    "present": true,
    "hostname": "PC-123",
    "serialNumber": "ABC123",
    "macAddress": ["aabbccddeeff"],
    "uuid": null,
    "info": ""
  }
}
```

---

## 8. Fuentes de Datos

### 8.1 CRM (Vtiger MySQL)

**Servicio:** `src/services/crm.service.js`
**Conexión:** MySQL directa con `mysql2/promise`
**Base:** `vtigercrm600` en `192.168.200.246`

**Tablas consultadas:**
- `vtiger_account` → Cuentas (busca por `accountname LIKE %...%`)
- `vtiger_accountscf` → Campos personalizados de cuenta:
  - `cf_1098` = Estaciones de Trabajo
  - `cf_1096` = Servidores Físicos
  - `cf_1104` = Servidores Virtuales
- `vtiger_contactdetails` → Contactos (equipos)
- `vtiger_contactscf` → Campos personalizados de contacto:
  - `cf_1215` = Hostname
  - `cf_1217` = Serial Number
  - `cf_1219` = MAC Ethernet
  - `cf_1221` = MAC WiFi
  - `cf_1223` = UUID
  - `cf_1163` = Usuario Activo (si/no)
- `vtiger_crmentity` → Filtra `deleted = 0`

**Campos personalizados (`cf_*`):** Si se reinstala Vtiger o se migra, estos IDs pueden cambiar. Verificar con `vtiger_field` y `vtiger_tab`.

### 8.2 OCS Inventory API

**Servicio:** `src/services/ocs.service.js`

**Endpoint principal:** `{baseURL}/computers?start={offset}&limit={limit}`

**Cache:** Se precarga todo el inventario OCS en `ocs_cache.json` (agrupado por TAG). La recarga se dispara:
- Al iniciar el servidor (background)
- Manualmente desde el dashboard ("Recargar Caché OCS")

**Concurrencia:** 15 requests paralelos, 500 registros cada uno.
**Timeout:** 60s.

**OCS externo:** Clientes con `ocs_custom_url` consultan su propio servidor OCS directamente (sin caché). Ej: Ardal.

**Estructura de computer (OCS):**
```
hardware.NAME      → hostname
hardware.ID        → ocsId
hardware.UUID      → uuid
bios.SSN           → serialNumber
networks[].MACADDR → MAC (solo Ethernet/Wifi)
accountinfo[].TAG  → Tag de agrupación
```

### 8.3 ESET Protect API

**Servicio:** `src/services/eset.service.js`

**Autenticación:** OAuth2 password grant
```
POST https://{region}.business-account.iam.eset.systems/oauth/token
Body: grant_type=password&username={email}&password={pass}
Response: { access_token: "eyJ...", expires_in: 3600 }
```

**Device API:**
```
GET https://{region}.device-management.eset.systems/v1/devices?pageSize=1000
Headers: Authorization: Bearer {access_token}
```

**Regiones disponibles (se prueban en orden, se detiene al encontrar datos):**
1. `us` - United States
2. `eu` - Europe
3. `de` - Germany
4. `ca` - Canada
5. `jpn` - Japan

**Paginación:** Usa `nextPageToken` para iterar (max 1000 por página).
**Timeout:** 30s.
**Filtro por tags:** Actualmente comentado (trae TODOS los dispositivos de la región que responda).

**Estructura del device (ESET):**
```
uuid                       → esetId
displayName / originalDisplayName → hostname
hardwareProfiles[0].bios.serialNumber → serialNumber
hardwareProfiles[0].networkAdapters[].macAddress → MACs
tags[]                     → tags del dispositivo
```

---

## 9. Algoritmo de Matching

Archivo: `src/utils/matcher.js`

**Estrategia:** CRM como base → matchea contra OCS y ESET.

**Prioridad de matching (contra cada pool):**
1. **Serial** (mayor prioridad)
2. **UUID** (solo para OCS)
3. **MAC address**
4. **Hostname** (menor prioridad, normalizado: lowercase + sin dominio)

**Orden de procesamiento:**
1. Todos los dispositivos CRM → buscan match en OCS y ESET
2. Dispositivos OCS restantes (no usados) → buscan match en ESET
3. Dispositivos ESET restantes → quedan como "solo ESET"

**Cada dispositivo solo se matchea una vez** (control con `usedOcs` / `usedEset` Sets).

---

## 10. Posibles Mejoras

### Alta prioridad

- [ ] **Filtro por tags ESET:** Re-activar el filtro de tags en `eset.service.js` (actualmente comentado en línea 63 de la versión original). El filtro debería comparar los tags del dispositivo ESET con `normalizedClientTags`.
- [ ] **Licencias contratadas:** Agregar campo `licencias_contratadas` en `clientes.json` (carga manual) y mostrar en dashboard como "Contratadas vs Usadas (ESET)".
- [ ] **Manejo de errores ESET por cliente:** Si un cliente no tiene ESET (credenciales null), skip silencioso (ya implementado). Si todas las regiones fallan, loggear el error del último intento.

### Media prioridad

- [ ] **Offset CRM dinámico:** Si un cliente tiene muchos contactos, la query podría necesitar paginación o límite.
- [ ] **Cache de tokens ESET:** El token OAuth2 expira en 1 hora. Actualmente se pide uno nuevo en cada compara. Se podría cachear por cliente.
- [ ] **Dashboard responsive:** La tabla tiene `min-width: 1400px` y no es mobile-friendly.
- [ ] **Exportar a CSV/Excel:** Botón para descargar los resultados de la comparación.

### Baja prioridad

- [ ] **Dependencias desactualizadas:** Express 5.2.1, axios 1.16.1. Revisar seguridad.
- [ ] **Migrar a ESET PROTECT Hub API:** ESET está migrando de EBA a PROTECT Hub. La API puede cambiar.
- [ ] **TypeScript:** Migrar el proyecto a TypeScript para mejor mantenibilidad.
- [ ] **Tests automatizados:** No hay tests. Agregar tests unitarios para matcher y normalization.

---

## 11. Problemas Conocidos

1. **ESET 404 multi-región (RESUELTO):** El código ahora prueba las 5 regiones automáticamente y se detiene en la primera que devuelva datos. Antes estaba hardcodeado a `us`.

2. **Diferencia licencias EBA vs API:** ESET Business Account muestra licencias contratadas/asignadas. La API de Device Management muestra dispositivos reales con agente. Suelen diferir. No hay API pública para obtener el número de licencias contratadas.

3. **Tags ESET vacíos:** Algunos dispositivos en ESET no tienen tags asignados, por lo que el filtro por tag no funcionaría. Actualmente el filtro está desactivado (trae todo).

4. **cf_* fields en CRM:** Los campos `cf_1096`, `cf_1098`, `cf_1104`, `cf_1163`, `cf_1215`, `cf_1217`, `cf_1219`, `cf_1221`, `cf_1223` son específicos de esta instalación de Vtiger. Si se migra o reinstala Vtiger, estos IDs cambian. Hay que mapearlos nuevamente consultando `vtiger_field` y `vtiger_tab`.

5. **Timeout OCS en clientes grandes:** Con 15 requests concurrentes de 500 registros, si OCS tiene +10000 equipos puede demorar. El timeout es de 60s.

6. **Dependencia de red local:** La conexión a MySQL CRM requiere estar en la misma red (192.168.x.x). No funciona desde fuera de la LAN.

---

## Archivos fuente (hash de contenido para verificar integridad futura)

Para verificar que los archivos no fueron modificados accidentalmente, se pueden comparar con:
```
sha256sum src/config/index.js
sha256sum src/services/crm.service.js
sha256sum src/services/ocs.service.js
sha256sum src/services/eset.service.js
sha256sum src/utils/matcher.js
sha256sum src/utils/normalization.js
sha256sum server.js
sha256sum public/dashboard.html
sha256sum package.json
```

---

*Documento generado el 2026-06-24 como backup del proyecto `comparacion-ocs-crm-eset`.*
