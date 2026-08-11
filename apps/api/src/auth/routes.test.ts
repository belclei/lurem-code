import type { FastifyInstance } from "fastify";
// apps/api/src/auth/routes.test.ts
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { resetTestDb } from "../../test/db.js";
import { buildServer } from "../server.js";
import { hashPassword } from "./password.js";
import { hashToken } from "./refresh-tokens.js";

// Same dependency-injection pattern as invites/routes.test.ts — forgot-password
// sends real e-mail via Resend; this fakes the one SDK method the route calls.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

const TEST_ENV = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://lurem_test:lurem_test@localhost:5433/lurem_test",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "x".repeat(32),
  GOOGLE_CLIENT_ID: "placeholder",
  RESEND_API_KEY: "placeholder",
  RESEND_WEBHOOK_SECRET: "placeholder",
  WEB_APP_URL: "http://localhost:5173",
  PORT: 3001,
};

let server: FastifyInstance;

beforeAll(async () => {
  server = await buildServer(TEST_ENV);
});
beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "email_test" }, error: null });
});
afterEach(async () => {
  await resetTestDb(server.prisma);
});
afterAll(async () => {
  await server.close();
});

// Every test below logs in (or refreshes) first and then needs the
// resulting Set-Cookie value. `.find()` is inherently Optional, and a
// bare `!` would just throw an opaque TypeError if the invariant "login
// always sets a refreshToken cookie" is ever violated — throwing a
// specific error here keeps that same fail-loud behavior with a clearer
// message, without a non-null assertion.
function getRefreshCookieValue(
  response: Awaited<ReturnType<FastifyInstance["inject"]>>,
): string {
  const cookie = response.cookies.find((c) => c.name === "refreshToken");
  if (!cookie) {
    throw new Error(
      'expected a "refreshToken" cookie in the response, but none was set',
    );
  }
  return cookie.value;
}

describe("POST /v1/auth/login", () => {
  it("logs in with correct credentials and sets a refresh cookie", async () => {
    const passwordHash = await hashPassword("supersecret123");
    await server.prisma.user.create({
      data: {
        email: "login-test@harmon.dev",
        name: "Login Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "login-test@harmon.dev", password: "supersecret123" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toEqual(expect.any(String));
    expect(response.cookies.some((c) => c.name === "refreshToken")).toBe(true);

    // Not just presence — the cookie itself must carry the hardening
    // attributes (httpOnly/secure/sameSite/path), not only a bare
    // `refreshToken=...` name/value pair.
    const setCookieHeader = response.headers["set-cookie"];
    const rawHeaders = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];
    const refreshCookieHeader = rawHeaders.find((header) =>
      header?.startsWith("refreshToken="),
    );
    expect(refreshCookieHeader).toContain("HttpOnly");
    expect(refreshCookieHeader).toContain("Secure");
    expect(refreshCookieHeader).toContain("SameSite=Strict");
    expect(refreshCookieHeader).toContain("Path=/v1/auth");
  });

  it("rejects login for a disabled user with the same response as a wrong password", async () => {
    const passwordHash = await hashPassword("supersecret123");
    await server.prisma.user.create({
      data: {
        email: "disabled-login-test@harmon.dev",
        name: "Disabled Login Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
        status: "disabled",
      },
    });

    const disabledAttempt = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "disabled-login-test@harmon.dev",
        password: "supersecret123",
      },
    });
    const wrongPasswordAttempt = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "no-such-account@harmon.dev", password: "wrong" },
    });

    expect(disabledAttempt.statusCode).toBe(401);
    expect(disabledAttempt.json()).toEqual(wrongPasswordAttempt.json());
  });

  it("returns the same error for a wrong password and a nonexistent e-mail", async () => {
    const passwordHash = await hashPassword("supersecret123");
    await server.prisma.user.create({
      data: {
        email: "login-test2@harmon.dev",
        name: "Login Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });

    const wrongPassword = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "login-test2@harmon.dev", password: "wrong" },
    });
    const noSuchUser = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "nobody@harmon.dev", password: "wrong" },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(noSuchUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(noSuchUser.json());
  });

  it("rate-limits the 6th attempt within 15 minutes for the same e-mail", async () => {
    await server.redis.flushall();
    for (let i = 0; i < 5; i++) {
      await server.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "ratelimit@harmon.dev", password: "wrong" },
      });
    }
    const sixth = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "ratelimit@harmon.dev", password: "wrong" },
    });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().code).toBe("auth.rate_limited");
  });

  it("keys the rate limiter per e-mail, not per IP — a different e-mail from the same client is unaffected", async () => {
    // Regression test: @fastify/rate-limit's default hook is 'onRequest',
    // which fires before the body is parsed, so a keyGenerator reading
    // request.body silently falls back to request.ip. All requests here
    // come from the same `server.inject` test client (same IP), so this
    // only passes if keying is genuinely e-mail-based (hook: 'preHandler').
    await server.redis.flushall();
    for (let i = 0; i < 5; i++) {
      await server.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "emailA@harmon.dev", password: "wrong" },
      });
    }
    const emailAExhausted = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "emailA@harmon.dev", password: "wrong" },
    });
    expect(emailAExhausted.statusCode).toBe(429);

    const emailBAttempt = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "emailB@harmon.dev", password: "wrong" },
    });
    expect(emailBAttempt.statusCode).toBe(401);
    expect(emailBAttempt.json().code).not.toBe("auth.rate_limited");
  });
});

