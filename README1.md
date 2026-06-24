# Comparación CRM / OCS Inventory / ESET Protect

Este proyecto es una herramienta de auditoría y reconciliación de activos IT. Su objetivo principal es cruzar información de tres fuentes distintas para identificar discrepancias en el inventario de equipos y el estado de protección de seguridad.

## Propósito
El sistema permite comparar los equipos registrados en:
1.  **vTiger CRM**: Base de datos de contratos y clientes.
2.  **OCS Inventory**: Inventario técnico de hardware.
3.  **ESET Protect**: Estado de protección de seguridad de los dispositivos.

## Arquitectura

El backend utiliza **Node.js con Express** para gestionar las peticiones, mientras que el frontend es una interfaz web basada en **Vanilla JS/CSS** para una carga ligera y rápida.

### Estructura del Proyecto
- `server.js`: Punto de entrada del backend y orquestador de rutas.
- `public/`: Interfaz de usuario (Dashboard).
- `src/`: Lógica de negocio modularizada:
  - `src/config/`: Credenciales y configuraciones.
  - `src/services/`: Servicios para interactuar con APIs (CRM, OCS, ESET).
  - `src/utils/`: Utilidades de normalización de datos y lógica de cruce (matcher).

## Requisitos de Ejecución
- Node.js (v16+)
- Acceso a la red interna para la base de datos MySQL (CRM)
- Acceso a las APIs de OCS Inventory y ESET Protect

## Instalación

1. Clonar el repositorio.
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Ejecutar la aplicación:
   ```bash
   npm start
   ```

## Configuración y Credenciales
Las configuraciones críticas están centralizadas en `src/config/index.js`.
Los archivos `.md` en la raíz del proyecto contienen documentación técnica adicional sobre los esquemas de bases de datos y accesos:
- `crm_legacy_mysql.md`
- `ocs_credentials.md`
- `eset_credentials.md`
- `sql_credentials.md`
- `vtiger_table_schemas.md`

## Funcionalidad de Comparación
El motor de comparación utiliza un sistema de indexación basado en mapas para un cruce de datos instantáneo (`$O(1)$`), priorizando los siguientes identificadores en orden:
1. Número de Serie
2. UUID
3. Dirección MAC
4. Hostname

## Notas de Operación
- El servidor inicia automáticamente una carga en segundo plano del caché de OCS (`src/services/ocs.service.js`) al arrancar para asegurar que las consultas de comparación sean rápidas.
- Los logs y archivos de caché se encuentran en la carpeta raíz (`ocs_cache.json`).
