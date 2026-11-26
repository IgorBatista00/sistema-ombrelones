import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getUnitPrices } from "./index";
import { parseMarkup, rowPricing, validateMarkup, type PricingState } from "./markup";
import { listProfiles, PROFILE_SELECT } from "./profiles";

export const tableFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  categoria: z.string().optional().catch(undefined),
  situacao: z.enum(["sem_custo", "sem_markup", "abaixo_custo", "abaixo_minimo", "desatualizado", "ok"]).optional().catch(undefined),
  arquivados: z.literal("1").optional().catch(undefined),
  ordem: z.enum(["codigo", "produto", "linha", "preco", "custo"]).optional().catch(undefined),
});
export const ORDER_LABEL = { codigo: "Código", produto: "Produto e medida", linha: "Categoria, produto e medida", preco: "Preço calculado (menor → maior)", custo: "Custo final (menor → maior)" } as const;

/** Chave de ordenação natural: números (com vírgula) viram números, então 2,00 < 2,40 < 2,70 < 3,00 e 3,5 = 3,50. */
const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
export function naturalKey(text: string) {
  return text.toLowerCase().replace(/\d+(?:[.,]\d+)?/g, (n) => {
    const v = Number(n.replace(",", "."));
    return Number.isFinite(v) ? v.toFixed(3).padStart(14, "0") : n;
  });
}
export const compareNatural = (a: string, b: string) => collator.compare(naturalKey(a), naturalKey(b));
export type TableFilters = z.infer<typeof tableFilterSchema>;

/** Todos os produtos com foto, descrição, custo final, markup, preço calculado e preço atual do site. */
export async function priceTable(f: TableFilters) {
  const and: Prisma.ProductWhereInput[] = [f.arquivados ? {} : { deletedAt: null }];
  if (f.categoria) and.push({ category: { slug: f.categoria } });
  if (f.q) and.push({ OR: [{ code: { contains: f.q, mode: "insensitive" } }, { name: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }, { variants: { some: { sku: { contains: f.q, mode: "insensitive" } } } }] });
  const [products, categories, profiles] = await Promise.all([
    db.product.findMany({ where: { AND: and }, orderBy: [{ code: "asc" }, { name: "asc" }], include: { markupProfile: { select: PROFILE_SELECT }, category: { select: { name: true } }, images: { orderBy: { position: "asc" }, take: 1 }, variants: { orderBy: { position: "asc" }, select: { id: true, sku: true } } } }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    listProfiles(),
  ]);
  const prices = await getUnitPrices(products.flatMap((p) => p.variants.map((v) => v.id)));
  const rows = products.map((p) => {
    const sitePrices = p.variants.map((v) => prices.get(v.id) ?? null);
    const sitePriceCents = sitePrices[0] ?? null;
    const pr = rowPricing({ costCents: p.costFinalCents, markup: p.markup, profile: p.markupProfile, sitePriceCents });
    const calc = pr.calc, state = pr.state;
    return {
      id: p.id, code: p.code, name: p.name, description: p.description, category: p.category.name, image: p.images[0]?.url ?? null, isActive: p.isActive, archived: !!p.deletedAt,
      variants: p.variants.length, mixedSitePrices: new Set(sitePrices).size > 1,
      costCents: p.costFinalCents, costUpdatedAt: p.costUpdatedAt, markup: p.markup, profileId: p.markupProfileId, calcCents: calc, minCents: pr.min, marginBps: pr.marginBps, siteMarginBps: pr.siteMarginBps, sitePriceCents,
      diffCents: calc != null && sitePriceCents != null ? calc - sitePriceCents : null, state,
    };
  }).filter((r) => !f.situacao || r.state === f.situacao);
  sortRows(rows, f.ordem);
  const count = (s: PricingState) => rows.filter((r) => r.state === s).length;
  return { rows, categories, profiles, counts: { total: rows.length, sem_custo: count("sem_custo"), sem_markup: count("sem_markup"), abaixo_custo: count("abaixo_custo"), abaixo_minimo: count("abaixo_minimo"), desatualizado: count("desatualizado"), ok: count("ok") } };
}

/** Define (ou remove, se vazio) o markup de um ou mais produtos. */
export async function setMarkup(actorId: string, productIds: string[], input: string) {
  if (!productIds.length) throw new AppError("VALIDATION", "Selecione ao menos um produto.", 422);
  const m = parseMarkup(input);
  const err = validateMarkup(m);
  if (err) throw new AppError("VALIDATION", err, 422);
  return db.$transaction(async (tx) => {
    const before = await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, markup: true, markupProfileId: true } });
    await tx.product.updateMany({ where: { id: { in: productIds } }, data: { markup: m, markupProfileId: null, markupUpdatedAt: new Date() } });
    await tx.auditLog.createMany({ data: before.filter((b) => b.markup !== m || b.markupProfileId).map((b) => ({ actorId, action: "product.markup", entity: "Product", entityId: b.id, before: { markup: b.markup, markupProfileId: b.markupProfileId }, after: { markup: m, markupProfileId: null } })) });
    return { markup: m, updated: before.length };
  });
}

