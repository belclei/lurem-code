// apps/api/src/tags/routes.ts
// GET /v1/tags — the user's existing tag vocabulary, for TagInput's
// autocomplete. Tags themselves have no dedicated create/delete endpoint:
// they're created implicitly (setTransactionTags, see ./service.ts) the
// first time a transaction or import line is tagged with a new name.
import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth/authenticate.js";

export async function registerTagRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    "/v1/tags",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler
      const userId = request.userId!;
      return fastify.prisma.tag.findMany({
        where: { userId },
        orderBy: { name: "asc" },
      });
    },
  );
}
