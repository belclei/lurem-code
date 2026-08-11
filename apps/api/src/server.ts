import cookie from "@fastify/cookie";
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from "@fastify/type-provider-zod";
// apps/api/src/server.ts
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { Resend } from "resend";
import { registerAccessRoutes } from "./access/routes.js";
import { registerAccountRoutes } from "./accounts/routes.js";
import { registerAdminCalendarRoutes } from "./admin/calendar-routes.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { registerAdminUsageHealthRoutes } from "./admin/usage-health-routes.js";
import {
  type GoogleIdTokenVerifier,
  createGoogleIdTokenVerifier,
} from "./auth/google.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerCardRoutes } from "./cards/routes.js";
import { registerCategoryRoutes } from "./categories/routes.js";
import { registerConnectionRoutes } from "./connections/routes.js";
import { createResendClient } from "./email/resend-client.js";
import { registerResendWebhook } from "./email/webhook.js";
import { type Env, type EnvInput, loadEnv, parseEnv } from "./env.js";
import { AppError, INTERNAL, VALIDATION_FAILED } from "./errors.js";
import { bumpInsightsGen } from "./insights/cache.js";
import { registerInsightRoutes } from "./insights/routes.js";
import { registerInstitutionRoutes } from "./institutions/routes.js";
import { registerInviteRoutes } from "./invites/routes.js";
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import { registerPortadorRoutes } from "./portador/routes.js";
import { registerRecurringTransactionRoutes } from "./recurring-transactions/routes.js";
import { registerSettingsRoutes } from "./settings/routes.js";
import { registerShareRoutes } from "./shares/routes.js";
import { registerTimelineRoutes } from "./timeline/routes.js";
import { registerTransactionRoutes } from "./transactions/routes.js";

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
    googleVerifier: GoogleIdTokenVerifier;
    resend: Resend;
  }
}

export async function buildServer(
  envOverride?: EnvInput,
): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  const env = envOverride ? parseEnv(envOverride) : loadEnv();
  fastify.decorate("env", env);
  fastify.decorate(
    "googleVerifier",
    createGoogleIdTokenVerifier(env.GOOGLE_CLIENT_ID),
  );
  fastify.decorate("resend", createResendClient(env.RESEND_API_KEY));

  await fastify.register(prismaPlugin);
  await fastify.register(redisPlugin);
  await fastify.register(cookie);
  await registerAuthRoutes(fastify);
  await registerResendWebhook(fastify);
  await registerInstitutionRoutes(fastify);
  await registerAccountRoutes(fastify);
  await registerCardRoutes(fastify);
  await registerCategoryRoutes(fastify);
  await registerTransactionRoutes(fastify);
  await registerRecurringTransactionRoutes(fastify);
  await registerInsightRoutes(fastify);
  await registerSettingsRoutes(fastify);
  await registerTimelineRoutes(fastify);
  await registerConnectionRoutes(fastify);
  await registerShareRoutes(fastify);
  await registerPortadorRoutes(fastify);
  await registerAdminRoutes(fastify);
  await registerAdminUsageHealthRoutes(fastify);
  await registerAdminCalendarRoutes(fastify);
  await registerInviteRoutes(fastify);
  await registerAccessRoutes(fastify);

  // Invalidação do cache de insights (§5.6/§7.8): qualquer escrita autenticada
  // (não-GET, 2xx, com userId) aposenta o cache do usuário incrementando sua
  // geração. Centralizado aqui — nenhuma rota de escrita precisa lembrar de
  // invalidar. request.userId é setado pelo preHandler requireUser das rotas
  // autenticadas; rotas públicas (webhook) não têm userId e não disparam.
  fastify.addHook("onResponse", async (request, reply) => {
    if (
      request.method !== "GET" &&
      request.userId &&
      reply.statusCode >= 200 &&
      reply.statusCode < 300
    ) {
      await bumpInsightsGen(fastify.redis, request.userId);
    }
  });

  fastify.get("/health", async () => ({ status: "ok" }));
  fastify.get("/ready", async (_request, reply) => {
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      await fastify.redis.ping();
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  fastify.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        ...(error.data ? { data: error.data } : {}),
      });
    }
    if (error.validation) {
      const details = error.validation.map((v) => ({
        field:
          v.instancePath.replace(/^\//, "") ||
          (typeof v.params?.missingProperty === "string"
            ? v.params.missingProperty
            : "unknown"),
        message: v.message ?? "Campo inválido.",
      }));
      const validationError = VALIDATION_FAILED(details);
      return reply.code(validationError.statusCode).send({
        code: validationError.code,
        message: validationError.message,
        details: validationError.details,
      });
    }
    fastify.log.error(error);
    const internal = INTERNAL();
    return reply
      .code(internal.statusCode)
      .send({ code: internal.code, message: internal.message });
  });

  return fastify;
}
