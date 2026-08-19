// apps/api/scripts/seed-demo-user.ts
// Cria um usuário com senha + conta/cartão/categorias para validação visual
// local das telas do Sprint 5. NÃO é seed de produção — é fixture de dev.
import { PrismaClient } from "@lurem/db";
import { hashPassword } from "../src/auth/password.js";

const EMAIL = "demo@harmon.dev";
const PASSWORD = "lurem123";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (existing) {
      await prisma.transaction.deleteMany({ where: { userId: existing.id } });
      await prisma.recurringTransaction.deleteMany({
        where: { userId: existing.id },
      });
      await prisma.creditCard.deleteMany({ where: { userId: existing.id } });
      await prisma.account.deleteMany({ where: { userId: existing.id } });
      await prisma.category.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        name: "Demo Lurem",
        birthDate: new Date("1990-01-01"),
        passwordHash: await hashPassword(PASSWORD),
      },
    });

    const inst = await prisma.institution.upsert({
      where: { compeCode: "260" },
      update: {},
      create: {
        name: "Nubank",
        compeCode: "260",
        // Caminho completo servido por apps/web/public — logoUrl = `/${logoAsset}`.
        logoAsset: "ui-tokens/institutions/nubank.svg",
      },
    });

    const account = await prisma.account.create({
      data: {
        userId: user.id,
        type: "checking",
        institutionId: inst.id,
        name: "Conta principal",
        currency: "BRL",
        openingBalanceCents: 250_000,
        overdraftLimitCents: 50_000,
        reconciledBalanceCents: 250_000,
        reconciledAt: new Date(),
      },
    });
    await prisma.creditCard.create({
      data: {
        userId: user.id,
        institutionId: inst.id,
        name: "Cartão Nubank",
        limitCents: 500_000,
        closingDay: 20,
        dueDay: 28,
      },
    });
    await prisma.category.createMany({
      data: [
        {
          userId: user.id,
          name: "Mercado",
          kind: "expense",
          icon: "cart",
          colorToken: "--lr-negative-500",
        },
        {
          userId: user.id,
          name: "Salário",
          kind: "income",
          icon: "wallet",
          colorToken: "--lr-petrol-500",
        },
      ],
    });

    // Alguns lançamentos para o dashboard ter decomposição real (§6.9/§4.2):
    // uma despesa confirmada (entra no saldo), uma agendada do mês (subtrai do
    // Disponível Hoje) e uma série recorrente (subtrai enquanto pendente).
    // Datas ancoradas em julho/2026 para casar com asOf de validação.
    const utc = (y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m - 1, d));
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        kind: "expense",
        source: "manual",
        description: "Mercado",
        transactionDate: utc(2026, 7, 10),
        currency: "BRL",
        amountCents: 30_000,
        amountBRLCents: 30_000,
        isScheduled: false,
      },
    });
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        kind: "expense",
        source: "manual",
        description: "Aluguel (agendado)",
        transactionDate: utc(2026, 7, 30),
        currency: "BRL",
        amountCents: 120_000,
        amountBRLCents: 120_000,
        isScheduled: true,
      },
    });
    await prisma.recurringTransaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        description: "Internet",
        kind: "expense",
        referenceAmountCents: 10_000,
        referenceAmountBRLCents: 10_000,
        currency: "BRL",
        dayOfMonth: 28,
        startDate: utc(2026, 1, 28),
      },
    });

    console.log(`Demo user ready: ${EMAIL} / ${PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
