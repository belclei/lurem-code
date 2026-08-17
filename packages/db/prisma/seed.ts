// Lurem — seed (US-1.3)
// Fonte: ARQUITETURA.md §6.2 (bootstrap do primeiro admin), §6.3 (feature flags),
// §6.4 (catálogo de instituições), §6.5 (categorias); IMPLEMENTACAO.md §1.2-1.4.
//
// Idempotente: usa upsert em toda entidade, seguro para rodar mais de uma vez
// contra o mesmo banco (dev local / CI).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ⚠ NOTA PARA REVISÃO HUMANA: birthDate é campo obrigatório em User (não-nulo)
// mas o valor real de nascimento de belclei@gmail.com não foi fornecido a este
// agente. Usamos um placeholder óbvio (1990-01-01) — troque pelo valor real
// antes de considerar este seed "de produção". Ver relatório final.
const ADMIN_BIRTHDATE_PLACEHOLDER = new Date("1990-01-01T00:00:00.000Z");

async function seedAdminUser() {
  // Bootstrap direto (ARQUITETURA.md §6.2): o primeiro admin nasce fora da
  // fila de acesso e fora do fluxo de convite, porque não existe admin nenhum
  // ainda para aprová-lo. passwordHash fica nulo — login inicial via Google
  // OAuth (US-1.10, Sprint 2) ou definição de senha depois do primeiro login.
  const admin = await prisma.user.upsert({
    where: { email: "belclei@gmail.com" },
    update: { role: "admin" },
    create: {
      email: "belclei@gmail.com",
      name: "Belclei Fasolo",
      birthDate: ADMIN_BIRTHDATE_PLACEHOLDER,
      passwordHash: null,
      role: "admin",
      isBetaTester: true,
      avatarMode: "dicebear",
      themePref: "light",
      status: "active",
    },
  });
  return admin;
}

// Categorias de sistema (userId nulo, read-only, ARQUITETURA.md §6.5).
// colorToken usa a paleta real de brand/tokens/harmon-tokens.css (famílias
// blue/clay/sage/sand) — sem clichê financeiro nos ícones (nome de ícone
// lucide-style, resolvido pela UI).
const SYSTEM_CATEGORIES: Array<{
  name: string;
  kind: "income" | "expense";
  icon: string;
  colorToken: string;
}> = [
  {
    name: "Salário",
    kind: "income",
    icon: "hm-cat-renda",
    colorToken: "--hm-sage-600",
  },
  {
    name: "Freelance e extras",
    kind: "income",
    icon: "hm-cat-renda",
    colorToken: "--hm-sage-500",
  },
  {
    name: "Investimentos",
    kind: "income",
    icon: "trending-up",
    colorToken: "--hm-blue-600",
  },
  {
    name: "Reembolso",
    kind: "income",
    icon: "hm-cat-renda",
    colorToken: "--hm-blue-500",
  },
  {
    name: "Outras receitas",
    kind: "income",
    icon: "plus-circle",
    colorToken: "--hm-sand-500",
  },

  {
    name: "Moradia",
    kind: "expense",
    icon: "hm-cat-moradia",
    colorToken: "--hm-clay-600",
  },
  {
    name: "Alimentação",
    kind: "expense",
    icon: "hm-cat-alimentacao",
    colorToken: "--hm-clay-500",
  },
  {
    name: "Transporte",
    kind: "expense",
    icon: "hm-cat-transporte",
    colorToken: "--hm-clay-100",
  },
  {
    name: "Saúde",
    kind: "expense",
    icon: "hm-cat-saude",
    colorToken: "--hm-blue-700",
  },
  {
    name: "Lazer",
    kind: "expense",
    icon: "hm-cat-lazer",
    colorToken: "--hm-sand-600",
  },
  {
    name: "Compras",
    kind: "expense",
    icon: "hm-cat-compras",
    colorToken: "--hm-sand-500",
  },
  {
    name: "Assinaturas",
    kind: "expense",
    icon: "hm-cat-assinaturas",
    colorToken: "--hm-blue-300",
  },
  {
    name: "Educação",
    kind: "expense",
    icon: "graduation-cap",
    colorToken: "--hm-sage-700",
  },
  {
    name: "Cuidados pessoais",
    kind: "expense",
    icon: "hm-cat-saude",
    colorToken: "--hm-clay-650",
  },
  {
    name: "Outras despesas",
    kind: "expense",
    icon: "more-horizontal",
    colorToken: "--hm-ink-500",
  },
];

