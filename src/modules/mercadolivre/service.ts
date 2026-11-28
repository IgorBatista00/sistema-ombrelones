import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseMoney } from "@/modules/products/cost";
import { isIsoDay, brDate, spDay, dayDiff } from "@/modules/purchase-orders/rules";
import {
  SHIP_STAGE, ML_TAX_BPS, foreignOf, parsePrefixes, bpsFromPct, lineProfit, soldLineOf, listingUnitCost, matchListing, shipStage, simulateListing, stockAdjustments, stockRef, variantUnitCost, type ShipStage,
} from "./rules";

type Tx = Prisma.TransactionClient;
const STOCK_KEY = "ml-stock";
export const cancelledOf = (status: string) => status === "cancelled";

// ====================================================================== configuração da baixa de estoque
/** A baixa automática só vale para vendas a partir desta data (evita baixar de novo o histórico já refletido no estoque). */
export async function getMlStockFrom(tx: Tx | typeof db = db): Promise<string | null> {
  const s = await tx.setting.findUnique({ where: { key: STOCK_KEY } });
  const v = (s?.value as { from?: string } | null)?.from;
  return v && isIsoDay(v) ? v : null;
}
export async function setMlStockFrom(actorId: string, from: string | null) {
  if (from && !isIsoDay(from)) throw new AppError("VALIDATION", "Data inválida.", 422);
  await db.setting.upsert({ where: { key: STOCK_KEY }, update: { value: { from }, updatedBy: actorId }, create: { key: STOCK_KEY, value: { from }, updatedBy: actorId } });
  await db.auditLog.create({ data: { actorId, action: "mercadolivre.stock_from", entity: "Setting", entityId: STOCK_KEY, after: { from } } });
}

// ====================================================================== vendas de outra empresa
const OWN_KEY = "mlOwnSkuPrefixes";
/** Prefixos de SKU da empresa (vazio = todas as vendas são da empresa). */
export async function getOwnPrefixes(tx: Tx | typeof db = db): Promise<string[]> {
  const s = await tx.setting.findUnique({ where: { key: OWN_KEY } });
  const v = (s?.value as { prefixes?: unknown } | null)?.prefixes;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
/** Reclassifica vendas (da empresa / de outra empresa) pela regra atual e ajusta o estoque das que mudaram. */
async function reclassify(tx: Tx, actorId: string | null, where: Prisma.MlOrderItemWhereInput = {}) {
  const prefixes = await getOwnPrefixes(tx);
  const items = await tx.mlOrderItem.findMany({ where, select: { id: true, orderId: true, sku: true, foreign: true, foreignManual: true } });
  const changed = items.filter((i) => foreignOf(i.sku, i.foreignManual, prefixes) !== i.foreign);
  for (const i of changed) await tx.mlOrderItem.update({ where: { id: i.id }, data: { foreign: !i.foreign } });
  const orderIds = [...new Set(changed.map((i) => i.orderId))];
  for (const orderId of orderIds) {
    const its = await tx.mlOrderItem.findMany({ where: { orderId }, select: { foreign: true } });
    await tx.mlReceipt.updateMany({ where: { orderId }, data: { foreign: its.length > 0 && its.every((x) => x.foreign) } });
  }
  const stock = await applyMlStock(tx, actorId, orderIds);
  return { changed: changed.length, orders: orderIds.length, stock };
}
export async function setOwnPrefixes(actorId: string, text: string) {
  const prefixes = parsePrefixes(text);
  if (text.trim() && !prefixes.length) throw new AppError("VALIDATION", "Informe o início dos SKUs da empresa, ex.: PA50.", 422);
  return db.$transaction(async (tx) => {
    const before = await getOwnPrefixes(tx);
    await tx.setting.upsert({ where: { key: OWN_KEY }, update: { value: { prefixes }, updatedBy: actorId }, create: { key: OWN_KEY, value: { prefixes }, updatedBy: actorId } });
    const r = await reclassify(tx, actorId);
    await tx.auditLog.create({ data: { actorId, action: "mercadolivre.own_prefixes", entity: "Setting", entityId: OWN_KEY, before: { prefixes: before }, after: { prefixes, changed: r.changed } } });
    return { prefixes, ...r };
  }, { timeout: 120_000 });
}
/** Correção manual de uma venda: true = de outra empresa, false = da empresa, null = volta para a regra do SKU. */
export async function setSaleOwner(actorId: string, itemId: string, foreign: boolean | null) {
  return db.$transaction(async (tx) => {
    const it = await tx.mlOrderItem.findUnique({ where: { id: itemId }, select: { id: true, orderId: true, foreign: true, foreignManual: true } });
    if (!it) throw new AppError("NOT_FOUND", "Venda não encontrada.", 404);
    await tx.mlOrderItem.update({ where: { id: itemId }, data: { foreignManual: foreign } });
    const r = await reclassify(tx, actorId, { id: itemId });
    await tx.auditLog.create({ data: { actorId, action: "mercadolivre.sale_owner", entity: "MlOrderItem", entityId: itemId, before: { foreign: it.foreign, manual: it.foreignManual }, after: { manual: foreign, orderId: it.orderId } } });
    return r;
  });
}

// ====================================================================== custos dos produtos
async function unitCosts(tx: Tx | typeof db, variantIds: string[]) {
  if (!variantIds.length) return new Map<string, { cents: number | null; source: string | null; mto: boolean; sku: string; name: string }>();
  const vs = await tx.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, sku: true, availability: true, stock: { select: { avgCostCents: true, lastCostCents: true } }, product: { select: { name: true, costFinalCents: true } } },
  });
  return new Map(vs.map((v) => {
    const c = variantUnitCost({ avgCostCents: v.stock?.avgCostCents, lastCostCents: v.stock?.lastCostCents, productCostCents: v.product.costFinalCents });
    return [v.id, { ...c, mto: v.availability === "MADE_TO_ORDER", sku: v.sku, name: v.product.name }] as const;
  }));
}
async function listingCost(tx: Tx | typeof db, listingId: string) {
  const l = await tx.mlListing.findUnique({ where: { id: listingId }, include: { components: true } });
  if (!l) return null;
  const costs = await unitCosts(tx, l.components.map((c) => c.variantId));
  return listingUnitCost(l.components.map((c) => ({ quantity: c.quantity, unitCostCents: costs.get(c.variantId)?.cents ?? null })));
}

