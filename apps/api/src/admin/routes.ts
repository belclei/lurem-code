// apps/api/src/admin/routes.ts
// BACKLOG.md US-7.1/US-7.2 — painel Acessos (waitlist + convites aguardando
// aprovação) e Usuários (contagens, promover/demover, beta, desabilitar).
//
// Aprovar aqui gera o token de 7 dias (registrationTokenHash) e dispara o
// e-mail de convite via Resend (email/templates.ts, template de marca em
// email/templates/lurem-convite.html) logo em seguida — tanto pra fila de
// acesso quanto pra convite usuário-a-usuário. Uma falha do Resend aqui
// derruba a resposta (500): o token já foi gravado, então "reenviar" já
// existe como ação própria (POST /v1/invites/:id/resend) pra cobrir esse
// caso, em vez de best-effort silencioso.
import { randomBytes } from "node:crypto";
import type { Prisma } from "@lurem/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TOKEN_TTL_MS } from "../access/tokens.js";
import { hashToken } from "../auth/refresh-tokens.js";
import { sendInviteEmail } from "../email/templates.js";
import { ADMIN_LAST_ADMIN, NOT_FOUND } from "../errors.js";
import { requireAdmin } from "./require-admin.js";

const RoleBody = z.object({ role: z.enum(["user", "admin"]) }).strict();
const BetaBody = z.object({ isBetaTester: z.boolean() }).strict();
const DisableBody = z.object({ disabled: z.boolean() }).strict();

async function fireAdminEvent(
  fastify: FastifyInstance,
  actorUserId: string,
  targetUserId: string,
  type: string,
  aggregateId: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await fastify.prisma.domainEvent.create({
    data: {
      userId: targetUserId,
      actorUserId,
      type,
      aggregateType: "User",
      aggregateId,
      payload,
    },
  });
}

