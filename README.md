# Lurem

Aplicação financeira/bancária — código-fonte e app.

Este é um repositório público: https://github.com/belclei/lurem-code

## Estrutura

```
apps/api      Fastify + Prisma — API (:3001)
apps/web      React + Vite — app web (:5173)
packages/db   Schema Prisma, migrations, client
packages/core Regras de dinheiro (puras, sem I/O)
packages/ui   Design system (componentes React)
packages/domain  Tipos de domínio compartilhados
```

## Setup

```bash
npm install
docker compose up -d   # Postgres + Redis (once per machine; leave running)
npm run dev            # API (:3001) + web (:5173) together
```

## Testes e checagens

```bash
npm run test        # suíte de testes de todos os workspaces
npm run typecheck   # TypeScript em todos os workspaces
npm run lint        # biome
```

Veja documentação em `../docs/` (repo privado) para arquitetura e design system.
