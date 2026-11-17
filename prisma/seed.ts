/**
 * SEED DE DEMONSTRAÇÃO
 * --------------------------------------------------------------
 * Popula categorias (reais, definidas no briefing) e, SOMENTE se
 * SEED_DEMO=true, produtos de EXEMPLO claramente marcados "[DEMO]".
 *
 * - Nenhuma especificação técnica é inventada: a ficha técnica fica vazia.
 * - Preços e estoques de demonstração são fictícios e marcados como tal.
 * - Nunca rode com SEED_DEMO=true em produção (o script bloqueia).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const categories = [
    { slug: "ombrelones-centrais", name: "Ombrelones centrais", position: 1 },
    { slug: "ombrelones-laterais", name: "Ombrelones laterais", position: 2 },
    { slug: "ombrelones-com-led", name: "Ombrelones com LED", position: 3 },
    { slug: "bases-e-acessorios", name: "Bases e acessórios", position: 4 },
  ];
  // categorias iniciais só num banco vazio (o seed roda a cada publicação: não recria as que você excluiu)
  if ((await prisma.category.count()) === 0) for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }

  await prisma.priceList.upsert({
    where: { code: "ATACADO" },
    update: {},
    create: { code: "ATACADO", name: "Atacado (padrão B2B)", isDefault: true },
  });

  await prisma.setting.upsert({
    where: { key: "commercial" },
    update: {},
    create: {
      key: "commercial",
      value: {
        reservationMinutes: { PIX: 60, BOLETO: 4320, CREDIT_CARD: 30 },
        quoteReservationHours: 72,
        enabledMethods: ["PIX", "BOLETO", "CREDIT_CARD"],
        maxInstallments: 1,
        boletoDueDays: 3,
      },
    },
  });

  // Administrador inicial
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword && process.env.APP_ENV === "production" && (adminPassword.length < 12 || !/[a-z]/i.test(adminPassword) || !/\d/.test(adminPassword))) {
    throw new Error("SEED_ADMIN_PASSWORD fraca: use 12+ caracteres com letras e números.");
  }
  // cria o administrador só se o e-mail ainda não existir (não altera senha de quem já existe)
  if (adminEmail && adminPassword) {
    const user = await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: {},
      create: {
        email: adminEmail.toLowerCase(),
        name: "Administrador",
        passwordHash: await bcrypt.hash(adminPassword, 12),
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.adminUser.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        permissions: ["DASHBOARD", "PRODUCTS", "STOCK", "CUSTOMERS", "ORDERS", "LOGISTICS", "FINANCE", "SETTINGS", "ADMIN_USERS"],
      },
    });
  }

  if (process.env.SEED_DEMO !== "true") return;
  if (process.env.APP_ENV === "production") {
    throw new Error("SEED_DEMO não pode ser usado em produção.");
  }

  const priceList = await prisma.priceList.findUniqueOrThrow({ where: { code: "ATACADO" } });
  const cats = await prisma.category.findMany();
  let n = 1;
  for (const cat of cats) {
    for (let i = 1; i <= 3; i++) {
      const sku = `DEMO-${String(n).padStart(3, "0")}`;
      const product = await prisma.product.upsert({
        where: { slug: `demo-${cat.slug}-${i}` },
        update: {},
        create: {
          slug: `demo-${cat.slug}-${i}`,
          name: `[DEMO] ${cat.name} · modelo ${i}`,
          description: "Produto de demonstração. Substitua pelos dados reais no painel administrativo.",
          categoryId: cat.id,
          isFeatured: i === 1,
          variants: {
            create: {
              sku,
              name: "Variação de demonstração",
              sizeLabel: "[DEMO] dimensão",
              availability: i === 3 ? "MADE_TO_ORDER" : "STOCK",
              leadTimeDays: i === 3 ? 30 : null,
              prices: { create: { priceListId: priceList.id, amountCents: 10000 * n } },
              stock: { create: { onHand: i === 3 ? 0 : 20 } },
              packages: { create: { lengthMm: 1000, widthMm: 200, heightMm: 200, weightG: 10000, label: "[DEMO] volume" } },
            },
          },
        },
      });
      void product;
      n++;
    }
  }
  // Tabela de custos e fornecedor de exemplo — valores FICTÍCIOS, só para demonstração
  const demoCosts = [
    { key: "demo-corte-padrao", label: "[DEMO] Corte padrão", unit: "un", priceCents: 1250, category: "CORTE" as const },
    { key: "demo-tecido-acrilico", label: "[DEMO] Tecido acrílico", unit: "m", priceCents: 3990, category: "TECIDO" as const },
    { key: "demo-grafica-etiqueta", label: "[DEMO] Etiqueta impressa", unit: "un", priceCents: 180, category: "GRAFICA" as const },
    { key: "demo-plaquinha-metal", label: "[DEMO] Plaquinha metálica", unit: "un", priceCents: 650, category: "PLAQUINHA" as const },
  ];
  for (const c of demoCosts) await prisma.costItem.upsert({ where: { key: c.key }, update: {}, create: c });
  if (!(await prisma.supplier.findFirst({ where: { legalName: "[DEMO] Fornecedor Exemplo Ltda" } }))) {
    await prisma.supplier.create({ data: { legalName: "[DEMO] Fornecedor Exemplo Ltda", tradeName: "Fornecedor Exemplo", contact: "Contato de demonstração" } });
  }
  console.log("Seed de demonstração aplicado (produtos marcados [DEMO]).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
