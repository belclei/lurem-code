// apps/api/src/invites/routes.ts
// BACKLOG.md US-8.2 — convites usuário-a-usuário. Nasce awaiting_approval;
// o mesmo painel Acessos do Épico 7 (apps/api/src/admin/routes.ts) já sabe
// aprovar/rejeitar — esta rota só cria o pedido e lista o status pro convidante.
//
// Excluir/reenviar (sprint 15): autorização inline — dono (inviterUserId)
// OU admin, na mesma rota de auto-serviço, em vez de uma família de rotas
// /v1/admin/* separada (ver docs/superpowers/specs/2026-07-28-invite-
// connection-cancel-resend-design.md). Excluir é hard delete, bloqueado só
// quando status já é "registered". Reenviar só quando status é "approved"
// (nada foi aprovado/enviado antes disso).
import { randomBytes } from "node:crypto";
import type { Prisma } from "@lurem/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TOKEN_TTL_MS } from "../access/tokens.js";
import { requireUser } from "../auth/authenticate.js";
import { hashToken } from "../auth/refresh-tokens.js";
import { sendInviteEmail } from "../email/templates.js";
import { NOT_FOUND, VALIDATION_FAILED } from "../errors.js";

const CreateInviteBody = z
  .object({
    inviteeName: z.string().min(1),
    inviteeEmail: z.string().email(),
  })
  .strict();

async function fireEvent(
  fastify: FastifyInstance,
  userId: string,
  type: string,
  aggregateId: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await fastify.prisma.domainEvent.create({
    data: { userId, type, aggregateType: "Invite", aggregateId, payload },
  });
}

export async function registerInviteRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    "/v1/invites",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const invites = await fastify.prisma.invite.findMany({
        where: { inviterUserId: userId },
        orderBy: { createdAt: "desc" },
      });
      return invites.map((i) => ({
        id: i.id,
        inviteeName: i.inviteeName,
        inviteeEmail: i.inviteeEmail,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
      }));
    },
  );

  fastify.post(
    "/v1/invites",
    { schema: { body: CreateInviteBody }, preHandler: requireUser(fastify) },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const body = request.body as z.infer<typeof CreateInviteBody>;

      const invite = await fastify.prisma.invite.create({
        data: {
          inviterUserId: userId,
          inviteeName: body.inviteeName,
          inviteeEmail: body.inviteeEmail,
        },
      });

      await fireEvent(
        fastify,
        invite.inviterUserId,
        "invite.created",
        invite.id,
        { inviteeEmail: invite.inviteeEmail },
      );

      reply.code(201);
      return {
        id: invite.id,
        inviteeName: invite.inviteeName,
        inviteeEmail: invite.inviteeEmail,
        status: invite.status,
      };
    },
  );

  fastify.delete(
    "/v1/invites/:id",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const invite = await fastify.prisma.invite.findUnique({ where: { id } });
      if (
        !invite ||
        (invite.inviterUserId !== userId && request.userRole !== "admin")
      ) {
        throw NOT_FOUND();
      }
      if (invite.status === "registered") {
        throw VALIDATION_FAILED([
          { field: "id", message: "Este convite já resultou em um cadastro." },
        ]);
      }

      await fastify.prisma.invite.delete({ where: { id } });
      await fireEvent(fastify, invite.inviterUserId, "invite.deleted", id, {
        inviteeEmail: invite.inviteeEmail,
      });
      return { ok: true };
    },
  );

  fastify.post(
    "/v1/invites/:id/resend",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const { id } = request.params as { id: string };
      const invite = await fastify.prisma.invite.findUnique({ where: { id } });
      if (
        !invite ||
        (invite.inviterUserId !== userId && request.userRole !== "admin")
      ) {
        throw NOT_FOUND();
      }
      if (invite.status !== "approved") {
        throw VALIDATION_FAILED([
          { field: "id", message: "Este convite ainda não foi aprovado." },
        ]);
      }

      const rawToken = randomBytes(24).toString("hex");
      const updated = await fastify.prisma.invite.update({
        where: { id },
        data: {
          registrationTokenHash: hashToken(rawToken),
          tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });
      await sendInviteEmail(fastify.resend, {
        to: updated.inviteeEmail,
        inviteeName: updated.inviteeName,
        link: `${fastify.env.WEB_APP_URL}/register?token=${rawToken}`,
      });
      await fireEvent(fastify, updated.inviterUserId, "invite.resent", id, {
        inviteeEmail: updated.inviteeEmail,
      });
      return { id: updated.id, status: updated.status };
    },
  );
}