export async function registerAdminRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    "/v1/admin/access",
    { preHandler: requireAdmin(fastify) },
    async () => {
      const [waitlist, invites] = await Promise.all([
        fastify.prisma.waitlistEntry.findMany({
          where: { status: "pending" },
          orderBy: { createdAt: "asc" },
        }),
        fastify.prisma.invite.findMany({
          where: { status: "awaiting_approval" },
          orderBy: { createdAt: "asc" },
        }),
      ]);
      return {
        waitlist: waitlist.map((w) => ({
          id: w.id,
          name: w.name,
          email: w.email,
          createdAt: w.createdAt.toISOString(),
        })),
        invites: invites.map((i) => ({
          id: i.id,
          inviterUserId: i.inviterUserId,
          inviteeName: i.inviteeName,
          inviteeEmail: i.inviteeEmail,
          createdAt: i.createdAt.toISOString(),
        })),
      };
    },
  );

  fastify.post(
    "/v1/admin/access/waitlist/:id/approve",
    { preHandler: requireAdmin(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireAdmin() preHandler, which runs before this handler and throws if auth fails
      const adminId = request.userId!;
      const { id } = request.params as { id: string };
      const entry = await fastify.prisma.waitlistEntry.findUnique({
        where: { id },
      });
      if (!entry || entry.status !== "pending") throw NOT_FOUND();

      const rawToken = randomBytes(24).toString("hex");
      await fastify.prisma.waitlistEntry.update({
        where: { id },
        data: {
          status: "approved",
          registrationTokenHash: hashToken(rawToken),
          tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
          approvedByUserId: adminId,
          approvedAt: new Date(),
        },
      });
      await sendInviteEmail(fastify.resend, {
        to: entry.email,
        inviteeName: entry.name,
        link: `${fastify.env.WEB_APP_URL}/register?token=${rawToken}`,
      });
      // Sem userId de agregado próprio (WaitlistEntry não é de um usuário
      // ainda) — o evento de auditoria fica só no admin que agiu.
      await fireAdminEvent(
        fastify,
        adminId,
        adminId,
        "admin.access_approved",
        id,
        {
          kind: "waitlist",
          email: entry.email,
        },
      );
      return { id, status: "approved" };
    },
  );

  fastify.post(
    "/v1/admin/access/waitlist/:id/reject",
    { preHandler: requireAdmin(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireAdmin() preHandler, which runs before this handler and throws if auth fails
      const adminId = request.userId!;
      const { id } = request.params as { id: string };
      const entry = await fastify.prisma.waitlistEntry.findUnique({
        where: { id },
      });
      if (!entry || entry.status !== "pending") throw NOT_FOUND();

      await fastify.prisma.waitlistEntry.update({
        where: { id },
        data: { status: "rejected" },
      });
      await fireAdminEvent(
        fastify,
        adminId,
        adminId,
        "admin.access_rejected",
        id,
        {
          kind: "waitlist",
          email: entry.email,
        },
      );
      return { id, status: "rejected" };
    },
  );

  fastify.post(
    "/v1/admin/access/invites/:id/approve",
    { preHandler: requireAdmin(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireAdmin() preHandler, which runs before this handler and throws if auth fails
      const adminId = request.userId!;
      const { id } = request.params as { id: string };
      const invite = await fastify.prisma.invite.findUnique({ where: { id } });
      if (!invite || invite.status !== "awaiting_approval") throw NOT_FOUND();

      const rawToken = randomBytes(24).toString("hex");
      const updated = await fastify.prisma.invite.update({
        where: { id },
        data: {
          status: "approved",
          registrationTokenHash: hashToken(rawToken),
          tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
          approvedByUserId: adminId,
          approvedAt: new Date(),
        },
      });
      await sendInviteEmail(fastify.resend, {
        to: updated.inviteeEmail,
        inviteeName: updated.inviteeName,
        link: `${fastify.env.WEB_APP_URL}/register?token=${rawToken}`,
      });
      await fireAdminEvent(
        fastify,
        adminId,
        adminId,
        "admin.access_approved",
        id,
        {
          kind: "invite",
          email: invite.inviteeEmail,
        },
      );
      return { id, status: "approved" };
    },
  );

  fastify.post(
    "/v1/admin/access/invites/:id/reject",
    { preHandler: requireAdmin(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireAdmin() preHandler, which runs before this handler and throws if auth fails
      const adminId = request.userId!;
      const { id } = request.params as { id: string };
      const invite = await fastify.prisma.invite.findUnique({ where: { id } });
      if (!invite || invite.status !== "awaiting_approval") throw NOT_FOUND();

      await fastify.prisma.invite.update({
        where: { id },
        data: { status: "rejected" },
      });
      await fireAdminEvent(
        fastify,
        adminId,
        adminId,
        "admin.access_rejected",
        id,
        {
          kind: "invite",
          email: invite.inviteeEmail,
        },
      );
      return { id, status: "rejected" };
    },
  );

  fastify.get(
    "/v1/admin/users",
    { preHandler: requireAdmin(fastify) },
    async () => {
      const users = await fastify.prisma.user.findMany({
        orderBy: { createdAt: "asc" },
      });
      const ids = users.map((u) => u.id);
      // Contagens, nunca valores (§6.2) — groupBy conta linhas, não soma dinheiro.
      const [accountCounts, cardCounts, txCounts] = await Promise.all([
        fastify.prisma.account.groupBy({
          by: ["userId"],
          where: { userId: { in: ids } },
          _count: { _all: true },
        }),
        fastify.prisma.creditCard.groupBy({
          by: ["userId"],
          where: { userId: { in: ids } },
          _count: { _all: true },
        }),
        fastify.prisma.transaction.groupBy({
          by: ["userId"],
          where: { userId: { in: ids } },
          _count: { _all: true },
        }),
      ]);
      const countMap = (
        rows: Array<{ userId: string; _count: { _all: number } }>,
      ) => new Map(rows.map((r) => [r.userId, r._count._all]));
      const accountsByUser = countMap(accountCounts);
      const cardsByUser = countMap(cardCounts);
      const txByUser = countMap(txCounts);

      return users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isBetaTester: u.isBetaTester,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        accountCount: accountsByUser.get(u.id) ?? 0,
        cardCount: cardsByUser.get(u.id) ?? 0,
        transactionCount: txByUser.get(u.id) ?? 0,
      }));
    },
  );

  fastify.post(
    "/v1/admin/users/:id/role",
    { schema: { body: RoleBody }, preHandler: requireAdmin(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireAdmin() preHandler, which runs before this handler and throws if auth fails
      const adminId = request.userId!;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof RoleBody>;

      const target = await fastify.prisma.user.findUnique({ where: { id } });
      if (!target) throw NOT_FOUND();

      if (target.role === "admin" && body.role === "user") {
        const adminCount = await fastify.prisma.user.count({
          where: { role: "admin" },
        });
        if (adminCount <= 1) throw ADMIN_LAST_ADMIN();
      }

      const updated = await fastify.prisma.user.update({
        where: { id },
        data: { role: body.role },
      });
      await fireAdminEvent(
        fastify,
        adminId,
        id,
        "admin.user_role_changed",
        id,
        { actorUserId: adminId, from: target.role, to: body.role },
      );
      return { id: updated.id, role: updated.role };
    },
  );

  fastify.post(
    "/v1/admin/users/:id/beta",
    { schema: { body: BetaBody }, preHandler: requireAdmin(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireAdmin() preHandler, which runs before this handler and throws if auth fails
      const adminId = request.userId!;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof BetaBody>;

      const target = await fastify.prisma.user.findUnique({ where: { id } });
      if (!target) throw NOT_FOUND();

      const updated = await fastify.prisma.user.update({
        where: { id },
        data: { isBetaTester: body.isBetaTester },
      });
      await fireAdminEvent(
        fastify,
        adminId,
        id,
        "admin.user_beta_changed",
        id,
        {
          actorUserId: adminId,
          to: body.isBetaTester,
        },
      );
      return { id: updated.id, isBetaTester: updated.isBetaTester };
    },
  );

  fastify.post(
    "/v1/admin/users/:id/disable",
    { schema: { body: DisableBody }, preHandler: requireAdmin(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireAdmin() preHandler, which runs before this handler and throws if auth fails
      const adminId = request.userId!;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof DisableBody>;

      const target = await fastify.prisma.user.findUnique({ where: { id } });
      if (!target) throw NOT_FOUND();

      if (body.disabled && target.role === "admin") {
        const activeAdminCount = await fastify.prisma.user.count({
          where: { role: "admin", status: "active" },
        });
        if (activeAdminCount <= 1) throw ADMIN_LAST_ADMIN();
      }

      const updated = await fastify.prisma.user.update({
        where: { id },
        data: { status: body.disabled ? "disabled" : "active" },
      });
      await fireAdminEvent(fastify, adminId, id, "admin.user_disabled", id, {
        actorUserId: adminId,
        disabled: body.disabled,
      });
      return { id: updated.id, status: updated.status };
    },
  );
}