async function seedSystemCategories() {
  // ⚠ NOTA PARA REVISÃO HUMANA: @@unique([userId, name, kind]) não é reforçado
  // pelo Postgres para linhas com userId NULL (semântica SQL: NULL nunca é
  // igual a NULL, então o índice único permite múltiplas linhas de categoria
  // de sistema com o mesmo name+kind). O Prisma também rejeita `null` literal
  // na cláusula `where` de um upsert sobre essa chave composta (ver erro em
  // tempo de execução). Por isso, idempotência aqui é responsabilidade da
  // aplicação (findFirst manual), não do banco — documentado, não escondido.
  for (const category of SYSTEM_CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { userId: null, name: category.name, kind: category.kind },
    });
    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: {
          icon: category.icon,
          colorToken: category.colorToken,
          isSystem: true,
        },
      });
    } else {
      await prisma.category.create({
        data: {
          userId: null,
          name: category.name,
          kind: category.kind,
          icon: category.icon,
          colorToken: category.colorToken,
          isSystem: true,
        },
      });
    }
  }
}

// Catálogo de instituições (ARQUITETURA.md §6.4 lista as principais; PagBank e
// Cresol somados por pedido explícito do backlog US-1.3).
// ⚠ COMPE codes são melhor-esforço a partir de conhecimento público — não
// verificados contra a lista oficial de participantes STR do Bacen. Confirme
// antes de usar para reconciliação/match de extrato em produção.
// ⚠ logoAsset segue a convenção de IMPLEMENTACAO.md §1.3 ("ui-tokens/institutions"),
// que diverge do path citado em ARQUITETURA.md §6.4 ("/instituitions/icons",
// com erro de digitação no próprio documento). Ver relatório final.
const INSTITUTIONS: Array<{
  name: string;
  compeCode: string | null;
  logoAsset: string;
}> = [
  {
    name: "Nubank",
    compeCode: "260",
    logoAsset: "ui-tokens/institutions/nubank.svg",
  },
  {
    name: "Itaú Unibanco",
    compeCode: "341",
    logoAsset: "ui-tokens/institutions/itau.svg",
  },
  {
    name: "Bradesco",
    compeCode: "237",
    logoAsset: "ui-tokens/institutions/bradesco.svg",
  },
  {
    name: "Banco do Brasil",
    compeCode: "001",
    logoAsset: "ui-tokens/institutions/banco-do-brasil.svg",
  },
  {
    name: "Caixa Econômica Federal",
    compeCode: "104",
    logoAsset: "ui-tokens/institutions/caixa.svg",
  },
  {
    name: "Santander",
    compeCode: "033",
    logoAsset: "ui-tokens/institutions/santander.svg",
  },
  {
    name: "Banco Inter",
    compeCode: "077",
    logoAsset: "ui-tokens/institutions/inter.svg",
  },
  {
    name: "C6 Bank",
    compeCode: "336",
    logoAsset: "ui-tokens/institutions/c6-bank.svg",
  },
  {
    name: "BTG Pactual",
    compeCode: "208",
    logoAsset: "ui-tokens/institutions/btg-pactual.svg",
  },
  {
    name: "XP Investimentos",
    compeCode: "348",
    logoAsset: "ui-tokens/institutions/xp.svg",
  },
  {
    name: "PicPay",
    compeCode: "380",
    logoAsset: "ui-tokens/institutions/picpay.svg",
  },
  {
    name: "Mercado Pago",
    compeCode: "323",
    logoAsset: "ui-tokens/institutions/mercado-pago.svg",
  },
  {
    name: "Banrisul",
    compeCode: "041",
    logoAsset: "ui-tokens/institutions/banrisul.svg",
  },
  {
    name: "Sicredi",
    compeCode: "748",
    logoAsset: "ui-tokens/institutions/sicredi.svg",
  },
  {
    name: "Sicoob",
    compeCode: "756",
    logoAsset: "ui-tokens/institutions/sicoob.svg",
  },
  {
    name: "PagBank",
    compeCode: "290",
    logoAsset: "ui-tokens/institutions/pagbank.svg",
  },
  {
    name: "Cresol",
    compeCode: "133",
    logoAsset: "ui-tokens/institutions/cresol.svg",
  },
  {
    name: "Banco Safra",
    compeCode: "422",
    logoAsset: "ui-tokens/institutions/safra.svg",
  },
  {
    name: "Banco Pan",
    compeCode: "623",
    logoAsset: "ui-tokens/institutions/pan.svg",
  },
  {
    name: "Banco BMG",
    compeCode: "318",
    logoAsset: "ui-tokens/institutions/bmg.svg",
  },
  {
    name: "Banco Original",
    compeCode: "212",
    logoAsset: "ui-tokens/institutions/original.svg",
  },
  {
    name: "Neon",
    compeCode: "735",
    logoAsset: "ui-tokens/institutions/neon.svg",
  },
  {
    name: "Stone",
    compeCode: "197",
    logoAsset: "ui-tokens/institutions/stone.svg",
  },
  {
    name: "BRB — Banco de Brasília",
    compeCode: "070",
    logoAsset: "ui-tokens/institutions/brb.svg",
  },
  {
    name: "Banco Daycoval",
    compeCode: "707",
    logoAsset: "ui-tokens/institutions/daycoval.svg",
  },
  {
    name: "Credisis",
    compeCode: "097",
    logoAsset: "ui-tokens/institutions/credisis.svg",
  },
  {
    name: "Banco BV",
    compeCode: "655",
    logoAsset: "ui-tokens/institutions/bv.svg",
  },
];

