---
name: memoria
description: Memoria persistente del proyecto Dashboard Unificado. Usala cuando el usuario pida guardar o consultar memoria, registrar un error, una decisión o un cambio, retomar trabajo tras un fallo, o al iniciar una sesión de trabajo sobre este proyecto para cargar contexto.
---

# Memoria persistente del proyecto

El banco de memoria vive en `.memory/` y está **versionado en git**: cada
cambio importante queda registrado y se puede recuperar con `git log` /
`git diff` si algo sale mal.

## Cuándo usar esta skill

- Al comenzar a trabajar en este proyecto: leer `.memory/index.md` y los
  archivos relevantes para cargar contexto.
- Cuando el usuario reporta un error o un bug que no se resolvió de inmediato.
- Cuando se toma una decisión de diseño o arquitectura.
- Cuando se completa o descubre trabajo significativo.
- Cuando se pide "revisar la memoria" o "volver de un error".

## Estructura del banco de memoria

| Archivo | Contenido |
|---------|-----------|
| `.memory/index.md` | Índice maestro: qué hay en cada archivo y estado actual |
| `.memory/arquitectura.md` | Cómo está armado el sistema (stack, flujos, integraciones) |
| `.memory/decisiones.md` | Decidir: qué y por qué se decidió (log tipo ADR) |
| `.memory/cambios.md` | Cambiar: historial de modificaciones por fecha |
| `.memory/errores.md` | Fallar: errores ocurridos, causa raíz y cómo se resolvieron |
| `.memory/pendientes.md` | Mejorar: deuda técnica e issues abiertos |
| `.memory/progreso.md` | Continuar: estado actual, tareas en curso y próximos pasos |

## Protocolo

1. **Cargar contexto**: al iniciar trabajo, leer `.memory/index.md` y el
   archivo temático relevante (arquitectura/errores/pendientes) antes de tocar
   código.
2. **Entradas con fecha**: cada entrada lleva `YYYY-MM-DD` (`2026-09-16`).
   Las entradas nuevas se **agregan** (append) con la fecha más reciente
   primero, no se borran las anteriores.
3. **Registrar un error**: anotar en `.memory/errores.md` el síntoma, causa
   raíz, solución aplicada y cómo prevenirlo. Si todavía no tiene solución,
   dejar el estado como `PENDIENTE` y agregarlo a `.memory/pendientes.md`.
4. **Registrar una decisión**: anotar en `.memory/decisiones.md` el contexto,
   la decisión, alternativas descartadas y consecuencias.
5. **Cerrar sesión / entregar**: si se hizo un commit o se resolvió un ticket,
   actualizar `.memory/cambios.md` (una línea por cambio) y `.memory/index.md`.
6. **Seguridad**: jamás escribir credenciales, contraseñas o el contenido de
   `.env` en la memoria. Esto está versionado en git y se sube a GitHub.

## Reglas de estilo

- Lenguaje español (mismo que el proyecto).
- Entradas breves: 1-5 líneas salvo diagnóstico de errores complejos.
- Vincular `archivo:línea` (ej. `server.js:26`) cuando se referencia código.
- No duplicar: si ya está documentado, actualizar la entrada existente.