// ====================================================================== anúncios
const money = z.string().optional().transform((v) => (v && v.trim() ? parseMoney(v) ?? -1 : null));
const pctField = z.union([z.string(), z.number()]).optional().transform((v) => bpsFromPct(v));
export const listingSchema = z.object({
  mlItemId: z.string().trim().toUpperCase().max(30).optional().transform((v) => v || null).refine((v) => v == null || /^[A-Z]{3}\d{5,15}$/.test(v), "Nº do anúncio inválido (ex.: MLB1234567890)."),
  variation: z.string().trim().max(120).default(""),
  sku: z.string().trim().max(60).optional().transform((v) => v || null),
  title: z.string().trim().min(2, "Informe o título do anúncio.").max(200),
  listingType: z.enum(["classico", "premium", ""]).optional().transform((v) => v || null),
  status: z.enum(["ATIVO", "PAUSADO", "ENCERRADO"]).default("ATIVO"),
  price: money, fixedFee: money, shippingCost: money, packaging: money, otherCost: money,
  saleFeePct: pctField, taxPct: pctField,
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
  components: z.array(z.object({ variantId: z.string().min(1), quantity: z.coerce.number().int().min(1, "Quantidade mínima 1.").max(999) })).max(20),
});

/** Cria/edita um anúncio e já liga as vendas importadas que batem com ele. */
export async function saveListing(actorId: string, id: string | null, raw: unknown) {
  const p = listingSchema.safeParse(raw);
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const f = p.data;
  if (!f.mlItemId && !f.sku) throw new AppError("VALIDATION", "Informe o nº do anúncio (MLB) ou o SKU usado no Mercado Livre.", 422);
  for (const [k, label] of [["price", "Preço"], ["fixedFee", "Tarifa fixa"], ["shippingCost", "Frete"], ["packaging", "Embalagem"], ["otherCost", "Outros custos"]] as const) if (f[k] === -1 || (f[k] ?? 0) < 0) throw new AppError("VALIDATION", `${label}: valor inválido.`, 422);
  if (Number.isNaN(f.saleFeePct) || Number.isNaN(f.taxPct)) throw new AppError("VALIDATION", "Percentual inválido (use de 0 a 100).", 422);
  if (new Set(f.components.map((c) => c.variantId)).size !== f.components.length) throw new AppError("VALIDATION", "O mesmo produto aparece duas vezes — some as quantidades numa linha só.", 422);
  const data = {
    mlItemId: f.mlItemId, variation: f.variation, sku: f.sku, title: f.title, listingType: f.listingType, status: f.status, priceCents: f.price,
    saleFeeBps: f.saleFeePct, fixedFeeCents: f.fixedFee, shippingCostCents: f.shippingCost, packagingCents: f.packaging, taxBps: f.taxPct ?? ML_TAX_BPS, otherCostCents: f.otherCost, notes: f.notes,
  };
  try {
    return await db.$transaction(async (tx) => {
      const exists = f.components.length ? await tx.productVariant.count({ where: { id: { in: f.components.map((c) => c.variantId) } } }) : 0;
      if (exists !== f.components.length) throw new AppError("VALIDATION", "Um dos produtos escolhidos não existe mais. Atualize a página.", 422);
      // produtos do anúncio mudaram: o custo guardado nas vendas dele estava errado → recalcula com os produtos novos
      if (id) {
        const before = await tx.mlListingComponent.findMany({ where: { listingId: id }, select: { variantId: true, quantity: true } });
        const key = (xs: { variantId: string; quantity: number }[]) => xs.map((c) => `${c.variantId}×${c.quantity}`).sort().join(",");
        if (key(before) !== key(f.components)) await tx.mlOrderItem.updateMany({ where: { listingId: id }, data: { costCents: null } });
      }
      const l = id
        ? await tx.mlListing.update({ where: { id }, data })
        : await tx.mlListing.create({ data: { ...data, createdById: actorId } });
      await tx.mlListingComponent.deleteMany({ where: { listingId: l.id } });
      if (f.components.length) await tx.mlListingComponent.createMany({ data: f.components.map((c) => ({ listingId: l.id, variantId: c.variantId, quantity: c.quantity })) });
      const linked = await relinkItems(tx);
      await tx.auditLog.create({ data: { actorId, action: id ? "mercadolivre.listing_update" : "mercadolivre.listing_create", entity: "MlListing", entityId: l.id, after: { ...data, components: f.components } as unknown as Prisma.InputJsonValue } });
      return { id: l.id, linked };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("DUPLICATE", "Já existe um anúncio cadastrado com este nº (MLB) e esta variação.", 409);
    throw e;
  }
}

export async function deleteListing(actorId: string, id: string) {
  const sold = await db.mlOrderItem.count({ where: { listingId: id } });
  await db.$transaction(async (tx) => {
    await tx.mlOrderItem.updateMany({ where: { listingId: id }, data: { listingId: null } });
    await tx.mlListing.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorId, action: "mercadolivre.listing_delete", entity: "MlListing", entityId: id, after: { soldItemsUnlinked: sold } } });
  });
  return { unlinked: sold };
}

