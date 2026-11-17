import "server-only";
import { z } from "zod";
import { Prisma, type CostItemCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { normalizeCnpj } from "@/modules/companies/cnpj";
import { deleteImage } from "@/modules/integrations/storage";
import { computeCost, normalizePrincipal, parseDecimal, parseMoney, parsePercentBps, toMm, LEAD_TIMES } from "./cost";

type Tx = Prisma.TransactionClient;

// =====================================================================
// Validação do formulário (o navegador envia valores como digitados)
// =====================================================================
const txt = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const num = z.union([z.string(), z.number()]).optional().nullable().transform((v) => parseDecimal(v as string))
  .refine((v) => v == null || v >= 0, "Use apenas valores positivos");
const money = z.union([z.string(), z.number()]).optional().nullable().transform((v) => parseMoney(v as string))
  .refine((v) => v == null || v >= 0, "Valor inválido");
const pct = z.union([z.string(), z.number()]).optional().nullable().transform((v) => parsePercentBps(v as string))
  .refine((v) => v == null || (v >= 0 && v <= 10_000), "IPI deve estar entre 0 e 100%");

export const productFormSchema = z.object({
  id: z.string().optional().nullable(),
  code: z.string().trim().toUpperCase().min(1, "Informe o código (SKU)").max(40).regex(/^[A-Z0-9][A-Z0-9._\-/]*$/, "Código: use letras, números, ponto, hífen ou barra"),
  name: z.string().trim().min(2, "Informe o nome do produto").max(160),
  slug: z.string().trim().toLowerCase().max(120).optional().nullable(),
  categoryId: z.string().min(1, "Escolha a categoria"),
  isActive: z.boolean(),
  isFeatured: z.boolean().default(false),
  description: txt(5000),
  internalNotes: txt(2000),
  color: txt(80),
  measureUnit: z.enum(["CM", "M"]),
  height: num, length: num, depth: num, diameter: num,
  frameMaterial: txt(160), openingType: z.enum(["MANIVELA", "MANUAL", "ALAVANCA", "AUTOMATICA", "OUTRO"]).optional().nullable().or(z.literal("").transform(() => null)),
  coverFeatures: txt(1000), weightKg: num, warranty: txt(300), careInstructions: txt(2000),
  seoTitle: txt(70), seoDescription: txt(170),
  packages: z.array(z.object({
    label: txt(60), lengthCm: num, widthCm: num, heightCm: num, weightKg: num,
    quantity: z.coerce.number().int().min(1).max(50).default(1),
  })).max(20).default([]),
  suppliers: z.array(z.object({
    id: z.string().optional().nullable(),
    supplierId: z.string().min(1),
    supplierCode: txt(60),
    leadTime: z.enum(LEAD_TIMES.map(([k]) => k) as [string, ...string[]]).optional().nullable().or(z.literal("").transform(() => null)),
    moq: z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === "" || v == null ? null : Math.round(Number(v))))
      .refine((v) => v == null || (Number.isInteger(v) && v >= 0), "MOQ inválido"),
    cost: money, ipi: pct, notes: txt(500), isPrincipal: z.boolean(),
  })).max(30).default([]),
  costItems: z.array(z.object({
    category: z.enum(["CORTE", "TECIDO", "GRAFICA", "PLAQUINHA"]),
    costItemId: z.string().min(1),
    quantity: num.refine((v) => v != null && v > 0, "Informe a quantidade"),
  })).max(4).default([]),
  images: z.array(z.object({
    id: z.string().optional().nullable(),
    url: z.string().min(1).max(500).refine((u) => u.startsWith("/api/media/") || u.startsWith("https://"), "URL de imagem inválida"),
    storageKey: z.string().max(200).optional().nullable(),
    alt: z.string().trim().max(160).default(""),
  })).max(30).default([]),
}).superRefine((v, ctx) => {
  const ids = v.suppliers.map((s) => s.supplierId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["suppliers"], message: "O mesmo fornecedor foi adicionado duas vezes." });
  const cats = v.costItems.map((c) => c.category);
  if (new Set(cats).size !== cats.length) ctx.addIssue({ code: "custom", path: ["costItems"], message: "Cada custo adicional só pode aparecer uma vez." });
  v.packages.forEach((p, i) => {
    if (p.lengthCm == null || p.widthCm == null || p.heightCm == null) ctx.addIssue({ code: "custom", path: ["packages", i], message: `Volume ${i + 1}: informe altura, largura e comprimento da caixa.` });
  });
});
export type ProductFormInput = z.input<typeof productFormSchema>;
type ProductForm = z.output<typeof productFormSchema>;

export const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "produto";