describe("POST /v1/auth/forgot-password", () => {
  it("issues a token and sends the reset e-mail for an existing account", async () => {
    const passwordHash = await hashPassword("supersecret123");
    const user = await server.prisma.user.create({
      data: {
        email: "forgot-test@harmon.dev",
        name: "Forgot Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "forgot-test@harmon.dev" },
    });

    expect(response.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0]?.[0] as { to: string; html: string };
    expect(call.to).toBe("forgot-test@harmon.dev");
    expect(call.html).toContain("/reset-password?token=");

    const tokenRow = await server.prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
    });
    expect(tokenRow).not.toBeNull();
  });

  it("returns the same generic response for a nonexistent e-mail and sends no e-mail", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "nobody-forgot@harmon.dev" },
    });

    expect(response.statusCode).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends the e-mail for a Google-only account too, so it can set a password for the first time", async () => {
    // Emenda: usuário quer poder autenticar pelas duas vias (Google OU
    // senha), então forgot-password também serve pra "cadastrar senha pela
    // primeira vez" numa conta que só tinha Google — não é mais pulado.
    await server.prisma.user.create({
      data: {
        email: "google-only-forgot@harmon.dev",
        name: "Google Only",
        birthDate: new Date("1990-01-01"),
        googleId: "google-sub-forgot",
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "google-only-forgot@harmon.dev" },
    });

    expect(response.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("gives an identical body for an existing account and a nonexistent one", async () => {
    const passwordHash = await hashPassword("supersecret123");
    await server.prisma.user.create({
      data: {
        email: "forgot-neutral@harmon.dev",
        name: "Forgot Neutral",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });

    const existing = await server.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "forgot-neutral@harmon.dev" },
    });
    const missing = await server.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "still-nobody@harmon.dev" },
    });

    expect(existing.json()).toEqual(missing.json());
  });

  it("invalidates a previous unused token when a second request is made", async () => {
    const passwordHash = await hashPassword("supersecret123");
    const user = await server.prisma.user.create({
      data: {
        email: "forgot-twice@harmon.dev",
        name: "Forgot Twice",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });

    await server.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "forgot-twice@harmon.dev" },
    });
    // The template also embeds the (unrelated, https) logo asset URL, so
    // matching on the query param directly is more robust than trying to
    // isolate "the" URL out of the whole html body.
    const firstHtml = (sendMock.mock.calls[0]?.[0] as { html: string }).html;
    const firstToken = firstHtml.match(/token=([a-f0-9]+)/)?.[1] ?? null;

    await server.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "forgot-twice@harmon.dev" },
    });

    if (!firstToken) {
      throw new Error("expected a token to be embedded in the reset link");
    }
    const reuseFirst = await server.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token: firstToken, newPassword: "brandnewpassword123" },
    });
    expect(reuseFirst.statusCode).toBe(400);
    expect(reuseFirst.json().code).toBe("auth.token_invalid");

    const rows = await server.prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(2);
  });
});