/**
 * Liga as vendas aos anúncios (MLB + variação → MLB → SKU) e guarda o custo dos produtos na venda
 * quando ainda não havia (o custo fica "congelado" para o lucro não mudar com compras futuras).
 */
export async function relinkItems(tx: Tx, orderIds?: string[]) {
  const listings = await tx.mlListing.findMany({ select: { id: true, mlItemId: true, variation: true, sku: true } });
  const items = await tx.mlOrderItem.findMany({ where: orderIds ? { orderId: { in: orderIds } } : {}, select: { id: true, itemId: true, variation: true, sku: true, listingId: true, costCents: true, quantity: true } });
  const costCache = new Map<string, Awaited<ReturnType<typeof listingCost>>>();
  let changed = 0;
  for (const it of items) {
    const lid = matchListing(listings, { itemId: it.itemId, variation: it.variation, sku: it.sku });
    let cost = it.costCents;
    if (lid && (cost == null || lid !== it.listingId)) {
      if (!costCache.has(lid)) costCache.set(lid, await listingCost(tx, lid));
      const c = costCache.get(lid);
      cost = c?.cents != null && !c.missing ? c.cents * it.quantity : null;
    }
    if (!lid) cost = null;
    if (lid !== it.listingId || cost !== it.costCents) { await tx.mlOrderItem.update({ where: { id: it.id }, data: { listingId: lid, costCents: cost } }); changed++; }
  }
  return changed;
}

// ====================================================================== estoque
/**
 * Acerta o estoque das vendas indicadas: saída pelos produtos do anúncio (× unidades) e volta em caso de cancelamento.
 * Idempotente: compara com as movimentações já feitas para a venda (referência ML:<nº>). Produtos sob encomenda não têm saldo.
 * Só vendas a partir da data configurada; o saldo pode ficar negativo (a venda já aconteceu) — a tela avisa.
 */
