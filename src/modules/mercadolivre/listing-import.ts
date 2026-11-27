import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { readMatrix } from "@/modules/products/excel";
import { componentsFromSkus, dedupeListings, findListingHeader, parseListingRow, type ParsedListing } from "./listing-sheet-rules";
import { applyMlStock, relinkItems } from "./service";

const MAX_ROWS = 3000;
export type ListingImportRow = {
  line: number; itemId: string; title: string; variation: string; listingType: string | null; priceCents: number | null; listPriceCents: number | null; feeBps: number | null;
  skus: { sku: string; quantity: number; product: string | null }[]; matched: boolean; action: "criar" | "atualizar"; warnings: string[];
};
export type ListingImportPreview = { rows: ListingImportRow[]; issues: { line: number; messages: string[]; level: "erro" | "aviso" }[]; totals: { rows: number; create: number; update: number; unmatched: number; dropped: number } };

/** SKU da planilha → variação do estoque: SKU da variação, ou código do produto quando ele tem uma variação só. */
async function skuMap(skus: string[]) {
  const up = [...new Set(skus.map((s) => s.toUpperCase()))];
  const variants = await db.productVariant.findMany({
    where: { OR: [{ sku: { in: up, mode: "insensitive" } }, { product: { code: { in: up, mode: "insensitive" } } }], product: { deletedAt: null } },
    select: { id: true, sku: true, product: { select: { code: true, name: true, _count: { select: { variants: true } } } } },
  });
  const map = new Map<string, { variantId: string; label: string }>();
  for (const v of variants) {
    const label = `${v.product.code ?? v.sku} · ${v.product.name}`;
    if (v.sku) map.set(v.sku.toUpperCase(), { variantId: v.id, label });
    const code = v.product.code?.toUpperCase();
    if (code && v.product._count.variants === 1 && !map.has(code)) map.set(code, { variantId: v.id, label });
  }
  return map;
}

async function analyze(buf: Buffer, filename: string) {
  const matrix = await readMatrix(buf, filename, (m) => !!findListingHeader(m));
  const h = findListingHeader(matrix);
  if (!h) throw new AppError("BAD_HEADER", "Não encontrei as colunas da planilha de anúncios (Código do anúncio / ITEM_ID e Título). Use a planilha baixada em Anúncios › Modificar em massa › Modificar em Excel, sem mudar os títulos das colunas.", 422);
  const body = matrix.slice(h.lastHeaderRow + 1);
  if (body.length > MAX_ROWS) throw new AppError("TOO_MANY_ROWS", `Máximo de ${MAX_ROWS} anúncios por importação.`, 422);
  const parsed = body.map((cells, i) => parseListingRow((cells ?? []).map((c) => String(c ?? "")), h.cols, h.lastHeaderRow + i + 2)).filter((r) => !r.empty);
  const issues: ListingImportPreview["issues"] = parsed.filter((r) => r.errors.length).map((r) => ({ line: r.line, messages: r.errors, level: "erro" as const }));
  const ok = parsed.map((r) => r.ok).filter(Boolean) as ParsedListing[];
  const warnByLine = new Map(parsed.filter((r) => r.ok).map((r) => [r.ok!.line, r.warnings]));
  const { keep, dropped } = dedupeListings(ok);
  for (const d of dropped) issues.push({ line: d.line, messages: [d.reason], level: "erro" });
  const map = await skuMap(keep.flatMap((r) => r.skus));
  const existing = await db.mlListing.findMany({ where: { mlItemId: { in: keep.map((r) => r.itemId) } }, select: { id: true, mlItemId: true, variation: true } });
  const exKey = new Map(existing.map((e) => [`${e.mlItemId}|${e.variation}`, e.id]));
  const rows: (ListingImportRow & { components: { variantId: string; quantity: number }[]; existingId: string | null })[] = keep.map((r) => {
    const comps = componentsFromSkus(r.skus).map((c) => ({ ...c, hit: map.get(c.sku) ?? null }));
    const matched = comps.length > 0 && comps.every((c) => c.hit);
    const existingId = exKey.get(`${r.itemId}|${r.variation}`) ?? null;
    const warnings = [...(warnByLine.get(r.line) ?? [])];
    const miss = comps.filter((c) => !c.hit).map((c) => c.sku);
    if (miss.length) warnings.push(`SKU sem produto no sistema: ${miss.join(", ")}. O anúncio entra sem produto ligado.`);
    return {
      line: r.line, itemId: r.itemId, title: r.title, variation: r.variation, listingType: r.listingType, priceCents: r.priceCents, listPriceCents: r.listPriceCents, feeBps: r.feeBps,
      skus: comps.map((c) => ({ sku: c.sku, quantity: c.quantity, product: c.hit?.label ?? null })), matched, action: existingId ? "atualizar" : "criar", warnings,
      components: matched ? comps.map((c) => ({ variantId: c.hit!.variantId, quantity: c.quantity })) : [], existingId,
    };
  });
  return { rows, issues };
}