async function uniqueSlug(tx: Tx, base: string, exceptId?: string | null) {
  let slug = base, n = 2;
  while (await tx.product.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } })) slug = `${base}-${n++}`;
  return slug;
}

// =====================================================================
// Custo
// =====================================================================
export async function recalcProductCost(tx: Tx, productId: string) {
  const [links, items] = await Promise.all([
    tx.productSupplier.findMany({ where: { productId }, orderBy: { createdAt: "asc" } }),
    tx.productCostItem.findMany({ where: { productId }, include: { costItem: true } }),
  ]);
  const cost = computeCost(links, items.map((i) => ({ category: i.category, priceCents: i.costItem.priceCents, quantity: Number(i.quantity) })));
  const hasAny = links.length > 0 || items.length > 0;
  await tx.product.update({ where: { id: productId }, data: { costFinalCents: hasAny ? cost.finalCents : null, costUpdatedAt: new Date() } });
  return cost;
}

/** Item da tabela de custos mudou de preço → recalcula todos os produtos que o usam. */
export async function recalcProductsUsingCostItem(costItemId: string) {
  const uses = await db.productCostItem.findMany({ where: { costItemId }, select: { productId: true } });
  for (const { productId } of uses) await db.$transaction((tx) => recalcProductCost(tx, productId));
  return uses.length;
}