export async function applyMlStock(tx: Tx, actorId: string | null, orderIds: string[]) {
  const from = await getMlStockFrom(tx);
  if (!from || !orderIds.length) return { moved: 0, negative: [] as string[] };
  const items = await tx.mlOrderItem.findMany({ where: { orderId: { in: orderIds } }, include: { listing: { include: { components: true } } } });
  const byOrder = new Map<string, typeof items>();
  for (const it of items) byOrder.set(it.orderId, [...(byOrder.get(it.orderId) ?? []), it]);
  const allVariants = [...new Set(items.flatMap((i) => i.listing?.components.map((c) => c.variantId) ?? []))];
  const info = await unitCosts(tx, allVariants);
  let moved = 0; const negative: string[] = [];
  for (const [orderId, its] of byOrder) {
    if (spDay(its[0].saleDate) < from) continue;
    const desired = new Map<string, number>();
    for (const it of its) {
      if (cancelledOf(it.orderStatus) || it.foreign || !it.listing) continue;
      for (const c of it.listing.components) if (!info.get(c.variantId)?.mto) desired.set(c.variantId, (desired.get(c.variantId) ?? 0) + c.quantity * it.quantity);
    }
    const prev = await tx.stockMovement.groupBy({ by: ["variantId"], where: { reference: stockRef(orderId) }, _sum: { delta: true } });
    const already = new Map(prev.map((p) => [p.variantId, -(p._sum.delta ?? 0)]));
    for (const adj of stockAdjustments(desired, already)) {
      await tx.stockLevel.upsert({ where: { variantId: adj.variantId }, update: {}, create: { variantId: adj.variantId } });
      const [row] = await tx.$queryRaw<{ onHand: number; avgCostCents: number | null }[]>`UPDATE "StockLevel" SET "onHand" = "onHand" + ${adj.delta}, "version" = "version" + 1, "updatedAt" = now() WHERE "variantId" = ${adj.variantId} RETURNING "onHand", "avgCostCents"`;
      await tx.stockMovement.create({ data: {
        variantId: adj.variantId, type: "VENDA", delta: adj.delta, balanceAfter: row?.onHand ?? null, unitCostCents: row?.avgCostCents ?? null,
        reason: adj.delta < 0 ? `Venda Mercado Livre ${orderId}` : `Cancelamento Mercado Livre ${orderId}`, reference: stockRef(orderId), actorId,
      } });
      moved++;
      if ((row?.onHand ?? 0) < 0) negative.push(info.get(adj.variantId)?.sku ?? adj.variantId);
    }
  }
  return { moved, negative: [...new Set(negative)] };
}

/** Botão "Dar baixa nas vendas pendentes": reaplica para todas as vendas desde a data configurada. */
export async function applyPendingStock(actorId: string) {
  const from = await getMlStockFrom();
  if (!from) throw new AppError("VALIDATION", "Defina antes a data de início da baixa automática (aba Anúncios).", 422);
  const ids = (await db.mlOrderItem.findMany({ where: { saleDate: { gte: brDate(from) }, listingId: { not: null }, foreign: false }, select: { orderId: true }, distinct: ["orderId"] })).map((x) => x.orderId);
  const r = await db.$transaction((tx) => applyMlStock(tx, actorId, ids), { timeout: 120_000 });
  await db.auditLog.create({ data: { actorId, action: "mercadolivre.stock_apply", entity: "MlOrderItem", entityId: "pendentes", after: { orders: ids.length, moved: r.moved } } });
  return { orders: ids.length, ...r };
}

/** "Recalcular custos": liga vendas a anúncios novos e grava o custo nas vendas que estavam sem (produto que ganhou custo depois). */
export async function recalcSaleCosts(actorId: string) {
  const before = await db.mlOrderItem.count({ where: { costCents: null, orderStatus: { not: "cancelled" }, foreign: false } });
  const changed = await db.$transaction((tx) => relinkItems(tx), { timeout: 120_000 });
  const after = await db.mlOrderItem.count({ where: { costCents: null, orderStatus: { not: "cancelled" }, foreign: false } });
  await db.auditLog.create({ data: { actorId, action: "mercadolivre.recalc_costs", entity: "MlOrderItem", entityId: "todas", after: { changed, semCustoAntes: before, semCustoDepois: after } } });
  return { changed, fixed: Math.max(0, before - after), left: after };
}

