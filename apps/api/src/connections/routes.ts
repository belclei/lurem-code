// apps/api/src/connections/routes.ts
// BACKLOG.md US-6.2 — conexões entre usuários (ARQUITETURA.md §6.10).
//
// Escopo: UserConnection.addresseeUserId é NOT NULL no schema (§1.2,
// decisão do Sprint 1) — não dá pra gerar um link "cego" sem saber quem vai
// aceitar. Por isso POST /v1/connections pede o e-mail do convidado (deve já
// ser um usuário Lurem cadastrado) em vez de um token público standalone; o
// token gerado ainda existe (connectionTokenHash) para o caso de A querer
// mandar um link, mas aceitar via /v1/connections/:id/accept (in-app,
// exigindo que o usuário autenticado SEJA o addressee) é o caminho principal
// — token-based accept-by-link para alguém ainda sem conta pertence ao
// Épico 8 (convites), fora deste sprint.
//
// Excluir/reenviar (sprint 15): autorização inline — dono (requesterUserId,
// nunca addressee — ele tem accept/reject) OU admin. Excluir é hard delete,
// só quando status="pending". Reenviar só reenvia o e-mail de notificação
// (sem token/estado) — ver docs/superpowers/specs/2026-07-28-invite-
// connection-cancel-resend-design.md.
import { randomBytes } from "node:crypto";
import type { Prisma } from "@lurem/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/authenticate.js";
import { hashToken } from "../auth/refresh-tokens.js";
import { sendConnectionRequestEmail } from "../email/templates.js";
import { FEATURE_DISABLED, NOT_FOUND, VALIDATION_FAILED } from "../errors.js";
import { resolveFlags } from "../flags/resolve.js";

const CreateConnectionBody = z.object({ addresseeEmail: z.string().email() });

async function fireEvent(
  fastify: FastifyInstance,
  userId: string,
  type: string,
  aggregateId: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await fastify.prisma.domainEvent.create({
    data: {
      userId,
      type,
      aggregateType: "UserConnection",
      aggregateId,
      payload,
    },
  });
}

async function requireConnectionsFeature(
  fastify: FastifyInstance,
  userId: string,
): Promise<void> {
  const flags = await resolveFlags(fastify.prisma, userId);
  if (!flags.connections) {
    throw FEATURE_DISABLED("Conexões");
  }
}

