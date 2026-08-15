// apps/api/src/releases/routes.ts
// issues.md: "a cada nova versão que entrar em produção, exibir um Alert no
// topo da página explicando o que há de novo". Admin CRUD (mirrors
// admin/calendar-routes.ts's shape) + a plain authed GET the web app polls
// to know the latest release and render the "o que há de novo" page.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../admin/require-admin.js";
import { requireUser } from "../auth/authenticate.js";
import { NOT_FOUND } from "../errors.js";

const CreateBody = z
  .object({
    version: z.string().min(1).max(50),
    title: z.string().min(1).max(200),
    body: z.string().min(1),
  })
  .strict();

const UpdateBody = z
  .object({
    version: z.string().min(1).max(50).optional(),
    title: z.string().min(1).max(200).optional(),
    body: z.string().min(1).optional(),
  })
  .strict();

function toResponse(release: {
  id: string;
  version: string;
  title: string;
  body: string;
  publishedAt: Date;
}) {
  return {
    id: release.id,
    version: release.version,
    title: release.title,
    body: release.body,
    publishedAt: release.publishedAt.toISOString(),
  };
}

export async function registerReleaseRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // Authed (not admin-only) — every logged-in user needs this to render the
  // "o que há de novo" banner/page.
  fastify.get(
    "/v1/releases",
    { preHandler: requireUser(fastify) },
    async () => {
      const releases = await fastify.prisma.release.findMany({
        orderBy: { publishedAt: "desc" },
      });
      return releases.map(toResponse);
    },
  );

  fastify.post(
    "/v1/admin/releases",
    { schema: { body: CreateBody }, preHandler: requireAdmin(fastify) },
    async (request, reply) => {
      const body = request.body as z.infer<typeof CreateBody>;
      const release = await fastify.prisma.release.create({ data: body });
      reply.code(201);
      return toResponse(release);
    },
  );

  fastify.patch(
    "/v1/admin/releases/:id",
    { schema: { body: UpdateBody }, preHandler: requireAdmin(fastify) },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof UpdateBody>;
      const existing = await fastify.prisma.release.findUnique({
        where: { id },
      });
      if (!existing) throw NOT_FOUND();

      const release = await fastify.prisma.release.update({
        where: { id },
        data: body,
      });
      return toResponse(release);
    },
  );

  fastify.delete(
    "/v1/admin/releases/:id",
    { preHandler: requireAdmin(fastify) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await fastify.prisma.release.findUnique({
        where: { id },
      });
      if (!existing) throw NOT_FOUND();

      await fastify.prisma.release.delete({ where: { id } });
      reply.code(204);
      return null;
    },
  );
}
