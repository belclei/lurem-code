// One-off cleanup: strips a leading "#" from any existing Tag.name that has
// one (issues.md: tags never required the "#" prefix, but the old
// placeholder/UI made it look mandatory, so some rows were saved with it).
// If stripping the prefix collides with an already-normalized tag for the
// same user (e.g. both "#uber" and "uber" exist), merges the "#"-prefixed
// tag's TransactionTag links into the existing one and deletes the
// duplicate, instead of erroring on the @@unique([userId, name]) collision.
//
// Uso: pnpm exec tsx apps/api/scripts/strip-hash-prefix-from-tags.ts
import { PrismaClient } from "@lurem/db";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  try {
    const hashedTags = await prisma.tag.findMany({
      where: { name: { startsWith: "#" } },
    });

    console.log(`Encontradas ${hashedTags.length} tag(s) com prefixo "#"`);

    let renamed = 0;
    let merged = 0;

    for (const tag of hashedTags) {
      const strippedName = tag.name.replace(/^#+/, "");
      if (strippedName.length === 0) {
        // Edge case: a tag that was literally just "#" — nothing sane to
        // rename it to, leave it for manual review instead of guessing.
        console.log(`  Ignorando tag só com "#" (id=${tag.id})`);
        continue;
      }

      const existing = await prisma.tag.findUnique({
        where: { userId_name: { userId: tag.userId, name: strippedName } },
      });

      if (existing) {
        // Merge: repoint every TransactionTag link from the "#"-prefixed
        // duplicate onto the existing normalized tag, then drop the dupe.
        // deleteMany+createMany (not update) because TransactionTag's PK is
        // the (transactionId, tagId) pair, and a transaction could already
        // carry both tags — plain createMany with skipDuplicates avoids a
        // unique-constraint crash on that overlap.
        const links = await prisma.transactionTag.findMany({
          where: { tagId: tag.id },
        });
        if (links.length > 0) {
          await prisma.transactionTag.createMany({
            data: links.map((l) => ({
              transactionId: l.transactionId,
              tagId: existing.id,
            })),
            skipDuplicates: true,
          });
          await prisma.transactionTag.deleteMany({
            where: { tagId: tag.id },
          });
        }
        await prisma.tag.delete({ where: { id: tag.id } });
        merged++;
        console.log(`  Mesclado "${tag.name}" -> "${strippedName}"`);
      } else {
        await prisma.tag.update({
          where: { id: tag.id },
          data: { name: strippedName },
        });
        renamed++;
        console.log(`  Renomeado "${tag.name}" -> "${strippedName}"`);
      }
    }

    console.log("\n=== RESUMO ===");
    console.log(`Renomeadas: ${renamed}`);
    console.log(`Mescladas: ${merged}`);
    console.log('✓ Limpeza de prefixo "#" concluída.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
