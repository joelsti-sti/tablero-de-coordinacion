# CRM Database Structure (vtiger CRM)

## Core Tables

| Table | Description |
|-------|-------------|
| `vtiger_crmentity` | Core entity table - all modules reference this via `crmid`. Contains `deleted` flag (0=active, 1=deleted) |
| `vtiger_account` | Companies/Accounts |
| `vtiger_contactdetails` | Contacts (people) linked to accounts via `accountid` |
| `vtiger_servicecontracts` | Service contracts linked to accounts via `sc_related_to` |

## Custom Field Tables

### Account Custom Fields (`vtiger_accountscf`)

| Column | Label | Type | Description |
|--------|-------|------|-------------|
| `cf_735` | Referente | varchar(20) | Contact person name |
| `cf_739` | Razón Social | varchar(60) | Legal company name |
| `cf_745` | Tipo de Contrato | varchar(255) | Contract type (Abonado, Eventual, etc.) |
| `cf_996` | Email del referente | varchar(50) | Contact email |
| `cf_1006` | Tipo de Mantenimiento | varchar(255) | Maintenance type |
| `cf_1008` | Frecuencia de visitas | varchar(255) | Visit frequency |
| `cf_1016` | Frecuencia Mant. Remoto | varchar(255) | Remote maintenance frequency |
| `cf_1020` | Particularidades del abono | text | Subscription details |
| `cf_1036` | Razón Social 2 | varchar(50) | Secondary legal name |
| `cf_1038` | CUIT 2 | bigint(20) | Secondary tax ID |
| `cf_1092` | Contrato Kydat | varchar(3) | Kydat contract flag |
| `cf_1096` | Contrato Cant de servidores | int(10) | Physical servers count |
| `cf_1098` | Contrato cant de Estaciones de trabajo | int(10) | Workstations count |
| `cf_1102` | Contrato Cant clientes BackUp | int(10) | Backup clients count |
| `cf_1104` | Contrato Cant de servidores virtuales | int(10) | Virtual servers count |
| `cf_1106` | Contrato Cant NAS | int(10) | NAS devices count |
| `cf_1108` | Contrato Soporte cámaras | varchar(3) | Security camera support |
| `cf_1110` | Contrato servidor Proxy | varchar(3) | Proxy server maintenance |
| `cf_1112` | Contrato Espacio Acronis | bigint(20) | Acronis storage space |
| `cf_1114` | Contrato Cant de visitas anuales | bigint(20) | Annual visits count |
| `cf_1203` | semana de visita | varchar(255) | Visit week |
| `cf_1205` | Dias de visita | varchar(255) | Visit days |
| `cf_1225` | TAG | varchar(60) | **OCS Inventory tag** (used for matching) |

### Contact Custom Fields (`vtiger_contactscf`)

| Column | Label | Type | Description |
|--------|-------|------|-------------|
| `cf_747` | Sucursal | varchar(255) | Branch/office |
| `cf_1163` | Usuario Activo | varchar(255) | Active user flag (`si`/`no`) |
| `cf_1215` | Hostname Equipo | varchar(60) | **Primary hostname** |
| `cf_1217` | Serial Number | varchar(100) | **Primary serial number** |
| `cf_1219` | Mac ETH | varchar(60) | **Primary Ethernet MAC** |
| `cf_1221` | Mac WiFi | varchar(60) | **Primary WiFi MAC** |
| `cf_1223` | UUID EQUIPO | varchar(120) | **Primary UUID** |
| `cf_1229` | cantidad de pc | varchar(255) | PC count |
| **Equipment 2** |
| `cf_1233` | Hostname Equipo 2 | varchar(60) | Secondary hostname |
| `cf_1235` | UUID EQUIPO 2 | varchar(100) | Secondary UUID |
| `cf_1241` | Mac -ETH 2 | varchar(60) | Secondary Ethernet MAC |
| `cf_1243` | Mac WiFi 2 | varchar(100) | Secondary WiFi MAC |
| `cf_1249` | Serial Number 2 | varchar(60) | Secondary serial number |
| **Equipment 3** |
| `cf_1237` | Hostname Equipo 3 | varchar(60) | Tertiary hostname |
| `cf_1239` | UUID EQUIPO 3 | varchar(60) | Tertiary UUID |
| `cf_1245` | Mac WiFi 3 | varchar(60) | Tertiary WiFi MAC |
| `cf_1247` | Mac - ETH 3 | varchar(60) | Tertiary Ethernet MAC |
| `cf_1251` | Serial Number 3 | varchar(60) | Tertiary serial number |

