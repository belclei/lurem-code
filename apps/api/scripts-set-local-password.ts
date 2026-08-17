import { PrismaClient } from "@lurem/db";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();
const PASSWORD = "lurem-local-2026";

async function main() {
  const passwordHash = await hash(PASSWORD, { algorithm: 2 });
  const user = await prisma.user.update({
    where: { email: "belclei@gmail.com" },
    data: { passwordHash },
  });
  console.log(`Password set for ${user.email}`);
}

main().finally(() => prisma.$disconnect());