// ====================================================================== expedição
export async function markShipped(actorId: string, orderIds: string[], shipped: boolean) {
  const ids = [...new Set(orderIds)].slice(0, 500);
  if (!ids.length) throw new AppError("VALIDATION", "Selecione ao menos uma venda.", 422);
  await db.$transaction(async (tx) => {
    for (const orderId of ids) await tx.mlOrderControl.upsert({ where: { orderId }, update: { shippedAt: shipped ? new Date() : null, shippedById: shipped ? actorId : null }, create: { orderId, shippedAt: shipped ? new Date() : null, shippedById: shipped ? actorId : null } });
    await tx.auditLog.create({ data: { actorId, action: shipped ? "mercadolivre.shipped" : "mercadolivre.unshipped", entity: "MlOrderControl", entityId: ids.slice(0, 20).join(","), after: { orders: ids.length } } });
  });
  return { count: ids.length };
}

// ====================================================================== consultas
export const mlFilterSchema = z.object({
  aba: z.preprocess((v) => (v === "qualidade" ? "validacao" : v), z.enum(["painel", "vendas", "enviar", "anuncios", "produtos", "validacao", "lucro"]).optional()).catch(undefined),
  produto: z.string().max(40).optional().catch(undefined), // anúncios de um produto (variantId) ou "sem" (sem produto ligado)
  tipo: z.enum(["classico", "premium", ""]).optional().catch(undefined),
  sev: z.enum(["critico", "aviso", "ok", "canceladas", "outras", ""]).optional().catch(undefined), // validação das vendas
  problema: z.string().max(30).optional().catch(undefined),
  de: z.string().optional().refine((v) => !v || isIsoDay(v)).catch(undefined),
  ate: z.string().optional().refine((v) => !v || isIsoDay(v)).catch(undefined),
  envio: z.enum(["a_enviar", "enviada", "entregue", "problema", "cancelada", "outra", ""]).optional().catch(undefined),
  anuncio: z.string().max(40).optional(),
  q: z.string().max(80).optional(),
  vinculo: z.enum(["sem", "com", ""]).optional().catch(undefined),
});
export type MlFilter = z.infer<typeof mlFilterSchema>;

const monthStart = () => { const t = spDay(new Date()); return `${t.slice(0, 8)}01`; };
export const mlPeriod = (f: MlFilter) => ({ de: f.de ?? monthStart(), ate: f.ate ?? spDay(new Date()) });
export const range = (de: string, ate: string) => ({ gte: new Date(`${de}T00:00:00-03:00`), lt: new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 86_400_000) });

