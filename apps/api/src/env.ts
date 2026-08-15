// apps/api/src/env.ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_WEBHOOK_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3001),
  // Origin of the web app — used to build the /register?token=... and
  // /connections links sent in invite/connection e-mails. Defaulted so
  // every existing test's hand-rolled env object keeps working unchanged.
  WEB_APP_URL: z.string().url().default("http://localhost:5173"),
  // §6.8 — gateway LLM compartilhado (bel-ia) usado pela extração de
  // faturas/extratos importados. Defaulted (não required) para não quebrar
  // todo teste/env existente que não passa essas duas chaves — a rota de
  // import falha com uma mensagem clara se chamada sem BEL_IA_KEY real.
  BEL_IA_URL: z.string().url().default("https://ia.fasolo.tech"),
  BEL_IA_KEY: z.string().default(""),
});

export type Env = z.infer<typeof EnvSchema>;
// Pre-parse shape (defaulted keys optional) — lets buildServer's test
// override omit WEB_APP_URL/PORT without every existing *.test.ts hand-
// rolled env object needing an update.
export type EnvInput = z.input<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}

export function parseEnv(source: EnvInput): Env {
  return EnvSchema.parse(source);
}