async function seedInstitutions() {
  for (const institution of INSTITUTIONS) {
    await prisma.institution.upsert({
      where: {
        compeCode: institution.compeCode ?? `__no-compe__:${institution.name}`,
      },
      update: {
        name: institution.name,
        logoAsset: institution.logoAsset,
        isActive: true,
      },
      create: {
        name: institution.name,
        compeCode: institution.compeCode,
        logoAsset: institution.logoAsset,
        isActive: true,
      },
    });
  }
}

async function seedFeatureFlags() {
  await prisma.featureFlag.upsert({
    where: { key: "imports.pipeline" },
    update: {},
    create: {
      key: "imports.pipeline",
      description:
        "Pipeline de importação de extratos/faturas (extração client-side + LLM DeepSeek + staging). Kill switch.",
      state: "off",
      rolloutPercent: 100,
    },
  });

  // IMPLEMENTACAO.md §5.5: a feature `connections.portador` nasce em `beta`
  // agora que está implementada (Sprint 11) — a transição off->beta prevista
  // pelo comentário original deste seed. `update: {}` preserva o estado de
  // um ambiente já rodando (um admin pode ter promovido para `on`); só o
  // `create` de um banco novo usa este valor.
  await prisma.featureFlag.upsert({
    where: { key: "connections.portador" },
    update: {},
    create: {
      key: "connections.portador",
      description:
        "Atribuição de transações a um conectado (portador) e fluxo de acerto entre contas conectadas.",
      state: "beta",
      rolloutPercent: 100,
    },
  });

  // Feature flag para a funcionalidade geral de conexões (incompleta).
  // Desabilitada para todos até que a implementação seja concluída.
  await prisma.featureFlag.upsert({
    where: { key: "connections" },
    update: {},
    create: {
      key: "connections",
      description:
        "Funcionalidade geral de conexões entre usuários. Incompleta — desabilitada por padrão.",
      state: "off",
      rolloutPercent: 0,
    },
  });
}

async function main() {
  const admin = await seedAdminUser();
  await seedSystemCategories();
  await seedInstitutions();
  await seedFeatureFlags();

  console.log(
    `Seed complete. Admin user: ${admin.email} (role=${admin.role}).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