describe("POST /v1/auth/reset-password", () => {
  async function createUserWithResetToken(email: string) {
    const passwordHash = await hashPassword("originalpassword123");
    const user = await server.prisma.user.create({
      data: {
        email,
        name: "Reset Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });
    await server.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email },
    });
    const html = (sendMock.mock.calls.at(-1)?.[0] as { html: string }).html;
    // See the comment in the "invalidates a previous token" test above —
    // matching on the query param avoids picking up the template's own
    // (unrelated, https) logo asset URL instead of the reset link.
    const token = html.match(/token=([a-f0-9]+)/)?.[1] ?? null;
    if (!token) {
      throw new Error("expected a token to be embedded in the reset link");
    }
    return { user, token };
  }

  it("resets the password with a valid token and logs in with the new password", async () => {
    const { user, token } = await createUserWithResetToken(
      "reset-valid@harmon.dev",
    );

    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token, newPassword: "brandnewpassword123" },
    });
    expect(response.statusCode).toBe(200);

    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: user.email, password: "brandnewpassword123" },
    });
    expect(login.statusCode).toBe(200);

    const oldLogin = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: user.email, password: "originalpassword123" },
    });
    expect(oldLogin.statusCode).toBe(401);
  });

  it("revokes every active refresh token for the user after a successful reset", async () => {
    const { user, token } = await createUserWithResetToken(
      "reset-revoke@harmon.dev",
    );
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: user.email, password: "originalpassword123" },
    });
    const cookie = login.cookies.find((c) => c.name === "refreshToken");
    if (!cookie) throw new Error("expected a refreshToken cookie");

    const reset = await server.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token, newPassword: "brandnewpassword123" },
    });
    expect(reset.statusCode).toBe(200);

    const refreshAfterReset = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: cookie.value },
    });
    expect(refreshAfterReset.statusCode).toBe(400);
  });

  it("rejects an already-used token", async () => {
    const { token } = await createUserWithResetToken("reset-used@harmon.dev");

    await server.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token, newPassword: "brandnewpassword123" },
    });
    const secondUse = await server.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token, newPassword: "anotherpassword456" },
    });

    expect(secondUse.statusCode).toBe(400);
    expect(secondUse.json().code).toBe("auth.token_invalid");
  });

  it("rejects an expired token", async () => {
    const { user, token } = await createUserWithResetToken(
      "reset-expired@harmon.dev",
    );
    await server.prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token, newPassword: "brandnewpassword123" },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json().code).toBe("auth.token_expired");
  });

  it("rejects a token that never existed", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: {
        token: "not-a-real-token",
        newPassword: "brandnewpassword123",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("auth.token_invalid");
  });

  it("rejects a password shorter than 8 characters", async () => {
    const { token } = await createUserWithResetToken("reset-short@harmon.dev");

    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token, newPassword: "short" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /v1/auth/refresh", () => {
  it("rotates a valid refresh token and issues a new access token", async () => {
    const passwordHash = await hashPassword("supersecret123");
    await server.prisma.user.create({
      data: {
        email: "refresh-test@harmon.dev",
        name: "Refresh Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "refresh-test@harmon.dev", password: "supersecret123" },
    });
    const cookieValue = getRefreshCookieValue(login);

    const refreshed = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: cookieValue },
    });

    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().accessToken).toEqual(expect.any(String));
    expect(
      refreshed.cookies.some(
        (c) => c.name === "refreshToken" && c.value !== cookieValue,
      ),
    ).toBe(true);
  });

  it("rejects a reused refresh token", async () => {
    const passwordHash = await hashPassword("supersecret123");
    await server.prisma.user.create({
      data: {
        email: "reuse-test@harmon.dev",
        name: "Reuse Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "reuse-test@harmon.dev", password: "supersecret123" },
    });
    const cookieValue = getRefreshCookieValue(login);

    await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: cookieValue },
    });
    const reused = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: cookieValue },
    });
    // NOTE: the plan's brief snippet asserted 401 here, but AUTH_TOKEN_INVALID()
    // (errors.ts, matching IMPLEMENTACAO.md §7's `auth.token_invalid` catalog
    // entry) is documented and already implemented as 400, not 401. Asserting
    // the real, already-committed contract instead of the brief's stale
    // expectation — see task-7-report.md for detail.
    expect(reused.statusCode).toBe(400);
  });

  it("proves family-wide revocation: a never-replayed sibling token from the same family is also rejected after a reuse is detected", async () => {
    // Distinguishes "reject this one token" from "revoke the whole family":
    // rotate twice (gen0 -> gen1 -> gen2) so gen0, gen1, gen2 all share one
    // familyId. Replaying the already-consumed gen0 token is reuse and must
    // revoke the entire family — which must also invalidate gen2, even
    // though gen2 itself was never replayed. A buggy implementation that
    // only marks the reused *row* invalid (instead of revoking every row
    // sharing familyId) would let gen2 keep working; this test would catch
    // that.
    const passwordHash = await hashPassword("supersecret123");
    await server.prisma.user.create({
      data: {
        email: "family-reuse-test@harmon.dev",
        name: "Family Reuse Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "family-reuse-test@harmon.dev",
        password: "supersecret123",
      },
    });
    const gen0 = getRefreshCookieValue(login);

    const rotate1 = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: gen0 },
    });
    const gen1 = getRefreshCookieValue(rotate1);

    const rotate2 = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: gen1 },
    });
    const gen2 = getRefreshCookieValue(rotate2);

    const replay = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: gen0 },
    });
    expect(replay.statusCode).toBe(400);

    const afterFamilyRevocation = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: gen2 },
    });
    expect(afterFamilyRevocation.statusCode).toBe(400);
  });

  it("stops a previously-valid refresh token from working once the user becomes disabled", async () => {
    const passwordHash = await hashPassword("supersecret123");
    const user = await server.prisma.user.create({
      data: {
        email: "disabled-refresh-test@harmon.dev",
        name: "Disabled Refresh Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "disabled-refresh-test@harmon.dev",
        password: "supersecret123",
      },
    });
    const cookieValue = getRefreshCookieValue(login);

    await server.prisma.user.update({
      where: { id: user.id },
      data: { status: "disabled" },
    });

    const refreshed = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: cookieValue },
    });
    expect(refreshed.statusCode).toBe(400);
    expect(refreshed.json().code).toBe("auth.token_invalid");
  });
});