// =====================================================================
// Salvar produto (novo / editar / duplicar)
// =====================================================================
export async function saveProduct(actorId: string, raw: unknown) {
  const parsed = productFormSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AppError("VALIDATION", first?.message ?? "Dados inválidos.", 422, parsed.error.flatten().fieldErrors);
  }
  const f: ProductForm = parsed.data;
  const isEdit = !!f.id;
  const unit = f.measureUnit;

  const [category, costItems, suppliers] = await Promise.all([
    db.category.findUnique({ where: { id: f.categoryId } }),
    db.costItem.findMany({ where: { id: { in: f.costItems.map((c) => c.costItemId) } } }),
    db.supplier.findMany({ where: { id: { in: f.suppliers.map((s) => s.supplierId) } }, select: { id: true } }),
  ]);
  if (!category) throw new AppError("VALIDATION", "Categoria inválida.", 422);
  // Código duplicado: checagem explícita (mensagem clara) + índice único no banco (garantia em concorrência)
  const sameCode = await db.product.findFirst({ where: { code: f.code, ...(f.id ? { id: { not: f.id } } : {}) }, select: { id: true } });
  if (sameCode) throw new AppError("DUPLICATE_CODE", `Já existe um produto com o código "${f.code}". Use outro código.`, 409);
  if (suppliers.length !== new Set(f.suppliers.map((s) => s.supplierId)).size) throw new AppError("VALIDATION", "Fornecedor não encontrado. Atualize a página.", 422);
  for (const c of f.costItems) {
    const item = costItems.find((i) => i.id === c.costItemId);
    if (!item || item.category !== c.category) throw new AppError("VALIDATION", "Item da tabela de custos inválido para esta categoria.", 422);
  }

  const data = {
    code: f.code, name: f.name, categoryId: f.categoryId, isActive: f.isActive, isFeatured: f.isFeatured,
    deletedAt: f.isActive ? null : undefined,
    description: f.description, internalNotes: f.internalNotes, color: f.color, measureUnit: unit,
    heightMm: toMm(f.height, unit), lengthMm: toMm(f.length, unit), depthMm: toMm(f.depth, unit), diameterMm: toMm(f.diameter, unit),
    frameMaterial: f.frameMaterial, openingType: f.openingType ?? null, coverFeatures: f.coverFeatures,
    weightG: f.weightKg == null ? null : Math.round(f.weightKg * 1000),
    warranty: f.warranty, careInstructions: f.careInstructions, seoTitle: f.seoTitle, seoDescription: f.seoDescription,
  };

  const removedStorageKeys: string[] = [];
  try {
    const productId = await db.$transaction(async (tx) => {
      const before = isEdit ? await tx.product.findUnique({ where: { id: f.id! }, include: { suppliers: true, costItems: true } }) : null;
      if (isEdit && !before) throw new AppError("NOT_FOUND", "Produto não encontrado.", 404);
      const slug = await uniqueSlug(tx, slugify(f.slug || f.name), f.id);

      const product = isEdit
        ? await tx.product.update({ where: { id: f.id! }, data: { ...data, slug } })
        : await tx.product.create({ data: { ...data, slug, deletedAt: f.isActive ? null : new Date() } });
      const pid = product.id;

      // ---- Fotos: mantém, reordena (1ª = principal), cria e remove
      const existingImgs = await tx.productImage.findMany({ where: { productId: pid } });
      const keepIds = new Set(f.images.map((i) => i.id).filter(Boolean) as string[]);
      for (const img of existingImgs) if (!keepIds.has(img.id)) { removedStorageKeys.push(img.storageKey ?? ""); await tx.productImage.delete({ where: { id: img.id } }); }
      for (const [position, img] of f.images.entries()) {
        const alt = img.alt || `${f.name} — foto ${position + 1}`;
        if (img.id && existingImgs.some((e) => e.id === img.id)) await tx.productImage.update({ where: { id: img.id }, data: { position, alt } });
        else await tx.productImage.create({ data: { productId: pid, url: img.url, storageKey: img.storageKey ?? null, alt, position } });
      }

      // ---- Embalagens
      await tx.productPackage.deleteMany({ where: { productId: pid } });
      if (f.packages.length) {
        await tx.productPackage.createMany({
          data: f.packages.map((p, position) => ({
            productId: pid, position, label: p.label, quantity: p.quantity,
            lengthMm: toMm(p.lengthCm, "CM")!, widthMm: toMm(p.widthCm, "CM")!, heightMm: toMm(p.heightCm, "CM")!,
            weightG: p.weightKg == null ? null : Math.round(p.weightKg * 1000),
          })),
        });
      }

      // ---- Fornecedores: atualização por diferença + histórico de custo
      const links = normalizePrincipal(f.suppliers);
      const current = await tx.productSupplier.findMany({ where: { productId: pid } });
      const incomingIds = new Set(links.map((l) => l.id).filter(Boolean));
      for (const old of current) if (!incomingIds.has(old.id) && !links.some((l) => l.supplierId === old.supplierId)) await tx.productSupplier.delete({ where: { id: old.id } });
      for (const l of links) {
        const prev = current.find((c) => c.id === l.id) ?? current.find((c) => c.supplierId === l.supplierId);
        const linkData = { supplierId: l.supplierId, supplierCode: l.supplierCode, leadTime: (l.leadTime ?? null) as never, moq: l.moq, costCents: l.cost, ipiBps: l.ipi, notes: l.notes, isPrincipal: l.isPrincipal };
        if (prev) {
          await tx.productSupplier.update({ where: { id: prev.id }, data: linkData });
          if (prev.costCents !== l.cost || prev.ipiBps !== l.ipi) await tx.supplierCostHistory.create({ data: { productSupplierId: prev.id, costCents: l.cost, ipiBps: l.ipi, changedById: actorId } });
        } else {
          const created = await tx.productSupplier.create({ data: { ...linkData, productId: pid } });
          await tx.supplierCostHistory.create({ data: { productSupplierId: created.id, costCents: l.cost, ipiBps: l.ipi, changedById: actorId } });
        }
      }

      // ---- Custos adicionais
      await tx.productCostItem.deleteMany({ where: { productId: pid, category: { notIn: f.costItems.map((c) => c.category as CostItemCategory) } } });
      for (const c of f.costItems) {
        await tx.productCostItem.upsert({
          where: { productId_category: { productId: pid, category: c.category } },
          update: { costItemId: c.costItemId, quantity: new Prisma.Decimal(c.quantity!) },
          create: { productId: pid, category: c.category, costItemId: c.costItemId, quantity: new Prisma.Decimal(c.quantity!) },
        });
      }

      // ---- Todo produto vendável precisa de ao menos uma variação (SKU)
      if (!(await tx.productVariant.count({ where: { productId: pid } }))) {
        const taken = await tx.productVariant.findUnique({ where: { sku: f.code } });
        await tx.productVariant.create({ data: { productId: pid, sku: taken ? `${f.code}-01` : f.code, color: f.color, name: f.color ?? null } });
      }

      const cost = await recalcProductCost(tx, pid);
      await tx.auditLog.create({
        data: {
          actorId, action: isEdit ? "product.update" : "product.create", entity: "Product", entityId: pid,
          before: before ? (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue) : undefined,
          after: { ...data, suppliers: links, costItems: f.costItems, costFinalCents: cost.finalCents } as unknown as Prisma.InputJsonValue,
        },
      });
      return pid;
    });
    await Promise.all(removedStorageKeys.filter(Boolean).map(deleteImage));
    return { id: productId };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = JSON.stringify(e.meta ?? {});
      if (target.includes("code") || target.includes("sku")) throw new AppError("DUPLICATE_CODE", `Já existe um produto com o código "${f.code}". Use outro código.`, 409);
      throw new AppError("DUPLICATE", "Registro duplicado.", 409);
    }
    throw e;
  }
}