/**
 * Aplica o preço calculado (perfil: custo ÷ divisor; manual: custo × markup) como preço de venda do site, em TODAS as variações do produto.
 * Mantém o histórico de preços (encerra o vigente e cria o novo). Produtos sem custo/markup ou com markup < 1 são pulados.
 */
export async function applyCalculatedPrices(actorId: string, productIds: string[]) {
  if (!productIds.length) throw new AppError("VALIDATION", "Selecione ao menos um produto.", 422);
  return db.$transaction(async (tx) => {
    const list = await tx.priceList.findFirstOrThrow({ where: { isDefault: true } });
    const products = await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, code: true, name: true, costFinalCents: true, markup: true, markupProfile: { select: PROFILE_SELECT }, variants: { select: { id: true } } } });
    const now = new Date();
    const applied: string[] = [], skipped: { name: string; reason: string }[] = [];
    for (const p of products) {
      const cents = rowPricing({ costCents: p.costFinalCents, markup: p.markup, profile: p.markupProfile, sitePriceCents: null }).calc;
      if (cents == null) { skipped.push({ name: p.code ?? p.name, reason: p.costFinalCents == null ? "sem custo" : "sem markup" }); continue; }
      if (!p.markupProfile && (p.markup ?? 0) < 10_000) { skipped.push({ name: p.code ?? p.name, reason: "markup menor que 1 (abaixo do custo)" }); continue; }
      let changed = false;
      for (const v of p.variants) {
        const current = await tx.price.findFirst({ where: { variantId: v.id, priceListId: list.id, validTo: null }, orderBy: { validFrom: "desc" } });
        if (current?.amountCents === cents) continue;
        if (current) await tx.price.update({ where: { id: current.id }, data: { validTo: now } });
        await tx.price.create({ data: { variantId: v.id, priceListId: list.id, amountCents: cents, validFrom: now } });
        changed = true;
      }
      if (changed) {
        applied.push(p.code ?? p.name);
        await tx.auditLog.create({ data: { actorId, action: "product.price.from-markup", entity: "Product", entityId: p.id, after: { priceCents: cents, costFinalCents: p.costFinalCents, markup: p.markup } } });
      }
    }
    return { applied, skipped };
  });
}

type Sortable = { code: string | null; name: string; category: string; calcCents: number | null; costCents: number | null };
export function sortRows<T extends Sortable>(rows: T[], ordem?: TableFilters["ordem"]) {
  const byName = (a: T, b: T) => compareNatural(a.name, b.name) || compareNatural(a.code ?? "", b.code ?? "");
  const num = (x: number | null) => (x == null ? Number.POSITIVE_INFINITY : x);
  const cmp: Record<string, (a: T, b: T) => number> = {
    produto: byName,
    linha: (a, b) => collator.compare(a.category, b.category) || byName(a, b),
    preco: (a, b) => num(a.calcCents) - num(b.calcCents) || byName(a, b),
    custo: (a, b) => num(a.costCents) - num(b.costCents) || byName(a, b),
  };
  if (ordem && cmp[ordem]) rows.sort(cmp[ordem]);
  return rows;
}
