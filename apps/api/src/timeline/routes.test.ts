import type { FastifyInstance } from "fastify";
// apps/api/src/timeline/routes.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../../test/auth-helper.js";
import { resetTestDb } from "../../test/db.js";
import { buildServer } from "../server.js";

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
afterEach(async () => {
  await resetTestDb(server.prisma);
});
afterAll(async () => {
  await server.close();
});

async function authedUser() {
  return createAuthedUser(server.prisma, TEST_ENV.JWT_SECRET);
}

async function createAccount(userId: string) {
  return server.prisma.account.create({
    data: { userId, type: "cash" },
  });
}

describe("GET /v1/timeline", () => {
  it("interleaves transactions and domain events, grouped by day, newest first", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await createAccount(userId);

    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "expense",
        description: "Mercado",
        transactionDate: new Date("2026-07-20"),
        amountCents: 5_000,
        amountBRLCents: 5_000,
      },
    });
    await server.prisma.domainEvent.create({
      data: {
        userId,
        type: "account.created",
        aggregateType: "Account",
        aggregateId: account.id,
        payload: { institutionName: "Carteira" },
        createdAt: new Date("2026-07-18T12:00:00Z"),
      },
    });

    const response = await server.inject({
      method: "GET",
      // `to` scopes out the user's join-day synthetic entry (issues.md:
      // always shown, even with no transaction/event) so this test can
      // assert exact day counts regardless of when it runs.
      url: "/v1/timeline?from=2026-07-18&to=2026-07-20",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.days).toHaveLength(2);
    // Newest day first.
    expect(body.days[0].date).toBe("2026-07-20");
    expect(body.days[0].items).toHaveLength(1);
    expect(body.days[0].items[0].itemType).toBe("transaction");
    expect(body.days[1].date).toBe("2026-07-18");
    expect(body.days[1].items[0].itemType).toBe("event");
    expect(body.days[1].items[0].type).toBe("account.created");
    expect(body.nextCursor).toBeNull();
  });

  it("only returns this user's items (ownership)", async () => {
    const { userId, accessToken } = await authedUser();
    const stranger = await authedUser();
    const account = await createAccount(stranger.userId);
    await server.prisma.transaction.create({
      data: {
        userId: stranger.userId,
        accountId: account.id,
        kind: "expense",
        description: "Não é meu",
        transactionDate: new Date("2026-07-20"),
        amountCents: 1_000,
        amountBRLCents: 1_000,
      },
    });
    void userId;

    const response = await server.inject({
      method: "GET",
      // Same `to` reasoning as above — excludes this user's own join-day
      // synthetic entry, which is unrelated to what this test verifies.
      url: "/v1/timeline?from=2026-07-19&to=2026-07-19",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.json().days).toHaveLength(0);
  });

  it("paginates by day cursor", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await createAccount(userId);
    for (const day of ["2026-07-01", "2026-07-02", "2026-07-03"]) {
      await server.prisma.transaction.create({
        data: {
          userId,
          accountId: account.id,
          kind: "expense",
          description: `Dia ${day}`,
          transactionDate: new Date(day),
          amountCents: 100,
          amountBRLCents: 100,
        },
      });
    }

    const firstPage = await server.inject({
      method: "GET",
      // `to` excludes the join-day synthetic entry — see note above.
      url: "/v1/timeline?limit=2&from=2026-07-01&to=2026-07-03",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const firstBody = firstPage.json();
    expect(firstBody.days.map((d: { date: string }) => d.date)).toEqual([
      "2026-07-03",
      "2026-07-02",
    ]);
    expect(firstBody.nextCursor).toBe("2026-07-02");

    const secondPage = await server.inject({
      method: "GET",
      url: `/v1/timeline?limit=2&from=2026-07-01&to=2026-07-03&cursor=${firstBody.nextCursor}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const secondBody = secondPage.json();
    expect(secondBody.days.map((d: { date: string }) => d.date)).toEqual([
      "2026-07-01",
    ]);
    expect(secondBody.nextCursor).toBeNull();
  });

  it("filters by accountIds (multi-select chip)", async () => {
    const { userId, accessToken } = await authedUser();
    const wallet = await createAccount(userId);
    const other = await createAccount(userId);
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: wallet.id,
        kind: "expense",
        description: "Carteira",
        transactionDate: new Date("2026-07-10"),
        amountCents: 100,
        amountBRLCents: 100,
      },
    });
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: other.id,
        kind: "expense",
        description: "Outra conta",
        transactionDate: new Date("2026-07-10"),
        amountCents: 200,
        amountBRLCents: 200,
      },
    });

    const response = await server.inject({
      method: "GET",
      // `to` excludes the join-day synthetic entry — see note above.
      url: `/v1/timeline?accountIds=${wallet.id}&from=2026-07-10&to=2026-07-10`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = response.json();
    expect(body.days).toHaveLength(1);
    expect(body.days[0].items).toHaveLength(1);
    expect(body.days[0].items[0].transaction.description).toBe("Carteira");
  });

  it("excludes transactions when types filter omits the transaction pseudo-type", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await createAccount(userId);
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "expense",
        description: "Mercado",
        transactionDate: new Date("2026-07-10"),
        amountCents: 100,
        amountBRLCents: 100,
      },
    });
    await server.prisma.domainEvent.create({
      data: {
        userId,
        type: "account.created",
        aggregateType: "Account",
        aggregateId: account.id,
        payload: {},
        createdAt: new Date("2026-07-10T12:00:00Z"),
      },
    });

    const response = await server.inject({
      method: "GET",
      // `to` excludes the join-day synthetic entry — see note above.
      url: "/v1/timeline?types=account.created&from=2026-07-10&to=2026-07-10",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = response.json();
    expect(body.days).toHaveLength(1);
    expect(body.days[0].items).toHaveLength(1);
    expect(body.days[0].items[0].itemType).toBe("event");
  });

  it("calculates daily balance retroactively from account balances", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await createAccount(userId);

    // Create transactions that sum to a known balance
    // Start: 0 (opening balance)
    // Day 1: +1000 income -> balance = 1000
    // Day 2: -300 expense -> balance = 700
    // Day 3: +500 income -> balance = 1200
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "income",
        description: "Salary",
        transactionDate: new Date("2026-07-01"),
        amountCents: 1000,
        amountBRLCents: 1000,
      },
    });
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "expense",
        description: "Mercado",
        transactionDate: new Date("2026-07-02"),
        amountCents: 300,
        amountBRLCents: 300,
      },
    });
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "income",
        description: "Bonus",
        transactionDate: new Date("2026-07-03"),
        amountCents: 500,
        amountBRLCents: 500,
      },
    });

    const response = await server.inject({
      method: "GET",
      // `to` excludes the join-day synthetic entry — see note above.
      url: "/v1/timeline?from=2026-07-01&to=2026-07-03",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.days).toHaveLength(3);

    // Verify days are newest first
    expect(body.days[0].date).toBe("2026-07-03");
    expect(body.days[1].date).toBe("2026-07-02");
    expect(body.days[2].date).toBe("2026-07-01");

    // Verify balances are calculated correctly
    // Day 3 (newest): balance = 1200 (current total)
    expect(body.days[0].balanceCents).toBe(1200);
    // Day 2: balance = 1200 - 500 (day 3 income) = 700
    expect(body.days[1].balanceCents).toBe(700);
    // Day 1: balance = 700 + 300 (day 2 expense) = 1000
    expect(body.days[2].balanceCents).toBe(1000);
  });

  it("shows the join day even with no transaction/event on it (issues.md: structural days)", async () => {
    const { accessToken } = await authedUser();
    const todayYmd = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/timeline",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const todayDay = body.days.find(
      (d: { date: string }) => d.date === todayYmd,
    );
    expect(todayDay).toBeDefined();
    expect(todayDay.items).toEqual([]);
  });

  it("projects the next invoice closing/due dates for an active card, ahead of the real card.invoice_closed/due event (BACKLOG: fechamento/vencimento com antecedência)", async () => {
    const { userId, accessToken } = await authedUser();
    const institution = await server.prisma.institution.create({
      data: {
        name: "Nubank",
        compeCode: `260-${Math.random().toString(36).slice(2)}`,
        logoAsset: "nubank.svg",
      },
    });
    await server.prisma.creditCard.create({
      data: {
        userId,
        institutionId: institution.id,
        limitCents: 100_000,
        closingDay: 10,
        dueDay: 20,
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/timeline",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const allItems = body.days.flatMap(
      (d: { items: Array<{ type?: string }> }) => d.items,
    );
    const closing = allItems.find(
      (i: { type?: string }) => i.type === "card.invoice_closing_upcoming",
    );
    const due = allItems.find(
      (i: { type?: string }) => i.type === "card.invoice_due_upcoming",
    );
    expect(closing).toBeDefined();
    expect(closing.payload.institutionName).toBe("Nubank");
    expect(due).toBeDefined();
    expect(due.payload.institutionName).toBe("Nubank");
  });

  it("shows a global calendar entry on its recurring month/day for any user (BACKLOG: calendário global administrado)", async () => {
    const { accessToken } = await authedUser();
    const today = new Date();
    // São Paulo "today" — matches globalCalendarSource's own basis (`now`).
    const todayYmd = today.toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });
    const [year, month, day] = todayYmd.split("-").map(Number);
    void year;
    await server.prisma.globalCalendarEntry.create({
      data: {
        title: "Feriado de teste",
        month: month as number,
        day: day as number,
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/timeline",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const todayDay = body.days.find(
      (d: { date: string }) => d.date === todayYmd,
    );
    expect(todayDay).toBeDefined();
    const entryItem = todayDay.items.find(
      (i: { type?: string }) => i.type === "calendar.global_entry",
    );
    expect(entryItem).toBeDefined();
    expect(entryItem.payload.title).toBe("Feriado de teste");
  });

  // Backlog "Recorrência integrada ao dialog": a próxima ocorrência de uma
  // série ativa ainda não vencida aparece com antecedência (mesma ideia da
  // projeção de fatura acima), mesmo sem nenhuma Transaction real criada —
  // o cron só materializa a Transaction no próprio dia do vencimento.
  it("projects the next not-yet-due occurrence of an active recurring series (BACKLOG: recorrência com antecedência)", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await createAccount(userId);
    const now = new Date();
    const { year, month, day } = {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    };
    // dayOfMonth 28 falls in the future for any day of the month up to 27 —
    // acceptable date-dependence, same pattern as this file's other "today"
    // based tests above.
    const dueDay = 28;
    void year;
    void month;
    void day;
    await server.prisma.recurringTransaction.create({
      data: {
        userId,
        description: "Aluguel",
        kind: "expense",
        accountId: account.id,
        referenceAmountCents: 150_000,
        referenceAmountBRLCents: 150_000,
        dayOfMonth: dueDay,
        startDate: new Date("2020-01-01"),
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/timeline",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const allItems = body.days.flatMap(
      (d: { items: Array<{ type?: string; payload?: unknown }> }) => d.items,
    );
    const upcoming = allItems.find(
      (i: { type?: string }) => i.type === "recurring.occurrence_upcoming",
    ) as { payload: { description: string; amountCents: number } } | undefined;
    expect(upcoming).toBeDefined();
    expect(upcoming?.payload.description).toBe("Aluguel");
    expect(upcoming?.payload.amountCents).toBe(150_000);
  });

  it("does not project an upcoming occurrence once a real Transaction already covers this month", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await createAccount(userId);
    const series = await server.prisma.recurringTransaction.create({
      data: {
        userId,
        description: "Aluguel",
        kind: "expense",
        accountId: account.id,
        referenceAmountCents: 150_000,
        referenceAmountBRLCents: 150_000,
        dayOfMonth: 28,
        startDate: new Date("2020-01-01"),
      },
    });
    const now = new Date();
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "expense",
        description: "Aluguel",
        transactionDate: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15),
        ),
        amountCents: 150_000,
        amountBRLCents: 150_000,
        isScheduled: true,
        recurringTransactionId: series.id,
      },
    });

    // Bounded to just this month: with the open-ended default (no `to`) the
    // projection now looks several months ahead (see the multi-month tests
    // below), and later months genuinely have nothing materialized yet —
    // this test is specifically about the *current* month not duplicating.
    const to = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    )
      .toISOString()
      .slice(0, 10);
    const response = await server.inject({
      method: "GET",
      url: `/v1/timeline?to=${to}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = response.json();
    const allItems = body.days.flatMap(
      (d: { items: Array<{ type?: string }> }) => d.items,
    );
    const upcoming = allItems.find(
      (i: { type?: string }) => i.type === "recurring.occurrence_upcoming",
    );
    expect(upcoming).toBeUndefined();
  });

  // Backlog item 3 (issues.md): expanding the Timeline's period filter to
  // several months ahead must show every expected future occurrence of an
  // active series, not just the current month's — recurringOccurrenceSources
  // (routes.ts) now projects one item per month inside [from, to].
  it("projects one upcoming occurrence per month across a multi-month from/to range (BACKLOG item 3)", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await createAccount(userId);
    const now = new Date();
    // dayOfMonth 28 falls in the future for any day of the month up to 27 —
    // same date-dependence accepted by this file's other "today" based
    // tests above.
    const dueDay = 28;
    await server.prisma.recurringTransaction.create({
      data: {
        userId,
        description: "Aluguel",
        kind: "expense",
        accountId: account.id,
        referenceAmountCents: 150_000,
        referenceAmountBRLCents: 150_000,
        dayOfMonth: dueDay,
        startDate: new Date("2020-01-01"),
      },
    });

    const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    // Last day of (current month + 2) — a 3-month window: this month, next,
    // and the one after.
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0),
    );
    const to = toDate.toISOString().slice(0, 10);

    const response = await server.inject({
      method: "GET",
      url: `/v1/timeline?from=${from}&to=${to}&limit=90`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const allItems = body.days.flatMap(
      (d: { items: Array<{ type?: string }> }) => d.items,
    );
    const upcoming = allItems.filter(
      (i: { type?: string }) => i.type === "recurring.occurrence_upcoming",
    );
    expect(upcoming).toHaveLength(3);
  });

  it("does not duplicate a month already covered by a real Transaction within a multi-month range", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await createAccount(userId);
    const now = new Date();
    const dueDay = 28;
    const series = await server.prisma.recurringTransaction.create({
      data: {
        userId,
        description: "Aluguel",
        kind: "expense",
        accountId: account.id,
        referenceAmountCents: 150_000,
        referenceAmountBRLCents: 150_000,
        dayOfMonth: dueDay,
        startDate: new Date("2020-01-01"),
      },
    });
    // Current month already has a real (materialized) occurrence.
    await server.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        kind: "expense",
        description: "Aluguel",
        transactionDate: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15),
        ),
        amountCents: 150_000,
        amountBRLCents: 150_000,
        isScheduled: true,
        recurringTransactionId: series.id,
      },
    });

    const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0),
    );
    const to = toDate.toISOString().slice(0, 10);

    const response = await server.inject({
      method: "GET",
      url: `/v1/timeline?from=${from}&to=${to}&limit=90`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body = response.json();
    const allItems = body.days.flatMap(
      (d: { items: Array<{ type?: string }> }) => d.items,
    );
    const upcoming = allItems.filter(
      (i: { type?: string }) => i.type === "recurring.occurrence_upcoming",
    );
    // 3-month window, current month already materialized → only 2 previews left.
    expect(upcoming).toHaveLength(2);
  });

  it("caps projection at a pragmatic ceiling when `to` is left open", async () => {
    const { userId, accessToken } = await authedUser();
    const account = await createAccount(userId);
    const dueDay = 28;
    await server.prisma.recurringTransaction.create({
      data: {
        userId,
        description: "Aluguel",
        kind: "expense",
        accountId: account.id,
        referenceAmountCents: 150_000,
        referenceAmountBRLCents: 150_000,
        dayOfMonth: dueDay,
        startDate: new Date("2020-01-01"),
        // No endDate — an always-active series with no bound of its own;
        // without the cap this would try to project forever.
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/timeline?limit=90",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const allItems = body.days.flatMap(
      (d: { items: Array<{ type?: string }> }) => d.items,
    );
    const upcoming = allItems.filter(
      (i: { type?: string }) => i.type === "recurring.occurrence_upcoming",
    );
    expect(upcoming.length).toBeGreaterThan(0);
    expect(upcoming.length).toBeLessThanOrEqual(6);
  });
});
