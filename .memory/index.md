# Memoria del proyecto — Dashboard Unificado

Memoria persistente y versionada del proyecto "Tablero de Coordinacion"
(Horas Técnicos / CRM / OCS Inventory / ESET Protect).

## Archivos

| Archivo | Qué encontrarás |
|---------|-----------------|
| `arquitectura.md` | Stack, fuentes de datos, flujos e integraciones |
| `decisiones.md` | Decisiones tomadas y por qué (ADRs) |
| `cambios.md` | Historial de cambios en el código |
| `errores.md` | Errores ocurridos, causa y solución |
| `pendientes.md` | Deuda técnica e issues abiertos |
| `progreso.md` | Estado actual y próximos pasos |

## Cómo usar

1. Antes de trabajar: leer `index.md` + tema relevante.
2. Al resolver un error o tomar decisión: registrar en el archivo correspondiente.
3. Mantener `cambios.md` al día con el historial git.

> Regla de oro: la memoria se versiona en git. Si se rompe algo, primero se
> recupera desde `git log`/`git diff`, luego se anota en `errores.md`.

## Repositorio

- Remote: `https://github.com/joelsti-sti/tablero-de-coordinacion.git`
- Rama por defecto: (ver `git branch`)
- Lanzamiento local: `iniciar-dashboard.bat` o `node server.js` (`http://localhost:3005`)