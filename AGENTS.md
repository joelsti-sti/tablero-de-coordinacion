# AGENTS.md — Dashboard Unificado

Guía para agentes de IA que trabajan en este repositorio.

## Memoria persistente (LEER ANTES DE TRABAJAR)

Este proyecto usa un banco de memoria versionado en `.memory/` con la skill
opencode `memoria` (`.opencode/skills/memoria/SKILL.md`).

- Antes de modificar código, cargar contexto leyendo `.memory/index.md` y el
  archivo temático relevante (arquitectura, errores, pendientes, progreso).
- Al resolver un error o tomar una decisión, registrar en el archivo
  correspondiente con fecha `YYYY-MM-DD`.
- **Nunca** escribir credenciales ni el contenido de `.env` en `.memory/`
  (es versionado y se sube a GitHub).

## Comandos

- Iniciar: `node server.js` (o `iniciar-dashboard.bat`). Puerto `3005`.
- No hay script de test ni lint (package.json test = placeholder).

## Convenciones

- Stack: Node.js CommonJS, Express 5, MySQL vTiger + PostgreSQL cache.
  Frontend: single-file `public/index.html` (vanilla JS).
- Credenciales solo vía env vars (`.env`, gitignored). No agregar defaults
  hardcodeados con contraseñas (ver `.memory/pendientes.md` P1).
- Idioma de código/comentarios en uso: español (sin comentarios salvo que se pidan).

## Alertas de seguridad vigentes

- CORS abierto (`server.js:26`) y servidor en `0.0.0.0` sin auth (`server.js:406`).
- Hay credenciales en defaults de config: NO nuevas credenciales; priorizar
  limpiarlas (`.memory/pendientes.md`).