### Service Contract Custom Fields (`vtiger_servicecontractscf`)

| Column | Label | Type | Description |
|--------|-------|------|-------------|
| `cf_958` | (Tipo de servicio) | varchar(255) | Service type - **"Abonado"** identifies active subscribers |
| `cf_922` | - | varchar(255) | Additional field |
| `cf_930` | - | int(4) | Additional field |
| `cf_932` | - | time | Time field |
| `cf_934` | - | time | Time field |
| `cf_954` | - | text | Text field |
| `cf_956` | - | text | Text field |
| `cf_960` | - | date | Date field |
| `cf_966` | - | varchar(255) | Additional field |
| `cf_968` | - | text | Text field |
| `cf_970` | - | varchar(20) | Additional field |
| `cf_1002` | - | varchar(20) | Additional field |
| `cf_1026` | - | varchar(255) | Additional field |
| `cf_1030` | - | varchar(255) | Additional field |
| `cf_1034` | - | varchar(255) | Additional field |
| `cf_1046` | - | varchar(3) | Flag field |
| `cf_1048` | - | varchar(3) | Flag field |
| `cf_1050` | - | varchar(3) | Flag field |
| `cf_1052` | - | varchar(3) | Flag field |
| `cf_1054` | - | varchar(3) | Flag field |
| `cf_1088` | - | int(4) | Integer field |
| `cf_1157` | - | varchar(3) | Flag field |
| `cf_1211` | - | int(3) | Integer field |
| `cf_1213` | - | int(3) | Integer field |
| `cf_1227` | - | varchar(3) | Flag field |
| `cf_1261` | - | varchar(3) | Flag field |

## Key Relationships

```
vtiger_account (accountid)
    │
    ├──→ vtiger_accountscf (accountid)  -- 1:1 custom fields
    │
    ├──→ vtiger_contactdetails (accountid)  -- 1:N contacts
    │       │
    │       └──→ vtiger_contactscf (contactid)  -- 1:1 custom fields per contact
    │
    └──→ vtiger_servicecontracts (sc_related_to)  -- 1:N contracts
            │
            └──→ vtiger_servicecontractscf (servicecontractsid)  -- 1:1 custom fields
```

## Current Usage in Code

### `getCrmComputers(cliente)` - `src/services/crm.service.js:5`
- Fetches accounts matching `cliente.empresa` (split by `/`)
- Reads account custom fields: `cf_1098` (workstations), `cf_1096` (physical servers), `cf_1104` (virtual servers)
- Fetches contacts for those accounts with all contact custom fields
- Maps contact CFs to device objects: hostname, serial, MACs (ETH+WiFi), UUID, usuarioActivo

### `getAbonados()` - `src/services/crm.service.js:82`
- Finds active service contracts where `cf_958 = 'Abonado'`
- Returns distinct accounts with `accountid` and `accountname`
- Used to merge with local `clientes.json` in `refreshClientes()`

## Missing from Current Implementation

The code only reads **Equipment 1** fields (`cf_1215`, `cf_1217`, `cf_1219`, `cf_1221`, `cf_1223`). 

**Equipment 2 & 3 fields are not being read:**
- `cf_1233`, `cf_1235`, `cf_1241`, `cf_1243`, `cf_1249` (Equipment 2)
- `cf_1237`, `cf_1239`, `cf_1245`, `cf_1247`, `cf_1251` (Equipment 3)

These could be added to capture multiple devices per contact.