describe("POST /v1/auth/logout", () => {
  it("revokes the current refresh family", async () => {
    const passwordHash = await hashPassword("supersecret123");
    await server.prisma.user.create({
      data: {
        email: "logout-test@harmon.dev",
        name: "Logout Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "logout-test@harmon.dev", password: "supersecret123" },
    });
    const cookieValue = getRefreshCookieValue(login);
    const accessToken = login.json().accessToken;

    const logout = await server.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${accessToken}` },
      cookies: { refreshToken: cookieValue },
    });
    expect(logout.statusCode).toBe(200);

    const afterLogout = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: cookieValue },
    });
    // See note above: real AUTH_TOKEN_INVALID() status is 400, not the
    // brief's 401.
    expect(afterLogout.statusCode).toBe(400);
  });

  it("rejects logout without a valid access token", async () => {
    const noAuth = await server.inject({
      method: "POST",
      url: "/v1/auth/logout",
      cookies: { refreshToken: "irrelevant" },
    });
    expect(noAuth.statusCode).toBe(400);

    const badAuth = await server.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: "Bearer not-a-real-jwt" },
      cookies: { refreshToken: "irrelevant" },
    });
    expect(badAuth.statusCode).toBe(400);
  });

  it("only revokes the presented session's own family, not another concurrent session of the same user", async () => {
    // Regression test for the `findFirst({ where: { userId } })` bug: with
    // no ordering and no filter on the actual cookie presented, logout could
    // pick an arbitrary refresh-token row belonging to the user and revoke
    // *that* family — potentially the wrong one. Reproduced here by logging
    // in twice as the same user (two tabs), which yields two independent
    // refresh-token families. Logging out of the second session must revoke
    // only the second session's family; the first session's refresh cookie
    // must remain valid.
    const passwordHash = await hashPassword("supersecret123");
    await server.prisma.user.create({
      data: {
        email: "two-session-logout-test@harmon.dev",
        name: "Two Session Logout Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
      },
    });

    const loginA = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "two-session-logout-test@harmon.dev",
        password: "supersecret123",
      },
    });
    const cookieAValue = getRefreshCookieValue(loginA);

    const loginB = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "two-session-logout-test@harmon.dev",
        password: "supersecret123",
      },
    });
    const cookieBValue = getRefreshCookieValue(loginB);
    const accessTokenB = loginB.json().accessToken;

    const logoutB = await server.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${accessTokenB}` },
      cookies: { refreshToken: cookieBValue },
    });
    expect(logoutB.statusCode).toBe(200);

    const refreshB = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: cookieBValue },
    });
    expect(refreshB.statusCode).toBe(400);

    const refreshA = await server.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { refreshToken: cookieAValue },
    });
    expect(refreshA.statusCode).toBe(200);
  });
});