// =====================================================================
// Carregar para o formulário (editar / duplicar)
// =====================================================================
export async function loadProductForm(id: string, duplicate = false) {
  const p = await db.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { position: "asc" } },
      packages: { orderBy: { position: "asc" } },
      suppliers: { orderBy: [{ isPrincipal: "desc" }, { createdAt: "asc" }], include: { supplier: true } },
      costItems: true,
    },
  });
  if (!p) return null;
  const u = p.measureUnit;
  const conv = (mm: number | null) => (mm == null ? "" : String(u === "M" ? mm / 1000 : mm / 10).replace(".", ","));
  const br = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));
  return {
    id: duplicate ? null : p.id,
    code: duplicate ? `${p.code ?? "PROD"}-COPIA` : p.code ?? "",
    name: duplicate ? `${p.name} (cópia)` : p.name,
    slug: duplicate ? "" : p.slug,
    categoryId: p.categoryId, isActive: p.isActive, isFeatured: duplicate ? false : p.isFeatured,
    description: p.description ?? "", internalNotes: p.internalNotes ?? "", color: p.color ?? "", measureUnit: u,
    height: conv(p.heightMm), length: conv(p.lengthMm), depth: conv(p.depthMm), diameter: conv(p.diameterMm),
    frameMaterial: p.frameMaterial ?? "", openingType: p.openingType ?? "", coverFeatures: p.coverFeatures ?? "",
    weightKg: p.weightG == null ? "" : String(p.weightG / 1000).replace(".", ","), warranty: p.warranty ?? "", careInstructions: p.careInstructions ?? "",
    seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "",
    packages: p.packages.map((k) => ({ label: k.label ?? "", lengthCm: String(k.lengthMm / 10).replace(".", ","), widthCm: String(k.widthMm / 10).replace(".", ","), heightCm: String(k.heightMm / 10).replace(".", ","), weightKg: k.weightG == null ? "" : String(k.weightG / 1000).replace(".", ","), quantity: k.quantity })),
    suppliers: p.suppliers.map((s) => ({
      id: duplicate ? null : s.id, supplierId: s.supplierId, supplierCode: s.supplierCode ?? "", leadTime: s.leadTime ?? "",
      moq: s.moq == null ? "" : String(s.moq), cost: br(s.costCents), ipi: s.ipiBps == null ? "" : String(s.ipiBps / 100).replace(".", ","),
      notes: s.notes ?? "", isPrincipal: s.isPrincipal,
    })),
    costItems: p.costItems.map((c) => ({ category: c.category, costItemId: c.costItemId, quantity: String(Number(c.quantity)).replace(".", ",") })),
    // Fotos não são copiadas na duplicação (evita apagar o arquivo do original ao remover da cópia)
    images: duplicate ? [] : p.images.map((i) => ({ id: i.id, url: i.url, storageKey: i.storageKey, alt: i.alt })),
  };
}
export type ProductFormValues = NonNullable<Awaited<ReturnType<typeof loadProductForm>>>;

// =====================================================================
// Fornecedores
// =====================================================================
export const supplierSchema = z.object({
  id: z.string().optional().nullable(),
  legalName: z.string().trim().min(2, "Informe a razão social").max(160),
  tradeName: txt(160),
  cnpj: z.string().optional().nullable().transform((v) => (v ? normalizeCnpj(v) : null))
    .refine((v) => v == null || v.length === 14, "CNPJ deve ter 14 caracteres"),
  contact: txt(120), phone: txt(30), email: z.string().trim().toLowerCase().email("E-mail inválido").optional().nullable().or(z.literal("").transform(() => null)),
  notes: txt(1000),
});

export async function saveSupplier(actorId: string, raw: unknown) {
  const r = supplierSchema.safeParse(raw);
  if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const { id, ...data } = r.data;
  try {
    const s = id ? await db.supplier.update({ where: { id }, data }) : await db.supplier.create({ data });
    await db.auditLog.create({ data: { actorId, action: id ? "supplier.update" : "supplier.create", entity: "Supplier", entityId: s.id, after: data as Prisma.InputJsonValue } });
    return s;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("DUPLICATE_CNPJ", "Já existe um fornecedor com este CNPJ.", 409);
    throw e;
  }
}

/** Fornecedor com produtos vinculados é desativado (preserva histórico); sem vínculos, é excluído. */
export async function removeSupplier(actorId: string, id: string) {
  const links = await db.productSupplier.count({ where: { supplierId: id } });
  if (links) await db.supplier.update({ where: { id }, data: { isActive: false } });
  else await db.supplier.delete({ where: { id } });
  await db.auditLog.create({ data: { actorId, action: links ? "supplier.deactivate" : "supplier.delete", entity: "Supplier", entityId: id } });
  return { deactivated: links > 0, links };
}