export async function ordersIn(where: Prisma.MlOrderItemWhereInput) {
  const items = await db.mlOrderItem.findMany({
    where: { AND: [where, { foreign: false }] }, // vendas de outra empresa ficam fora de todos os números orderBy: [{ saleDate: "desc" }, { orderId: "asc" }, { position: "asc" }], take: 20000,
    include: { listing: { select: { id: true, title: true, mlItemId: true, variation: true, saleFeeBps: true, fixedFeeCents: true, shippingCostCents: true, packagingCents: true, taxBps: true, otherCostCents: true, components: { select: { variantId: true, quantity: true } } } } },
  });
  const orderIds = [...new Set(items.map((i) => i.orderId))];
  const [controls, receipts, moves] = await Promise.all([
    db.mlOrderControl.findMany({ where: { orderId: { in: orderIds } } }),
    db.mlReceipt.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, buyerNickname: true } }),
    db.stockMovement.groupBy({ by: ["reference"], where: { reference: { in: orderIds.map(stockRef) } }, _count: true }),
  ]);
  const ctrl = new Map(controls.map((c) => [c.orderId, c]));
  const buyer = new Map(receipts.map((r) => [r.orderId, r.buyerNickname]));
  const stocked = new Set(moves.map((m) => m.reference!.slice(3)));
  const byOrder = new Map<string, typeof items>();
  for (const it of items) byOrder.set(it.orderId, [...(byOrder.get(it.orderId) ?? []), it]);
  return [...byOrder.entries()].map(([orderId, its]) => {
    const cancelled = its.every((i) => cancelledOf(i.orderStatus));
    const lines = its.map((i) => {
      const unitCost = i.costCents != null ? i.costCents / i.quantity : null;
      const p = lineProfit(soldLineOf(i, cancelledOf(i.orderStatus)), i.listing, unitCost);
      const productCents = cancelledOf(i.orderStatus) ? 0 : i.productCents ?? i.unitPriceCents * i.quantity;
      return { id: i.id, itemId: i.itemId, title: i.title, variation: i.variation, sku: i.sku, quantity: i.quantity, listingId: i.listingId, listingTitle: i.listing?.title ?? null, mto: false, ...p, productCents };
    });
    const sum = (k: "revenue" | "fees" | "shipping" | "cost" | "extras" | "tax" | "profit") => lines.reduce((a, l) => a + l[k], 0);
    const c = ctrl.get(orderId);
    const stage: ShipStage = shipStage(its[0].statusText, cancelled, c?.shippedAt);
    const product = its.reduce((a, i) => a + (i.productCents ?? i.unitPriceCents * i.quantity), 0);
    const linked = lines.every((l) => l.listingId);
    return {
      orderId, saleDate: its[0].saleDate, buyer: buyer.get(orderId) ?? null, statusText: its[0].statusText ?? its[0].orderStatus, cancelled, stage, stageLabel: SHIP_STAGE[stage].label, stageTone: SHIP_STAGE[stage].tone,
      shippedAt: c?.shippedAt ?? null, shipBy: its.find((i) => i.shipBy)?.shipBy ?? null, lines, units: its.reduce((a, i) => a + i.quantity, 0), product,
      revenue: sum("revenue"), fees: sum("fees"), shipping: sum("shipping"), cost: sum("cost"), extras: sum("extras") + sum("tax"), profit: sum("profit"),
      marginBps: product > 0 && !cancelled ? Math.round((sum("profit") / product) * 10_000) : null,
      estimated: lines.some((l) => l.feesEstimated), costMissing: !cancelled && lines.some((l) => l.costMissing), linked, stocked: stocked.has(orderId),
    };
  });
}
export type MlOrderRow = Awaited<ReturnType<typeof ordersIn>>[number];

export async function mlSalesView(f: MlFilter) {
  const { de, ate } = mlPeriod(f);
  const where: Prisma.MlOrderItemWhereInput = { saleDate: range(de, ate) };
  if (f.anuncio) where.listingId = f.anuncio === "sem" ? null : f.anuncio;
  let rows = await ordersIn(where);
  if (f.envio) rows = rows.filter((r) => r.stage === f.envio);
  if (f.vinculo === "sem") rows = rows.filter((r) => !r.linked);
  if (f.vinculo === "com") rows = rows.filter((r) => r.linked);
  const q = (f.q ?? "").trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.orderId, r.buyer, ...r.lines.map((l) => `${l.title} ${l.itemId} ${l.sku ?? ""}`)].join(" ").toLowerCase().includes(q));
  const active = rows.filter((r) => !r.cancelled);
  const tot = (k: "product" | "fees" | "shipping" | "cost" | "extras" | "profit" | "units") => active.reduce((a, r) => a + r[k], 0);
  const stockFrom = await getMlStockFrom();
  const pendingStock = stockFrom ? active.filter((r) => r.linked && !r.stocked && spDay(r.saleDate) >= stockFrom).length : 0;
  return {
    de, ate, rows, stockFrom, pendingStock,
    summary: { orders: active.length, cancelled: rows.length - active.length, units: tot("units"), product: tot("product"), fees: tot("fees") + tot("shipping"), cost: tot("cost"), extras: tot("extras"), profit: tot("profit"),
      marginBps: tot("product") > 0 ? Math.round((tot("profit") / tot("product")) * 10_000) : null, unlinked: active.filter((r) => !r.linked).length, costMissing: active.filter((r) => r.costMissing).length, estimated: active.filter((r) => r.estimated).length,
      toShip: rows.filter((r) => r.stage === "a_enviar").length, problems: rows.filter((r) => r.stage === "problema").length },
  };
}

