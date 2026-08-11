import type { FastifyInstance } from "fastify";
// apps/api/src/auth/routes.ts
import { z } from "zod";
import { assertUsable, findByToken } from "../access/tokens.js";
import { sendPasswordResetEmail } from "../email/templates.js";
import { AUTH_INVALID_CREDENTIALS, AUTH_TOKEN_INVALID } from "../errors.js";
import { resolveFlags } from "../flags/resolve.js";
import { isUserActive } from "./active-user.js";
import { requireUser } from "./authenticate.js";
import { computeAvatarUrls } from "./avatar.js";
import {
  type AccessTokenPayload,
  signAccessToken,
  verifyAccessToken,
} from "./jwt.js";
import {
  consumePasswordResetToken,
  issuePasswordResetToken,
} from "./password-reset-tokens.js";
import { hashPassword, verifyPassword } from "./password.js";
import { registerAuthRateLimit } from "./rate-limit.js";
import {
  REFRESH_COOKIE_NAME,
  hashToken,
  issueRefreshTokenFamily,
  revokeAllRefreshTokensForUser,
  revokeRefreshFamily,
  rotateRefreshToken,
  setRefreshCookie,
} from "./refresh-tokens.js";

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const GoogleAuthBody = z.object({
  idToken: z.string().min(1),
  token: z.string().min(1).optional(),
});

const ForgotPasswordBody = z.object({ email: z.string().email() }).strict();

const ResetPasswordBody = z
  .object({
    token: z.string().min(1),
    // Mesmo mínimo de access/routes.ts (RegisterBody) e settings/routes.ts
    // (ChangePasswordBody) — não existe um PasswordSchema compartilhado no
    // projeto hoje; introduzir um agora seria refatorar 3 rotas fora do
    // escopo deste fluxo só pra remover uma duplicação de uma linha.
    newPassword: z.string().min(8),
  })
  .strict();

// Mesma mensagem genérica sempre, exista ou não a conta — proteção contra
// enumeração de contas (§ boas práticas já conhecidas; ver comentário na
// rota abaixo para o porquê da resposta ser idêntica em todo caminho).
const NEUTRAL_FORGOT_PASSWORD_RESPONSE = {
  message:
    "Se este e-mail tiver uma conta no Lurem, enviamos um link para redefinir a senha.",
};

