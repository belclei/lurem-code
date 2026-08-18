-- Idempotent upsert of feature flags, all turned on. Flags previously lived
-- only in seed.ts (never run in prod), so the "connections" flag row was
-- missing there entirely — its route guard defaulted to disabled for every
-- request. Moving flag definitions into a migration guarantees prod always
-- has these rows regardless of whether seed ever runs.
INSERT INTO "FeatureFlag" (key, description, state, "rolloutPercent", "updatedAt")
VALUES
  ('connections', 'Funcionalidade geral de conexões entre usuários.', 'on', 100, now()),
  ('connections.portador', 'Atribuição de transações a um conectado (portador) e fluxo de acerto entre contas conectadas.', 'on', 100, now()),
  ('imports.pipeline', 'Pipeline de importação de extratos/faturas (extração client-side + LLM DeepSeek + staging). Kill switch.', 'on', 100, now())
ON CONFLICT (key) DO UPDATE SET state = 'on', "rolloutPercent" = 100, "updatedAt" = now();