describe("POST /v1/auth/google", () => {
  async function approvedWaitlistToken(email: string) {
    const raw = `raw-google-token-${Math.random().toString(36).slice(2)}`;
    await server.prisma.waitlistEntry.create({
      data: {
        name: "Convidado Google",
        email,
        status: "approved",
        registrationTokenHash: hashToken(raw),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return raw;
  }

  it("creates a Google-only account (null passwordHash) on first login, given a valid invite token", async () => {
    server.googleVerifier = async () => ({
      googleId: "google-sub-123",
      email: "google-user@harmon.dev",
      name: "Google User",
      picture: "https://lh3.googleusercontent.com/a/google-user",
    });
    const raw = await approvedWaitlistToken("google-user@harmon.dev");

    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: "fake-token-verified-by-injected-mock", token: raw },
    });

    expect(response.statusCode).toBe(200);
    const user = await server.prisma.user.findUniqueOrThrow({
      where: { email: "google-user@harmon.dev" },
    });
    expect(user.passwordHash).toBeNull();
    expect(user.googleId).toBe("google-sub-123");
    expect(user.googleAvatarUrl).toBe(
      "https://lh3.googleusercontent.com/a/google-user",
    );
  });

  it("rejects Google signup for a new account with no token", async () => {
    server.googleVerifier = async () => ({
      googleId: "google-sub-no-token",
      email: "no-token@harmon.dev",
      name: "No Token",
      picture: null,
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: "fake-token-verified-by-injected-mock" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("auth.token_invalid");
    const count = await server.prisma.user.count({
      where: { email: "no-token@harmon.dev" },
    });
    expect(count).toBe(0);
  });

  it("rejects Google signup when the invite's e-mail doesn't match the Google identity", async () => {
    server.googleVerifier = async () => ({
      googleId: "google-sub-mismatch",
      email: "actual-google-account@harmon.dev",
      name: "Mismatch",
      picture: null,
    });
    const raw = await approvedWaitlistToken("invited-address@harmon.dev");

    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: "fake-token-verified-by-injected-mock", token: raw },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("auth.token_invalid");
    const count = await server.prisma.user.count({
      where: { email: "actual-google-account@harmon.dev" },
    });
    expect(count).toBe(0);
  });

  it("logs in an existing Google user without duplicating the row, and without needing a token", async () => {
    server.googleVerifier = async () => ({
      googleId: "google-sub-456",
      email: "google-existing@harmon.dev",
      name: "Google Existing",
      picture: null,
    });
    await server.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: {
        idToken: "t1",
        token: await approvedWaitlistToken("google-existing@harmon.dev"),
      },
    });
    const second = await server.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: "t2" },
    });

    expect(second.statusCode).toBe(200);
    const count = await server.prisma.user.count({
      where: { email: "google-existing@harmon.dev" },
    });
    expect(count).toBe(1);
  });

  it("rate-limits the 6th request from the same IP within the window", async () => {
    server.googleVerifier = async () => ({
      googleId: "google-sub-ratelimit",
      email: "google-ratelimit@harmon.dev",
      name: "Google Ratelimit",
      picture: null,
    });
    const raw = await approvedWaitlistToken("google-ratelimit@harmon.dev");
    await server.redis.flushall();
    for (let i = 0; i < 5; i++) {
      await server.inject({
        method: "POST",
        url: "/v1/auth/google",
        payload: {
          idToken: "fake-token-verified-by-injected-mock",
          token: raw,
        },
      });
    }
    const sixth = await server.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: "fake-token-verified-by-injected-mock", token: raw },
    });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().code).toBe("auth.rate_limited");
  });
});

