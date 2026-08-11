// apps/api/src/admin/calendar-routes.ts
// BACKLOG.md item "calendário global administrado" — admin cadastra entradas
// ("Natal", "prazo pra declarar IR") com uma data recorrente anual
// (month+day, não uma @db.Date única: todo caso de uso do backlog é "todo
// ano, mesmo dia" — uma data fixa exigiria o admin recadastrar a entrada
// todo ano). Consumida pela Timeline via
// timeline/aggregate.ts's `synthesizeStructuralDates` (uma fonte por
// entrada, projetando a ocorrência do ano corrente para todos os usuários —
// ver timeline/routes.ts). CRUD simples, sem tela própria no admin web ainda
// (Task 5 do plano: fora de escopo por ora, ver relatório final).
import type { CalendarEntryDisplayStyle } from "@lurem/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NOT_FOUND } from "../errors.js";
import { requireAdmin } from "./require-admin.js";

const DisplayStyle = z.enum(["box", "inline"]);

const CreateBody = z
  .object({
    title: z.string().min(1).max(200),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    displayStyle: DisplayStyle.default("inline"),
  })
  .strict();

const UpdateBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
    displayStyle: DisplayStyle.optional(),
  })
  .strict();

function toResponse(entry: {
  id: string;
  title: string;
  month: number;
  day: number;
  displayStyle: CalendarEntryDisplayStyle;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: entry.id,
    title: entry.title,
    month: entry.month,
    day: entry.day,
    displayStyle: entry.displayStyle,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export async function registerAdminCalendarRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    "/v1/admin/calendar-entries",
    { preHandler: requireAdmin(fastify) },
    async () => {
      const entries = await fastify.prisma.globalCalendarEntry.findMany({
        orderBy: [{ month: "asc" }, { day: "asc" }],
      });
      return entries.map(toResponse);
    },
  );

  fastify.post(
    "/v1/admin/calendar-entries",
    { schema: { body: CreateBody }, preHandler: requireAdmin(fastify) },
    async (request, reply) => {
      const body = request.body as z.infer<typeof CreateBody>;
      const entry = await fastify.prisma.globalCalendarEntry.create({
        data: body,
      });
      reply.code(201);
      return toResponse(entry);
    },
  );

  fastify.patch(
    "/v1/admin/calendar-entries/:id",
    { schema: { body: UpdateBody }, preHandler: requireAdmin(fastify) },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof UpdateBody>;
      const existing = await fastify.prisma.globalCalendarEntry.findUnique({
        where: { id },
      });
      if (!existing) throw NOT_FOUND();

      const entry = await fastify.prisma.globalCalendarEntry.update({
        where: { id },
        data: body,
      });
      return toResponse(entry);
    },
  );

  fastify.delete(
    "/v1/admin/calendar-entries/:id",
    { preHandler: requireAdmin(fastify) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await fastify.prisma.globalCalendarEntry.findUnique({
        where: { id },
      });
      if (!existing) throw NOT_FOUND();

      await fastify.prisma.globalCalendarEntry.delete({ where: { id } });
      reply.code(204);
      return null;
    },
  );
}