export async function registerConnectionRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    "/v1/connections",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      await requireConnectionsFeature(fastify, userId);
      const connections = await fastify.prisma.userConnection.findMany({
        where: {
          OR: [{ requesterUserId: userId }, { addresseeUserId: userId }],
        },
        orderBy: { createdAt: "desc" },
      });
      const counterpartIds = [
        ...new Set(
          connections.map((c) =>
            c.requesterUserId === userId
              ? c.addresseeUserId
              : c.requesterUserId,
          ),
        ),
      ];
      const counterparts = await fastify.prisma.user.findMany({
        where: { id: { in: counterpartIds } },
      });
      const counterpartById = new Map(counterparts.map((u) => [u.id, u]));

      // Saldo de acerto (§6.10): soma das transações atribuídas a cada
      // contraparte, ainda não acertadas. amountBRLCents é sempre positivo
      // (§0) — kind carrega o sinal do dono original da transação, não da
      // relação de acerto; expense = eu paguei algo do/para o portador
      // (a meu favor), income = o inverso.
      const unsettled = await fastify.prisma.transaction.findMany({
        where: {
          userId,
          portadorUserId: { in: counterpartIds },
          portadorSettled: false,
        },
      });
      const balanceByCounterpart = new Map<string, number>();
      for (const tx of unsettled) {
        if (!tx.portadorUserId) continue;
        const sign = tx.kind === "expense" ? 1 : tx.kind === "income" ? -1 : 0;
        balanceByCounterpart.set(
          tx.portadorUserId,
          (balanceByCounterpart.get(tx.portadorUserId) ?? 0) +
            sign * tx.amountBRLCents,
        );
      }

      return connections.map((c) => {
        const counterpartId =
          c.requesterUserId === userId ? c.addresseeUserId : c.requesterUserId;
        const counterpart = counterpartById.get(counterpartId);
        return {
          id: c.id,
          status: c.status,
          isRequester: c.requesterUserId === userId,
          counterpartUserId: counterpartId,
          counterpartName: counterpart?.name ?? "",
          counterpartEmail: counterpart?.email ?? "",
          createdAt: c.createdAt.toISOString(),
          respondedAt: c.respondedAt?.toISOString() ?? null,
          settlementBalanceCents: balanceByCounterpart.get(counterpartId) ?? 0,
        };
      });
    },
  );

  fastify.post(
    "/v1/connections",
    {
      schema: { body: CreateConnectionBody },
      preHandler: requireUser(fastify),
    },
    async (request, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      await requireConnectionsFeature(fastify, userId);
      const body = request.body as z.infer<typeof CreateConnectionBody>;

      const addressee = await fastify.prisma.user.findUnique({
        where: { email: body.addresseeEmail },
      });
      if (!addressee || addressee.status !== "active") {
        throw VALIDATION_FAILED([
          {
            field: "addresseeEmail",
            message: "Não encontramos um usuário Lurem com esse e-mail.",
          },
        ]);
      }
      if (addressee.id === userId) {
        throw VALIDATION_FAILED([
          {
            field: "addresseeEmail",
            message: "Você não pode se conectar com você mesmo.",
          },
        ]);
      }
      const existing = await fastify.prisma.userConnection.findUnique({
        where: {
          requesterUserId_addresseeUserId: {
            requesterUserId: userId,
            addresseeUserId: addressee.id,
          },
        },
      });
      if (existing) {
        throw VALIDATION_FAILED([
          {
            field: "addresseeEmail",
            message: "Já existe uma conexão (ou convite) com esse usuário.",
          },
        ]);
      }

      const requester = await fastify.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      const rawToken = randomBytes(24).toString("hex");
      const connection = await fastify.prisma.userConnection.create({
        data: {
          requesterUserId: userId,
          addresseeUserId: addressee.id,
          status: "pending",
          connectionTokenHash: hashToken(rawToken),
        },
      });
      await sendConnectionRequestEmail(fastify.resend, {
        to: addressee.email,
        requesterName: requester.name,
        addresseeName: addressee.name,
        link: `${fastify.env.WEB_APP_URL}/connections`,
      });
      await fireEvent(fastify, userId, "connection.requested", connection.id, {
        counterpartUserId: addressee.id,
      });

      reply.code(201);
      return { id: connection.id, status: connection.status };
    },
  );

  fastify.post(
    "/v1/connections/:id/accept",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      await requireConnectionsFeature(fastify, userId);
      const { id } = request.params as { id: string };
      const connection = await fastify.prisma.userConnection.findUnique({
        where: { id },
      });
      if (!connection || connection.addresseeUserId !== userId) {
        throw NOT_FOUND();
      }
      if (connection.status !== "pending") {
        throw VALIDATION_FAILED([
          { field: "id", message: "Este convite já foi respondido." },
        ]);
      }
      const updated = await fastify.prisma.userConnection.update({
        where: { id },
        data: { status: "accepted", respondedAt: new Date() },
      });
      // Ambas as timelines recebem o evento (§6.10 — "toda ponta gera evento").
      await fireEvent(fastify, userId, "connection.accepted", id, {
        counterpartUserId: connection.requesterUserId,
      });
      await fireEvent(
        fastify,
        connection.requesterUserId,
        "connection.accepted",
        id,
        {
          counterpartUserId: userId,
        },
      );
      return { id: updated.id, status: updated.status };
    },
  );

  fastify.post(
    "/v1/connections/:id/reject",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      await requireConnectionsFeature(fastify, userId);
      const { id } = request.params as { id: string };
      const connection = await fastify.prisma.userConnection.findUnique({
        where: { id },
      });
      if (!connection || connection.addresseeUserId !== userId) {
        throw NOT_FOUND();
      }
      if (connection.status !== "pending") {
        throw VALIDATION_FAILED([
          { field: "id", message: "Este convite já foi respondido." },
        ]);
      }
      const updated = await fastify.prisma.userConnection.update({
        where: { id },
        data: { status: "rejected", respondedAt: new Date() },
      });
      await fireEvent(fastify, userId, "connection.rejected", id, {
        counterpartUserId: connection.requesterUserId,
      });
      await fireEvent(
        fastify,
        connection.requesterUserId,
        "connection.rejected",
        id,
        {
          counterpartUserId: userId,
        },
      );
      return { id: updated.id, status: updated.status };
    },
  );

  fastify.delete(
    "/v1/connections/:id",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      await requireConnectionsFeature(fastify, userId);
      const { id } = request.params as { id: string };
      const connection = await fastify.prisma.userConnection.findUnique({
        where: { id },
      });
      if (
        !connection ||
        (connection.requesterUserId !== userId && request.userRole !== "admin")
      ) {
        throw NOT_FOUND();
      }
      if (connection.status !== "pending") {
        throw VALIDATION_FAILED([
          { field: "id", message: "Este pedido de conexão já foi respondido." },
        ]);
      }

      await fastify.prisma.userConnection.delete({ where: { id } });
      await fireEvent(
        fastify,
        connection.requesterUserId,
        "connection.deleted",
        id,
        { counterpartUserId: connection.addresseeUserId },
      );
      await fireEvent(
        fastify,
        connection.addresseeUserId,
        "connection.deleted",
        id,
        { counterpartUserId: connection.requesterUserId },
      );
      return { ok: true };
    },
  );

  fastify.post(
    "/v1/connections/:id/resend",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      await requireConnectionsFeature(fastify, userId);
      const { id } = request.params as { id: string };
      const connection = await fastify.prisma.userConnection.findUnique({
        where: { id },
      });
      if (
        !connection ||
        (connection.requesterUserId !== userId && request.userRole !== "admin")
      ) {
        throw NOT_FOUND();
      }
      if (connection.status !== "pending") {
        throw VALIDATION_FAILED([
          { field: "id", message: "Este pedido de conexão já foi respondido." },
        ]);
      }

      const [requester, addressee] = await Promise.all([
        fastify.prisma.user.findUniqueOrThrow({
          where: { id: connection.requesterUserId },
        }),
        fastify.prisma.user.findUniqueOrThrow({
          where: { id: connection.addresseeUserId },
        }),
      ]);
      await sendConnectionRequestEmail(fastify.resend, {
        to: addressee.email,
        requesterName: requester.name,
        addresseeName: addressee.name,
        link: `${fastify.env.WEB_APP_URL}/connections`,
      });
      await fireEvent(
        fastify,
        connection.requesterUserId,
        "connection.resent",
        id,
        { counterpartUserId: connection.addresseeUserId },
      );
      return { id: connection.id, status: connection.status };
    },
  );
}