export async function registerAuthRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  await registerAuthRateLimit(fastify);

  fastify.post(
    "/v1/auth/login",
    {
      schema: { body: LoginBody },
      // @fastify/rate-limit is registered with `global: false` (Task 5), so
      // each route that wants limiting must opt in explicitly here — an
      // empty object means "use the plugin's registration-time defaults"
      // (max: 5, timeWindow: 15 minutes, keyed by e-mail).
      config: { rateLimit: {} },
    },
    async (request, reply) => {
      // `fastify` here is typed as the plain `FastifyInstance` (per this
      // function's public signature), not the `ZodTypeProvider`-augmented
      // instance from server.ts, so TS can't auto-infer `request.body`'s
      // shape from the route schema. The runtime validation still runs
      // (server.ts wires the Zod validator/serializer compilers globally)
      // — this cast only restores the static type to match that guarantee.
      const { email, password } = request.body as z.infer<typeof LoginBody>;

      const user = await fastify.prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) {
        throw AUTH_INVALID_CREDENTIALS();
      }
      // A disabled/soft-deleted user must get the exact same response as a
      // wrong password — never reveal that the account exists but is
      // disabled.
      if (!isUserActive(user)) {
        throw AUTH_INVALID_CREDENTIALS();
      }

      const validPassword = await verifyPassword(user.passwordHash, password);
      if (!validPassword) {
        throw AUTH_INVALID_CREDENTIALS();
      }

      const accessToken = await signAccessToken(
        { sub: user.id, role: user.role },
        fastify.env.JWT_SECRET,
      );
      const { token: refreshToken } = await issueRefreshTokenFamily(
        fastify.prisma,
        user.id,
      );

      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      setRefreshCookie(reply, refreshToken);
      return { accessToken };
    },
  );

  fastify.post(
    "/v1/auth/forgot-password",
    {
      schema: { body: ForgotPasswordBody },
      // Mesmo opt-in de /v1/auth/login: keyGenerator do rate-limit
      // (rate-limit.ts) já chaveia por e-mail quando o body tem um — 5
      // pedidos / 15min por e-mail. Sensível a abuso (spam de e-mail pro
      // Resend, custo por envio), não só a força-bruta como o login.
      config: { rateLimit: {} },
    },
    async (request) => {
      const { email } = request.body as z.infer<typeof ForgotPasswordBody>;

      const user = await fastify.prisma.user.findUnique({ where: { email } });
      // Resposta idêntica em qualquer um destes três casos — e-mail
      // inexistente, conta desativada, ou conta Google-only (passwordHash
      // nulo, não há senha pra redefinir) — nunca revela qual deles é.
      // (Mesmo padrão do login/AUTH_INVALID_CREDENTIALS e da waitlist
      // neutra em access/routes.ts.)
      if (user && isUserActive(user) && user.passwordHash) {
        const rawToken = await issuePasswordResetToken(fastify.prisma, user.id);
        await sendPasswordResetEmail(fastify.resend, {
          to: user.email,
          link: `${fastify.env.WEB_APP_URL}/reset-password?token=${rawToken}`,
        });
      }

      return NEUTRAL_FORGOT_PASSWORD_RESPONSE;
    },
  );

  fastify.post(
    "/v1/auth/reset-password",
    { schema: { body: ResetPasswordBody } },
    async (request) => {
      const { token, newPassword } = request.body as z.infer<
        typeof ResetPasswordBody
      >;

      // consumePasswordResetToken já lança AUTH_TOKEN_INVALID (inexistente
      // ou já usado) / AUTH_TOKEN_EXPIRED — mesmos códigos que o fluxo de
      // cadastro via convite (access/tokens.ts), sem detalhar mais que isso.
      const userId = await consumePasswordResetToken(fastify.prisma, token);

      const passwordHash = await hashPassword(newPassword);
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      // Prática padrão após troca de senha: encerra TODA sessão ativa, não
      // só a família de refresh token da sessão que pediu o reset — quem
      // trocou a senha nem precisa estar logado neste navegador.
      await revokeAllRefreshTokensForUser(fastify.prisma, userId);

      return { ok: true };
    },
  );

  fastify.post("/v1/auth/refresh", async (request, reply) => {
    const rawToken = request.cookies[REFRESH_COOKIE_NAME];
    if (!rawToken) {
      throw AUTH_TOKEN_INVALID();
    }

    // Narrowly scoped: only rotateRefreshToken's own failures (bad/expired
    // token, or reuse-detected — rotateRefreshToken doesn't distinguish the
    // two in its thrown error, and neither does the client-facing response
    // below) should map to auth.token_invalid (400). Everything after this
    // block is intentionally outside the try, so a transient DB/JWT failure
    // there falls through to the global error handler's `internal` (500)
    // instead of being mislabeled as an invalid token.
    let newRefreshToken: string;
    let userId: string;
    try {
      const rotated = await rotateRefreshToken(fastify.prisma, rawToken);
      newRefreshToken = rotated.token;
      userId = rotated.userId;
    } catch {
      throw AUTH_TOKEN_INVALID();
    }

    const user = await fastify.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    // A user disabled/soft-deleted after their last login must not be able
    // to keep refreshing — their session dies the same way an invalid
    // token would.
    if (!isUserActive(user)) {
      throw AUTH_TOKEN_INVALID();
    }
    const accessToken = await signAccessToken(
      { sub: user.id, role: user.role },
      fastify.env.JWT_SECRET,
    );

    setRefreshCookie(reply, newRefreshToken);
    return { accessToken };
  });

  fastify.post("/v1/auth/logout", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw AUTH_TOKEN_INVALID();
    }
    let payload: AccessTokenPayload;
    try {
      payload = await verifyAccessToken(
        authHeader.slice("Bearer ".length),
        fastify.env.JWT_SECRET,
      );
    } catch {
      throw AUTH_TOKEN_INVALID();
    }

    const rawToken = request.cookies[REFRESH_COOKIE_NAME];
    if (rawToken) {
      const tokenRow = await fastify.prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(rawToken) },
      });
      // Defense-in-depth: only revoke the family if the presented cookie's
      // row actually belongs to the authenticated user. If it doesn't (or
      // no row is found at all), there's nothing valid to log out — don't
      // leak whether the token belongs to someone else.
      if (tokenRow && tokenRow.userId === payload.sub) {
        await revokeRefreshFamily(fastify.prisma, tokenRow.familyId);
      }
    }
    reply.clearCookie(REFRESH_COOKIE_NAME, { path: "/v1/auth" });
    return { ok: true };
  });

  fastify.post(
    "/v1/auth/google",
    {
      schema: { body: GoogleAuthBody },
      // Same rate-limit opt-in mechanism as /v1/auth/login (Task 5) — there's
      // no email in the request body to key on the way login does, so this
      // falls back to the keyGenerator's `request.ip` branch (rate-limit.ts).
      config: { rateLimit: {} },
    },
    async (request, reply) => {
      const { idToken, token } = request.body as z.infer<typeof GoogleAuthBody>;
      const identity = await fastify.googleVerifier(idToken);

      const existing = await fastify.prisma.user.findUnique({
        where: { email: identity.email },
      });

      let user: Awaited<
        ReturnType<typeof fastify.prisma.user.findUniqueOrThrow>
      >;
      if (existing) {
        // Login for an already-registered identity — no invite required.
        // Account-linking-by-email decision unchanged (ARQUITETURA.md §6.1,
        // 25/07/2026): Google's email_verified claim is already the proof
        // of ownership.
        user = await fastify.prisma.user.update({
          where: { id: existing.id },
          data: {
            googleId: identity.googleId,
            googleAvatarUrl: identity.picture,
            lastLoginAt: new Date(),
          },
        });
      } else {
        // New account via Google now goes through the same invite/waitlist
        // gate as POST /v1/auth/register (ARQUITETURA.md §6.1, 26/07/2026)
        // — closes the admin-approval bypass flagged in BACKLOG.md §13.
        if (!token) {
          throw AUTH_TOKEN_INVALID();
        }
        const found = await findByToken(fastify, token);
        if (!found) throw AUTH_TOKEN_INVALID();
        assertUsable(found);

        const inviteEmail =
          found.kind === "waitlist"
            ? found.entry.email
            : found.entry.inviteeEmail;
        // The token only proves an approved slot for a specific e-mail — it
        // must match the Google identity actually authenticating, or
        // anyone holding a valid token could register under a different
        // Google account than the one that was approved.
        if (inviteEmail !== identity.email) {
          throw AUTH_TOKEN_INVALID();
        }

        user = await fastify.prisma.user.create({
          data: {
            email: identity.email,
            name: identity.name,
            googleId: identity.googleId,
            googleAvatarUrl: identity.picture,
            // Google doesn't hand us a birthDate — same placeholder as
            // before; the profile-completion Alert (Task 7) is what closes
            // this gap now instead of a blocking screen.
            birthDate: new Date(0),
          },
        });

        if (found.kind === "waitlist") {
          await fastify.prisma.waitlistEntry.update({
            where: { id: found.entry.id },
            data: { status: "registered", registeredUserId: user.id },
          });
        } else {
          await fastify.prisma.invite.update({
            where: { id: found.entry.id },
            data: { status: "registered", registeredUserId: user.id },
          });
        }
      }

      if (!isUserActive(user)) {
        throw AUTH_INVALID_CREDENTIALS();
      }

      const accessToken = await signAccessToken(
        { sub: user.id, role: user.role },
        fastify.env.JWT_SECRET,
      );
      const { token: refreshToken } = await issueRefreshTokenFamily(
        fastify.prisma,
        user.id,
      );
      setRefreshCookie(reply, refreshToken);
      return { accessToken };
    },
  );

  fastify.get(
    "/v1/me",
    { preHandler: requireUser(fastify) },
    async (request) => {
      // requireUser() preHandler above always sets request.userId (or throws
      // before this handler runs), but the module augmentation in
      // authenticate.ts declares it optional since it's not set on
      // unauthenticated routes.
      // biome-ignore lint/style/noNonNullAssertion: set by requireUser() preHandler, which runs before this handler and throws if auth fails
      const userId = request.userId!;
      const user = await fastify.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      // A user disabled/soft-deleted after their access token was issued
      // must not be able to keep using it — matches refresh's treatment
      // since it's the same "your session is no longer valid" situation.
      if (!isUserActive(user)) {
        throw AUTH_TOKEN_INVALID();
      }
      const flags = await resolveFlags(fastify.prisma, user.id);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        birthDate: user.birthDate.toISOString().slice(0, 10),
        hasPassword: user.passwordHash !== null,
        hasGoogle: user.googleId !== null,
        hasCompleteProfile: user.birthDate.getTime() !== 0,
        role: user.role,
        isBetaTester: user.isBetaTester,
        avatarMode: user.avatarMode,
        avatarUrls: computeAvatarUrls(user),
        themePref: user.themePref,
        createdAt: user.createdAt.toISOString(),
        flags,
      };
    },
  );
}