/** Fila de expedição: vendas "a enviar" ainda não despachadas (mais antigas primeiro), com os produtos a separar. */
export async function mlShippingQueue(now = new Date()) {
  const since = new Date(now.getTime() - 60 * 86_400_000);
  const rows = (await ordersIn({ saleDate: { gte: since } })).filter((r) => r.stage === "a_enviar").sort((a, b) => (a.shipBy?.getTime() ?? a.saleDate.getTime()) - (b.shipBy?.getTime() ?? b.saleDate.getTime()));
  const listingIds = [...new Set(rows.flatMap((r) => r.lines.map((l) => l.listingId).filter(Boolean) as string[]))];
  const comps = await db.mlListingComponent.findMany({ where: { listingId: { in: listingIds } }, include: { variant: { select: { sku: true, product: { select: { name: true } } } } } });
  return rows.map((r) => ({
    ...r,
    ageDays: dayDiff(r.saleDate, now),
    late: r.shipBy ? dayDiff(now, r.shipBy) < 0 : false,
    dueToday: r.shipBy ? dayDiff(now, r.shipBy) === 0 : false,
    pick: r.lines.flatMap((l) => (l.listingId ? comps.filter((c) => c.listingId === l.listingId).map((c) => ({ sku: c.variant.sku, name: c.variant.product.name, quantity: c.quantity * l.quantity })) : [{ sku: l.sku ?? l.itemId, name: `${l.title} (anúncio sem produtos vinculados)`, quantity: l.quantity }])),
  }));
}

const IMG = { orderBy: { position: "asc" as const }, take: 8, select: { url: true, variantId: true } };
/** Foto do produto da variação: a da própria variação, senão a primeira do produto. */
const pickImage = (images: { url: string; variantId: string | null }[], variantId: string) => images.find((i) => i.variantId === variantId)?.url ?? images[0]?.url ?? null;

export async function mlListingsView(f: MlFilter) {
  const { de, ate } = mlPeriod(f);
  const t = f.q?.trim();
  const where: Prisma.MlListingWhereInput = {
    ...(f.tipo ? { listingType: f.tipo } : {}),
    ...(f.produto === "sem" ? { components: { none: {} } } : f.produto ? { components: { some: { variantId: f.produto } } } : {}),
    ...(t ? { OR: [{ title: { contains: t, mode: "insensitive" } }, { mlItemId: { contains: t, mode: "insensitive" } }, { sku: { contains: t, mode: "insensitive" } }, { components: { some: { variant: { OR: [{ sku: { contains: t, mode: "insensitive" } }, { product: { name: { contains: t, mode: "insensitive" } } }, { product: { code: { contains: t, mode: "insensitive" } } }] } } } }] } : {}),
  };
  const listings = await db.mlListing.findMany({ where, orderBy: [{ status: "asc" }, { title: "asc" }], include: { components: { include: { variant: { select: { id: true, sku: true, product: { select: { name: true, code: true, images: IMG } } } } } } } });
  const costs = await unitCosts(db, [...new Set(listings.flatMap((l) => l.components.map((c) => c.variantId)))]);
  const sold = await db.mlOrderItem.groupBy({ by: ["listingId"], where: { saleDate: range(de, ate), orderStatus: { not: "cancelled" }, listingId: { not: null }, foreign: false }, _sum: { quantity: true } });
  const soldMap = new Map(sold.map((s) => [s.listingId!, s._sum.quantity ?? 0]));
  const unlinkedRaw = await db.mlOrderItem.groupBy({ by: ["itemId", "variation", "title", "sku"], where: { listingId: null, foreign: false }, _sum: { quantity: true }, _max: { saleDate: true, unitPriceCents: true } });
  const unlinked = unlinkedRaw.map((u) => ({ itemId: u.itemId, variation: u.variation ?? "", title: u.title, sku: u.sku, units: u._sum.quantity ?? 0, lastSale: u._max.saleDate, lastPriceCents: u._max.unitPriceCents })).sort((a, b) => b.units - a.units);
  return {
    de, ate, stockFrom: await getMlStockFrom(), unlinked,
    listings: listings.map((l) => {
      const comp = l.components.map((c) => ({ variantId: c.variantId, sku: c.variant.sku, code: c.variant.product.code, name: c.variant.product.name, image: pickImage(c.variant.product.images, c.variantId), quantity: c.quantity, unitCostCents: costs.get(c.variantId)?.cents ?? null, costSource: costs.get(c.variantId)?.source ?? null, mto: costs.get(c.variantId)?.mto ?? false }));
      const uc = listingUnitCost(comp);
      const sim = l.priceCents != null ? simulateListing(l.priceCents, l, uc.missing ? null : uc.cents) : null;
      return { ...l, components: comp, unitCostCents: uc.cents, costMissing: uc.missing, simulation: sim, soldUnits: soldMap.get(l.id) ?? 0 };
    }),
  };
}