export async function previewListingSheet(buf: Buffer, filename: string): Promise<ListingImportPreview> {
  const { rows, issues } = await analyze(buf, filename);
  return {
    rows: rows.map(({ components: _c, existingId: _e, ...r }) => { void _c; void _e; return r; }), issues,
    totals: { rows: rows.length, create: rows.filter((r) => r.action === "criar").length, update: rows.filter((r) => r.action === "atualizar").length, unmatched: rows.filter((r) => !r.matched).length, dropped: issues.filter((i) => i.level === "erro").length },
  };
}

const money = z.string().optional().transform((v, ctx) => {
  const t = (v ?? "").trim().replace(/^R\$\s*/i, ""); if (!t) return 0;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) { ctx.addIssue({ code: "custom", message: "Valor inválido nos custos padrão." }); return z.NEVER; }
  return Math.round(n * 100);
});
const pct = z.string().optional().transform((v, ctx) => {
  const t = (v ?? "").trim().replace("%", "").replace(",", "."); if (!t) return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) { ctx.addIssue({ code: "custom", message: "Percentual inválido nos custos padrão (0 a 100)." }); return z.NEVER; }
  return Math.round(n * 100);
});
export const listingDefaultsSchema = z.object({ taxPct: z.string().optional().transform((v) => ((v ?? "").trim() ? v : "14,5")).pipe(pct), packaging: money, shipping: money, fixedFee: money, other: money, applyExisting: z.string().optional().transform((v) => v === "1") });

export async function commitListingSheet(actorId: string, buf: Buffer, filename: string, rawDefaults: unknown) {
  const d = listingDefaultsSchema.safeParse(rawDefaults);
  if (!d.success) throw new AppError("VALIDATION", d.error.issues[0]?.message ?? "Custos padrão inválidos.", 422);
  const def = d.data;
  const { rows } = await analyze(buf, filename);
  const costs = { taxBps: def.taxPct, packagingCents: def.packaging, shippingCostCents: def.shipping, fixedFeeCents: def.fixedFee, otherCostCents: def.other };
  let created = 0, updated = 0;
  const result = await db.$transaction(async (tx) => {
    for (const r of rows) {
      const base = { title: r.title, listingType: r.listingType, priceCents: r.priceCents, saleFeeBps: r.feeBps, sku: r.skus.length === 1 ? r.skus[0].sku : null };
      if (r.existingId) {
        await tx.mlListing.update({ where: { id: r.existingId }, data: { ...base, ...(def.applyExisting ? costs : {}) } });
        if (r.components.length) { // só troca os produtos quando todos os SKUs foram reconhecidos
          await tx.mlListingComponent.deleteMany({ where: { listingId: r.existingId } });
          await tx.mlListingComponent.createMany({ data: r.components.map((c) => ({ listingId: r.existingId!, ...c })) });
        }
        updated++;
      } else {
        await tx.mlListing.create({ data: { mlItemId: r.itemId, variation: r.variation, ...base, ...costs, status: "ATIVO", createdById: actorId, notes: `Importado da planilha de anúncios (${filename}).`, components: { create: r.components } } });
        created++;
      }
    }
    // vendas já importadas passam a reconhecer os anúncios novos (custo e estoque)
    const linked = await relinkItems(tx);
    const orderIds = (await tx.mlOrderItem.findMany({ where: { listingId: { not: null } }, select: { orderId: true }, distinct: ["orderId"] })).map((x) => x.orderId);
    const stock = await applyMlStock(tx, actorId, orderIds);
    await tx.auditLog.create({ data: { actorId, action: "mercadolivre.listings_import", entity: "MlListing", entityId: filename.slice(0, 100), after: { created, updated, unmatched: rows.filter((r) => !r.matched).length, defaults: def } } });
    return { linked, stock };
  }, { timeout: 120_000 });
  return { created, updated, unmatched: rows.filter((r) => !r.matched).length, relinked: result.linked, stockMoves: result.stock.moved, negative: result.stock.negative };
}
