# ESET Protect API - Parámetros de Integración

Documentación extraída del dashboard de relevamiento de equipos.

---

## 1. Autenticación (OAuth2)

### POST /api/auth (proxy local)

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `username` | string | Usuario API de ESET Business Account |
| `password` | string | Contraseña del usuario API |
| `region` | string | Región: `us`, `eu`, `de`, `ca`, `jpn` |

**Request:**
```json
{ "username": "user@domain.com", "password": "xxxx", "region": "us" }
```

**Response exitosa:**
```json
{ "ok": true, "expires_in": 3600 }
```

**Endpoint real ESET IAM:**
```
POST https://{region}.business-account.iam.eset.systems/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username={user}&password={pass}&refresh_token=
```

**Response real (token):**
```json
{
  "access_token": "eyJ...",
  "expires_in": 3600,
  "token_type": "bearer",
  "scope": "read write"
}
```

> El token se cachea y se renueva automáticamente 60 segundos antes de expirar.

---

## 2. Endpoints de Dispositivos

### GET /v1/devices (proxy: GET /api/devices)

Lista paginada de todos los dispositivos.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `pageSize` | int | Máximo por página (usar `1000`) |
| `pageToken` | string | Token para siguiente página |

**Host:** `{region}.device-management.eset.systems`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Response:**
```json
{
  "devices": [ { ... } ],
  "nextPageToken": "token_para_siguiente_pagina"
}
```

### GET /v1/devices/{uuid} (proxy: GET /api/devices/:uuid)

Detalle de un dispositivo individual por UUID.

**Response:**
```json
{
  "device": { ... }
}
```

---

## 3. Estructura del Device Object

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `uuid` | string | `"a1b2c3d4-..."` |
| `displayName` | string | `"PC-JUAN"` |
| `originalDisplayName` | string | `"PC-JUAN"` |
| `description` | string | `"Oficina 3er piso"` |
| `deviceType` | string | `"DEVICE_TYPE_COMPUTER"` |
| `primaryLocalIpAddress` | string | `"192.168.1.100"` |
| `publicIpAddress` | string | `"200.50.30.20"` |
| `isMobile` | boolean | `false` |
| `isMuted` | boolean | `false` |
| `functionalityStatus` | string | Ver tabla abajo |
| `functionalityProblemCount` | int | `2` |
| `lastSyncTime` | string (ISO) | `"2026-06-15T18:30:00Z"` |
| `parentGroupUuid` | string | `"grp-..."` |
| `operatingSystem` | object | Ver abajo |
| `hardwareProfiles` | array | Ver abajo |
| `deployedComponents` | array | Ver abajo |
| `activeProducts` | array | Ver abajo |

### 3.1 operatingSystem

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `displayName` | string | `"Microsoft Windows 11 Pro"` |
| `version` | object | `{ "name": "10.0.22631", "major": 10, "minor": 0, "build": 22631 }` |

### 3.2 functionalityStatus (mapeo)

| Valor API | Label Dashboard | Badge |
|-----------|---------------|-------|
| `DEVICE_FUNCTIONALITY_STATUS_OK` | OK | verde |
| `DEVICE_FUNCTIONALITY_STATUS_ATTENTION_RECOMMENDED` | Atención recomendada | amarillo |
| `DEVICE_FUNCTIONALITY_STATUS_ATTENTION_REQUIRED` | Atención requerida | rojo |
| (otro) | No especificado | gris |

### 3.3 deviceType (mapeo)

El prefijo `DEVICE_TYPE_` se elimina para mostrar. Ejemplos:
- `DEVICE_TYPE_COMPUTER` → `COMPUTER`
- `DEVICE_TYPE_SERVER` → `SERVER`
- `DEVICE_TYPE_MOBILE` → `MOBILE`

### 3.4 hardwareProfiles[0]

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `manufacturer` | string | Fabricante, ej. `"Dell Inc."` |
| `model` | string | Modelo, ej. `"Latitude 5420"` |
| `bios` | object | Ver abajo |
| `processors` | array | `[{ "caption": "Intel Core i7-1265U", "architecture": "x64" }]` |
| `hardDrives` | array | Ver abajo |
| `networkAdapters` | array | Ver abajo |

#### BIOS

| Campo | Tipo |
|-------|------|
| `manufacturer` | string |
| `serialNumber` | string |
| `uuid` | string |

#### hardDrives[]

| Campo | Tipo |
|-------|------|
| `displayName` | string |
| `capacityBytes` | string (numérico) |
| `driveType` | string |
| `serialNumber` | string |

#### networkAdapters[]

| Campo | Tipo |
|-------|------|
| `caption` | string |
| `macAddress` | string |

### 3.5 deployedComponents[]

| Campo | Tipo |
|-------|------|
| `displayName` | string |
| `name` | string |
| `version` | `{ "name": "10.1.234" }` |

### 3.6 activeProducts[]

| Campo | Tipo |
|-------|------|
| `name` | string |
| `validityDate` | `{ "year": 2026, "month": 6 }` |

---

## 4. Regiones Disponibles

| Código | Nombre |
|--------|--------|
| `us` | United States |
| `eu` | Europe |
| `de` | Germany |
| `ca` | Canada |
| `jpn` | Japan |

---

## 5. Hosts ESET

| Servicio | Host |
|----------|------|
| IAM (auth) | `{region}.business-account.iam.eset.systems` |
| Device Management | `{region}.device-management.eset.systems` |

---

## 6. Flujo de Integración

```
1. POST /oauth/token  (grant_type=password)
   → obtiene access_token (bearer)

2. GET /v1/devices?pageSize=1000
   (con paginación por nextPageToken)
   → obtiene lista de dispositivos

3. GET /v1/devices/{uuid}
   → obtiene detalle de un dispositivo
```

---

## 7. Notas

- El token se envía como `Authorization: Bearer {access_token}` en cada request.
- La paginación usa `pageSize=1000` máximo y `nextPageToken` para iterar.
- Renovar el token antes de que expire (restar 60s de seguridad).
- No requiere API key adicional, solo usuario/contraseña de la consola ESET Business Account.
