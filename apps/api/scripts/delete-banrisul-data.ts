// Script para deletar a conta Banrisul, transações e registros de importação
// Uso: pnpm exec tsx apps/api/scripts/delete-banrisul-data.ts

import { PrismaClient } from "@lurem/db";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  try {
    // 1. Encontrar a instituição Banrisul
    const banrisul = await prisma.institution.findUnique({
      where: { compeCode: "041" },
    });

    if (!banrisul) {
      console.log("Instituição Banrisul não encontrada (compeCode 041)");
      return;
    }

    console.log(
      `Encontrada instituição: ${banrisul.name} (ID: ${banrisul.id})`,
    );

    // 2. Encontrar todas as contas do usuário (belclei@gmail.com) nesta instituição
    const user = await prisma.user.findUnique({
      where: { email: "belclei@gmail.com" },
    });

    if (!user) {
      console.log("Usuário belclei@gmail.com não encontrado");
      return;
    }

    const accounts = await prisma.account.findMany({
      where: {
        userId: user.id,
        institutionId: banrisul.id,
      },
    });

    console.log(`Encontradas ${accounts.length} conta(s) Banrisul do usuário`);

    const accountIds = accounts.map((a) => a.id);

    // 3. Encontrar todos os cartões desta instituição
    const creditCards = await prisma.creditCard.findMany({
      where: {
        userId: user.id,
        institutionId: banrisul.id,
      },
    });

    console.log(
      `Encontrados ${creditCards.length} cartão(ões) Banrisul do usuário`,
    );

    const creditCardIds = creditCards.map((c) => c.id);

    // 4. Deletar documentos importados (que deletarão ExtractedTransactions em cascata)
    let deletedImports = 0;
    for (const accountId of accountIds) {
      const imports = await prisma.importedDocument.findMany({
        where: { userId: user.id, accountId },
      });

      for (const imp of imports) {
        // Deletar ExtractedTransactions primeiro (se necessário)
        await prisma.extractedTransaction.deleteMany({
          where: { importedDocumentId: imp.id },
        });

        await prisma.importedDocument.delete({
          where: { id: imp.id },
        });
        deletedImports++;
      }
    }

    for (const creditCardId of creditCardIds) {
      const imports = await prisma.importedDocument.findMany({
        where: { userId: user.id, creditCardId },
      });

      for (const imp of imports) {
        await prisma.extractedTransaction.deleteMany({
          where: { importedDocumentId: imp.id },
        });

        await prisma.importedDocument.delete({
          where: { id: imp.id },
        });
        deletedImports++;
      }
    }

    console.log(`Deletados ${deletedImports} documento(s) importado(s)`);

    // 5. Deletar transações das contas
    let deletedAccountTxs = 0;
    for (const accountId of accountIds) {
      const result = await prisma.transaction.deleteMany({
        where: { accountId },
      });
      deletedAccountTxs += result.count;
    }

    console.log(`Deletadas ${deletedAccountTxs} transação(ões) de conta(s)`);

    // 6. Deletar transações dos cartões
    let deletedCardTxs = 0;
    for (const creditCardId of creditCardIds) {
      const result = await prisma.transaction.deleteMany({
        where: { creditCardId },
      });
      deletedCardTxs += result.count;
    }

    console.log(`Deletadas ${deletedCardTxs} transação(ões) de cartão(ões)`);

    // 7. Deletar recorrências das contas
    let deletedAccountRecurring = 0;
    for (const accountId of accountIds) {
      const result = await prisma.recurringTransaction.deleteMany({
        where: { accountId },
      });
      deletedAccountRecurring += result.count;
    }

    console.log(
      `Deletadas ${deletedAccountRecurring} recorrência(s) de conta(s)`,
    );

    // 8. Deletar recorrências dos cartões
    let deletedCardRecurring = 0;
    for (const creditCardId of creditCardIds) {
      const result = await prisma.recurringTransaction.deleteMany({
        where: { creditCardId },
      });
      deletedCardRecurring += result.count;
    }

    console.log(
      `Deletadas ${deletedCardRecurring} recorrência(s) de cartão(ões)`,
    );

    // 9. Deletar os cartões
    let deletedCards = 0;
    for (const creditCardId of creditCardIds) {
      await prisma.creditCard.delete({
        where: { id: creditCardId },
      });
      deletedCards++;
    }

    console.log(`Deletados ${deletedCards} cartão(ões)`);

    // 10. Deletar as contas
    let deletedAccounts = 0;
    for (const accountId of accountIds) {
      await prisma.account.delete({
        where: { id: accountId },
      });
      deletedAccounts++;
    }

    console.log(`Deletadas ${deletedAccounts} conta(s)`);

    console.log("\n=== RESUMO ===");
    console.log(`Documentos importados: ${deletedImports}`);
    console.log(`Transações de conta: ${deletedAccountTxs}`);
    console.log(`Transações de cartão: ${deletedCardTxs}`);
    console.log(`Recorrências de conta: ${deletedAccountRecurring}`);
    console.log(`Recorrências de cartão: ${deletedCardRecurring}`);
    console.log(`Cartões: ${deletedCards}`);
    console.log(`Contas: ${deletedAccounts}`);
    console.log("\n✓ Dados Banrisul deletados com sucesso do banco local.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