describe("GET /v1/me", () => {
  it("returns profile, role, and resolved flags map", async () => {
    const passwordHash = await hashPassword("supersecret123");
    await server.prisma.user.create({
      data: {
        email: "me-test@harmon.dev",
        name: "Me Test",
        birthDate: new Date("1990-01-01"),
        passwordHash,
        isBetaTester: true,
      },
    });
    await server.prisma.featureFlag.create({
      data: {
        key: "imports.pipeline",
        description: "test",
        state: "beta",
        rolloutPercent: 100,
      },
    });

    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "me-test@harmon.dev", password: "supersecret123" },
    });
    const accessToken = login.json().accessToken;

    const me = await server.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(me.statusCode).toBe(200);
    const body = me.json();
    expect(body.email).toBe("me-test@harmon.dev");
    expect(body.role).toBe("user");
    expect(body.flags).toEqual({ "imports.pipeline": true });
    expect(me.json().hasGoogle).toBe(false);
    expect(me.json().hasCompleteProfile).toBe(true);
    expect(me.json().avatarUrls.length).toBeGreaterThan(0);
    expect(me.json().avatarUrls[me.json().avatarUrls.length - 1]).toContain(
      "api.dicebear.com",
    );
  });

  it("reports hasCompleteProfile=false for a placeholder birthDate", async () => {
    await server.prisma.user.create({
      data: {
        email: "placeholder-birthdate@harmon.dev",
        name: "Placeholder",
        birthDate: new Date(0),
        googleId: "google-sub-placeholder",
      },
    });
    // The "POST /v1/auth/google" describe block above deliberately exhausts
    // this same IP-keyed rate-limit bucket in its own rate-limit test and
    // never resets it (the Redis-backed limiter, unlike Postgres, isn't
    // reset by the afterEach hook) — flush here so this test's own call
    // isn't collateral damage from running after that one.
    await server.redis.flushall();
    server.googleVerifier = async () => ({
      googleId: "google-sub-placeholder",
      email: "placeholder-birthdate@harmon.dev",
      name: "Placeholder",
      picture: null,
    });
    const googleLogin = await server.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: "fake" },
    });
    const accessToken = googleLogin.json().accessToken;

    const me = await server.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(me.json().hasCompleteProfile).toBe(false);
    expect(me.json().hasGoogle).toBe(true);
  });

  it("rejects a request with no Authorization header at all", async () => {
    const response = await server.inject({ method: "GET", url: "/v1/me" });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("auth.token_invalid");
  });

  it("rejects a malformed/invalid bearer token", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer not-a-real-jwt" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("auth.token_invalid");
  });
});
