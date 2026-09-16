# Decisiones — Dashboard Unificado

Formato: contexto → decisión → alternativas → consecuencias. Las más recientes primero.

---

## 2026-09-16 — Adoptar sistema de memoria persistente en el repo

- **Contexto**: no había registro persistente de cambios/errores/decisiciones;
  solo el historial git. Queremos poder "volver de errores" y manejar mejor el proyecto.
- **Decisión**: crear banco de memoria versionado en `.memory/` + skill opencode
  `.opencode/skills/memoria/SKILL.md` + `AGENTS.md`.
- **Alternativas descartadas**: plugins externos (open-mem, opencode-claude-memory,
  memory-bank) → dependencia extra, datos fuera de git; `grill-me` → no es de memoria.
- **Consecuencia**: la memoria vive en el repo y viaja con git/GitHub.
  Cuidado: no escribir credenciales en `.memory/`.

## 2026-09-16 — (Registrar aquí cada decisión futura)

- <!-- Plantilla:
  ## YYYY-MM-DD — Título
  - **Contexto**:
  - **Decisión**:
  - **Alternativas descartadas**:
  - **Consecuencias**:
  -->