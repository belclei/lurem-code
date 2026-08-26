## Git Workflow (MANDATORY)

**NEVER push directly to master.** Always use: develop → PR → review → merge to master.

This is not a preference, it's a requirement. Violations will fail the session.

## Pre-PR Checklist

Antes de abrir PR — não delegue para o CI pegar:
- **Lint:** `biome check <dir alterado>` (rápido) ou `npm run lint` (completo)
- **Tests:** suíte local passando
- **Typecheck:** TypeScript limpo

## graphify

Knowledge graph em `graphify-out/`. Para perguntas sobre o codebase, prefira
`graphify query "<pergunta>"` a grep/leitura ampla — retorna subgrafo escopado.
Também: `graphify path "<A>" "<B>"`, `graphify explain "<conceito>"`.
`graphify-out/GRAPH_REPORT.md` só para revisão ampla de arquitetura.
Após modificar código: `graphify update .`