/** Anúncios agrupados pelo produto (SKU) ligado: quantos anúncios cada produto tem, sozinho ou em kit, por tipo. */
export async function mlListingsByProduct(f: MlFilter) {
  const v = await mlListingsView({ ...f, produto: undefined, tipo: undefined });
  type G = { variantId: string; sku: string; code: string | null; name: string; image: string | null; total: number; alone: number; inKit: number; classico: number; premium: number; active: number; minPrice: number | null; maxPrice: number | null; profitSum: number; profitN: number; soldUnits: number };
  const groups = new Map<string, G>();
  let noProduct = 0;
  for (const l of v.listings) {
    if (!l.components.length) { noProduct++; continue; }
    const kit = l.components.length > 1 || l.components.some((c) => c.quantity > 1);
    for (const c of l.components) {
      const g = groups.get(c.variantId) ?? { variantId: c.variantId, sku: c.sku, code: c.code, name: c.name, image: c.image, total: 0, alone: 0, inKit: 0, classico: 0, premium: 0, active: 0, minPrice: null, maxPrice: null, profitSum: 0, profitN: 0, soldUnits: 0 };
      g.total++; if (kit) g.inKit++; else g.alone++;
      if (l.listingType === "classico") g.classico++; else if (l.listingType === "premium") g.premium++;
      if (l.status === "ATIVO") g.active++;
      if (!kit && l.priceCents != null) { g.minPrice = g.minPrice == null ? l.priceCents : Math.min(g.minPrice, l.priceCents); g.maxPrice = g.maxPrice == null ? l.priceCents : Math.max(g.maxPrice, l.priceCents); }
      if (!kit && l.simulation && !l.simulation.costMissing) { g.profitSum += l.simulation.profit; g.profitN++; }
      g.soldUnits += l.soldUnits * c.quantity;
      groups.set(c.variantId, g);
    }
  }
  const list = [...groups.values()].map((g) => ({ ...g, avgProfit: g.profitN ? Math.round(g.profitSum / g.profitN) : null })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
  return { de: v.de, ate: v.ate, list, noProduct, listings: v.listings.length };
}

export async function mlProfitByListing(f: MlFilter) {
  const { de, ate } = mlPeriod(f);
  const rows = await ordersIn({ saleDate: range(de, ate) });
  const map = new Map<string, { listingId: string | null; title: string; units: number; orders: number; product: number; fees: number; cost: number; extras: number; profit: number; estimated: boolean; costMissing: boolean }>();
  for (const r of rows) {
    if (r.cancelled) continue;
    for (const l of r.lines) {
      const key = l.listingId ?? `sem:${l.itemId}`;
      const m = map.get(key) ?? { listingId: l.listingId, title: l.listingTitle ?? `${l.title} (sem cadastro)`, units: 0, orders: 0, product: 0, fees: 0, cost: 0, extras: 0, profit: 0, estimated: false, costMissing: false };
      m.units += l.quantity; m.orders++; m.product += l.productCents; m.fees += l.fees + l.shipping; m.cost += l.cost; m.extras += l.extras + l.tax; m.profit += l.profit;
      m.estimated ||= l.feesEstimated; m.costMissing ||= l.costMissing;
      map.set(key, m);
    }
  }
  const list = [...map.values()].map((m) => ({ ...m, marginBps: m.product > 0 ? Math.round((m.profit / m.product) * 10_000) : null, unitProfit: m.units ? Math.round(m.profit / m.units) : 0 })).sort((a, b) => b.profit - a.profit);
  return { de, ate, list };
}

/** Para o "Meu dia": vendas a despachar (atrasadas / prazo hoje / total). */
export async function mlShippingSummary(now = new Date()) {
  const q = await mlShippingQueue(now);
  return { total: q.length, late: q.filter((r) => r.late).length, today: q.filter((r) => r.dueToday).length, oldest: q[0] ?? null };
}

/** Dados para o formulário de anúncio: produtos do cadastro (com custo). */
export async function listingFormOptions() {
  const vs = await db.productVariant.findMany({ where: { product: { deletedAt: null } }, orderBy: { sku: "asc" }, select: { id: true, sku: true, availability: true, stock: { select: { avgCostCents: true, lastCostCents: true } }, product: { select: { name: true, costFinalCents: true } } } });
  return vs.map((v) => ({ id: v.id, sku: v.sku, name: v.product.name, unitCostCents: variantUnitCost({ avgCostCents: v.stock?.avgCostCents, lastCostCents: v.stock?.lastCostCents, productCostCents: v.product.costFinalCents }).cents, mto: v.availability === "MADE_TO_ORDER" }));
}
