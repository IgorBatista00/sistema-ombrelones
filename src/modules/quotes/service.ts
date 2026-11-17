import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getUnitPrices } from "@/modules/pricing";
import { computeAvailability, availabilityLabel } from "@/modules/inventory/availability";
import { cubicMeters } from "@/modules/products/cost";
import { installmentError, installmentPlan, quoteTotals, validUntil } from "./totals";
const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
import { dayRange, planMove, stageOf, type Stage } from "./funnel";
import { cancelSaleForQuote, syncSaleFromQuote } from "@/modules/finance/sales";
import { cancelDeliveryForQuote, syncDeliveryFromQuote } from "@/modules/deliveries/service";
import { docCode, nextDocNumber, parseDocNumber } from "@/lib/doc-code";
import { clientToQuoteFields } from "@/modules/clients/service";

const money = z.union([z.string(), z.number()]).transform((v) => {
  if (typeof v === "number") return Math.round(v * 100);
  const s = v.trim().replace(/[R$\s]/g, ""); if (!s) return 0;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}).refine((v) => Number.isFinite(v) && v >= 0, "Valor inválido");
const txt = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const str = (max: number) => z.string().trim().max(max).default("");

export const CLIENT_FIELDS = ["name", "cpf", "cnpj", "ie", "address", "city", "cep", "contact", "mobile", "email", "site", "birthday", "delivery"] as const;
export const COMMERCIAL_FIELDS = ["professional", "seller", "manager", "mobile", "email"] as const;

export const quoteSchema = z.object({
  id: z.string().optional().nullable(),
  companyId: z.string().optional().nullable().transform((v) => v || null),
  category: z.string().trim().max(60).optional().nullable().transform((v) => v || null), // categoria interna do pedido
  clientId: z.string().optional().nullable().transform((v) => v || null), // cliente do cadastro comercial
  client: z.object(Object.fromEntries(CLIENT_FIELDS.map((k) => [k, str(200)])) as Record<(typeof CLIENT_FIELDS)[number], ReturnType<typeof str>>)
    .refine((c) => c.name, "Informe o cliente."),
  commercial: z.object(Object.fromEntries(COMMERCIAL_FIELDS.map((k) => [k, str(160)])) as Record<(typeof COMMERCIAL_FIELDS)[number], ReturnType<typeof str>>),
  issuedAt: z.coerce.date(),
  validDays: z.coerce.number().int().min(1).max(365).default(15),
  deliveryDays: z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === "" || v == null ? null : Math.round(Number(v))))
    .refine((v) => v == null || (Number.isInteger(v) && v >= 0 && v <= 999), "Prazo de entrega inválido"),
  paymentTerms: z.string().trim().min(1, "Informe a forma de pagamento").max(120),
  installmentPlan: txt(200),
  installmentValues: z.array(z.union([z.number().int().min(0).max(10_000_000_000), z.null()])).max(60).optional().nullable(), // centavos por parcela (null = automático)
  notes: txt(2000), // informações adicionais
  freightTerm: z.enum(["COTAR", "CIF", "FOB"]),
  freight: money.default(0),
  extraDiscount: money.default(0),
  items: z.array(z.object({
    id: z.string().optional().nullable(),
    variantId: z.string().min(1, "Selecione o produto de todos os itens"),
    imageUrl: z.string().max(500).optional().nullable().refine((u) => !u || u.startsWith("/api/media/") || u.startsWith("https://"), "Imagem inválida"),
    name: z.string().trim().min(1).max(200),
    fabricLine: txt(60), paint: txt(60), measures: txt(80), finish: txt(160), cordage: txt(160), itemNotes: txt(2000),
    quantity: z.coerce.number().int().min(1, "Quantidade mínima 1").max(100_000),
    unitPrice: money,
    unitDiscount: money.default(0),
  }).refine((i) => i.unitDiscount <= i.unitPrice, "O desconto unitário não pode ser maior que o valor unitário.")).min(1, "Adicione ao menos um produto.").max(200),
});

/** Produtos para o orçamento: tudo vem do cadastro (nome, medidas, acabamento, observações, fotos, peso, cubagem, preço). */
export async function quoteProductOptions() {
  const variants = await db.productVariant.findMany({
    where: { isActive: true, product: { deletedAt: null } },
    include: { stock: true, packages: true, product: { select: { name: true, code: true, color: true, description: true, measureUnit: true, heightMm: true, diameterMm: true, lengthMm: true, depthMm: true, weightG: true, frameMaterial: true, costFinalCents: true, images: { orderBy: { position: "asc" }, select: { url: true } }, packages: true } } },
    orderBy: { sku: "asc" },
  });
  const prices = await getUnitPrices(variants.map((v) => v.id));
  return variants.map((v) => {
    const p = v.product, cm = (mm: number | null) => (mm == null ? null : Math.round(mm / 10));
    const L = cm(p.lengthMm) ?? cm(p.diameterMm), P = cm(p.depthMm) ?? cm(p.diameterMm), A = cm(p.heightMm);
    const pk = v.packages.length ? v.packages : p.packages;
    const pkgWeight = pk.reduce((a, k) => a + (k.weightG ?? 0) * k.quantity, 0);
    const a = computeAvailability(v.availability, v.stock, v.leadTimeDays);
    return {
      variantId: v.id, code: v.sku, name: (p.name + (v.name && v.name !== p.color && v.name !== v.color ? ` — ${v.name}` : "")).toUpperCase(),
      images: p.images.map((i) => i.url), measures: [L != null && `L ${L}`, P != null && `P ${P}`, A != null && `A ${A}`].filter(Boolean).join(" × ") || null,
      finish: [p.frameMaterial, v.color ?? p.color].filter(Boolean).join(" · ") || null, notes: p.description,
      priceCents: prices.get(v.id) ?? null, stockText: availabilityLabel(a),
      weightG: p.weightG ?? (pkgWeight || null), cubageM3: cubicMeters(pk) || null,
      unitCostCents: v.stock?.avgCostCents ?? p.costFinalCents,
    };
  });
}
export type QuoteProductOption = Awaited<ReturnType<typeof quoteProductOptions>>[number];

export async function saveQuote(actorId: string, raw: unknown, generate: boolean) {
  const r = quoteSchema.safeParse(raw);
  if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const q = r.data;
  const existing = q.id ? await db.quote.findUnique({ where: { id: q.id } }) : null;
  if (q.id && !existing) throw new AppError("NOT_FOUND", "Orçamento não encontrado.", 404);

  const opts = await quoteProductOptions();
  const items = q.items.map((it, position) => {
    const o = opts.find((x) => x.variantId === it.variantId);
    if (!o) throw new AppError("VALIDATION", "Produto do orçamento não encontrado ou inativo.", 422);
    return {
      variantId: it.variantId, position, code: o.code, name: it.name, color: null, specs: null, imageUrl: it.imageUrl || o.images[0] || null, delivery: null,
      fabricLine: it.fabricLine, paint: it.paint, measures: it.measures, finish: it.finish, cordage: it.cordage, itemNotes: it.itemNotes,
      quantity: it.quantity, unitPriceCents: it.unitPrice, unitDiscountCents: it.unitDiscount, discountBps: 0,
      unitCostCents: o.unitCostCents, weightG: o.weightG, cubageM3: o.cubageM3,
    };
  });
  // cliente do cadastro removido nesse meio-tempo → orçamento fica como avulso (os dados do cliente continuam no orçamento)
  const clientId = q.clientId && (await db.client.findUnique({ where: { id: q.clientId }, select: { id: true } })) ? q.clientId : null;
  const t = quoteTotals(items, { extraDiscountCents: q.extraDiscount, freightTerm: q.freightTerm, freightCents: q.freight });
  const status = generate && (!existing || existing.status === "RASCUNHO") ? "EMITIDO" : existing?.status ?? "RASCUNHO";
  // valores por parcela: as datas seguem o texto do parcelamento; só guardamos os valores fixados
  const nParts = String(q.installmentPlan ?? "").split("/").map((x) => x.trim()).filter(Boolean).length;
  const fixedValues = (q.installmentValues ?? []).slice(0, nParts);
  const installmentValues = fixedValues.some((v) => v != null) ? fixedValues : null;
  const ip = installmentPlan(t.total, q.installmentPlan, q.issuedAt, installmentValues);
  if (status !== "RASCUNHO" && ip.diffCents !== 0) throw new AppError("VALIDATION", installmentError(ip.diffCents)!, 422);
  const data = {
    companyId: q.companyId, clientId, category: q.category, clientSnapshot: q.client as Prisma.InputJsonValue, commercialSnapshot: q.commercial as Prisma.InputJsonValue,
    issuedAt: q.issuedAt, validDays: q.validDays, deliveryDays: q.deliveryDays,
    paymentTerms: q.paymentTerms, installmentPlan: q.installmentPlan, installmentValues: installmentValues ?? Prisma.DbNull, notes: q.notes, deliveryNote: null, seller: q.commercial.seller || null,
    freightTerm: q.freightTerm, freightCents: q.freightTerm === "CIF" ? q.freight : 0, extraDiscountCents: t.extraDiscount, globalDiscountBps: 0, status,
    subtotalCents: t.subtotal, discountCents: t.discount, totalCents: t.total, costCents: t.cost,
  } as const;
  const rows = t.rows.map((row, i) => { const { weightG, cubageM3, ...rest } = items[i]; return { ...rest, weightG: weightG ?? null, cubageM3: cubageM3 ?? null, totalCents: row.total }; });

  const saved = await db.$transaction(async (tx) => {
    const quote = existing
      ? await tx.quote.update({ where: { id: existing.id }, data: { ...data, items: { deleteMany: {}, create: rows } } })
      : await (async () => { const number = await nextDocNumber(tx); const code = docCode(number); return tx.quote.create({ data: { ...data, number, code, orderNumber: code, createdById: actorId, items: { create: rows } } }); })();
    await tx.auditLog.create({ data: { actorId, action: existing ? "quote.update" : "quote.create", entity: "Quote", entityId: quote.id, after: { status, totalCents: t.total, items: rows.length } } });
    if (quote.status === "APROVADO") { await syncSaleFromQuote(tx, quote.id); await syncDeliveryFromQuote(tx, quote.id); } // fechado editado → atualiza venda e entrega
    return quote;
  });
  return { id: saved.id, number: saved.number, code: saved.code, status: saved.status };
}

export async function setQuoteStatus(actorId: string, id: string, status: "ENVIADO" | "APROVADO" | "RECUSADO", lostReason: string | null = null) {
  const to = status === "APROVADO" ? "fechados" : status === "RECUSADO" ? "perdidos" : "salvos";
  return moveQuote(actorId, id, to, lostReason, status === "ENVIADO");
}

/** Move o orçamento no funil (Salvos / Fechados / Perdidos) registrando a data de fechamento. */
export async function moveQuote(actorId: string, id: string, to: Stage, lostReason: string | null, markSent = false) {
  const q = await db.quote.findUnique({ where: { id } });
  if (!q) throw new AppError("NOT_FOUND", "Orçamento não encontrado.", 404);
  if (markSent && stageOf(q.status) === "salvos") {
    if (q.status === "RASCUNHO") throw new AppError("INVALID", "Gere o orçamento antes de marcá-lo como enviado.", 409);
    if (q.status === "ENVIADO") return q;
    const u = await db.quote.update({ where: { id }, data: { status: "ENVIADO" } });
    await db.auditLog.create({ data: { actorId, action: "quote.status.enviado", entity: "Quote", entityId: id, before: { status: q.status }, after: { status: "ENVIADO" } } });
    return u;
  }
  const plan = planMove({ status: q.status, issuedAt: q.issuedAt, validDays: q.validDays, draftBefore: !(await wasIssued(id, q.status)) }, to, lostReason);
  if (!plan) return q;
  if ("error" in plan) throw new AppError("INVALID", plan.error as string, 409);
  // Fechados ↔ Financeiro: fechar gera a venda e as parcelas; sair de Fechados cancela a venda (bloqueado se já houve recebimento).
  return db.$transaction(async (tx) => {
    if (q.status === "APROVADO") { await cancelSaleForQuote(tx, id); await cancelDeliveryForQuote(tx, id); }
    const u = await tx.quote.update({ where: { id }, data: plan });
    if (plan.status === "APROVADO") { await syncSaleFromQuote(tx, id); await syncDeliveryFromQuote(tx, id); }
    await tx.auditLog.create({ data: { actorId, action: `quote.move.${to}`, entity: "Quote", entityId: id, before: { status: q.status, closedAt: q.closedAt }, after: { status: plan.status, closedAt: plan.closedAt, lostReason: plan.lostReason } } });
    return u;
  });
}
/** Um orçamento fechado/perdido que nunca foi emitido volta como rascunho ao ser reaberto. */
async function wasIssued(id: string, status: string) {
  if (status !== "APROVADO" && status !== "RECUSADO") return true;
  return (await db.auditLog.count({ where: { entity: "Quote", entityId: id, after: { path: ["status"], equals: "EMITIDO" } } })) > 0;
}

/** Cópia em rascunho com preços ATUAIS do cadastro (demais textos do item são mantidos). */
export async function duplicateQuote(actorId: string, id: string) {
  const src = await db.quote.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" } } } });
  if (!src) throw new AppError("NOT_FOUND", "Orçamento não encontrado.", 404);
  const opts = await quoteProductOptions();
  const items = src.items.filter((i) => i.variantId && opts.some((o) => o.variantId === i.variantId)).map((i) => {
    const o = opts.find((x) => x.variantId === i.variantId)!;
    return { variantId: o.variantId, imageUrl: i.imageUrl, name: i.name, fabricLine: i.fabricLine, paint: i.paint, measures: i.measures, finish: i.finish, cordage: i.cordage, itemNotes: i.itemNotes,
      quantity: i.quantity, unitPrice: (o.priceCents ?? i.unitPriceCents) / 100, unitDiscount: Math.min(i.unitDiscountCents, o.priceCents ?? i.unitPriceCents) / 100 };
  });
  if (!items.length) throw new AppError("INVALID", "Nenhum produto do orçamento original está ativo.", 409);
  return saveQuote(actorId, {
    companyId: src.companyId, clientId: src.clientId, category: src.category, client: src.clientSnapshot, commercial: src.commercialSnapshot ?? {}, issuedAt: new Date(), validDays: src.validDays,
    deliveryDays: src.deliveryDays, paymentTerms: src.paymentTerms, installmentPlan: src.installmentPlan, installmentValues: src.installmentValues ?? Prisma.DbNull, notes: src.notes,
    freightTerm: src.freightTerm, freight: src.freightCents / 100, extraDiscount: src.extraDiscountCents / 100, items,
  }, false);
}


const fmtPhone = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p; };

/** Clientes cadastrados (empresas do site) para preencher "Dados do Cliente". */
export async function clientOptions() {
  const companies = await db.company.findMany({ where: { status: { not: "BLOCKED" } }, orderBy: { legalName: "asc" }, take: 500, include: { members: { take: 1, include: { user: { select: { name: true, email: true, phone: true } } } }, addresses: { orderBy: { isDefault: "desc" }, take: 1 } } });
  const fromCompanies = companies.map((c) => {
    const a = c.addresses[0];
    return { key: `co:${c.id}`, kind: "company" as const, id: c.id, name: c.legalName, cpf: "", cnpj: c.cnpj, ie: c.stateRegistration ?? "", address: a ? `${a.street}, ${a.number}${a.complement ? ` – ${a.complement}` : ""} · ${a.district}` : "",
      city: a ? `${a.city} - ${a.state}` : "", cep: a ? a.zipCode.replace(/(\d{5})(\d{3})/, "$1-$2") : "", contact: c.members[0]?.user.name ?? "", mobile: fmtPhone(c.members[0]?.user.phone ?? ""),
      email: c.members[0]?.user.email ?? "", site: "", birthday: "", delivery: "" };
  });
  // + cadastro comercial (importado por planilha) — PF ou PJ, sem conta no site
  const registry = await db.client.findMany({ orderBy: { name: "asc" }, take: 3000 });
  const fromRegistry = registry.map((c) => ({ key: `cl:${c.id}`, kind: "client" as const, id: c.id, ...clientToQuoteFields(c) }));
  return [...fromRegistry, ...fromCompanies].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
export type ClientOption = Awaited<ReturnType<typeof clientOptions>>[number];

// ------------------------------------------------------------------ funil (kanban)
export const funnelFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  criadoDe: z.string().optional().catch(undefined), criadoAte: z.string().optional().catch(undefined),
  fechadoDe: z.string().optional().catch(undefined), fechadoAte: z.string().optional().catch(undefined),
  categoria: z.string().max(60).optional().catch(undefined),
});
export type FunnelFilters = z.infer<typeof funnelFilterSchema>;

/** Todos os orçamentos salvos, organizados por coluna do funil, com filtros de datas e busca por cliente ou número. */
export async function funnelCards(f: FunnelFilters) {
  const where: Prisma.QuoteWhereInput = {};
  const created = dayRange(f.criadoDe, f.criadoAte), closed = dayRange(f.fechadoDe, f.fechadoAte);
  if (created) where.createdAt = created;
  if (closed) where.closedAt = closed;
  if (f.categoria) where.category = f.categoria === "sem" ? null : f.categoria;
  if (f.q) {
    const n = parseDocNumber(f.q), up = f.q.toUpperCase();
    where.OR = [
      ...(n && /^[a-z]{0,3}[-\s]?\d+$/i.test(f.q.trim()) ? [{ number: n }] : []),
      { code: { contains: up } },
      { id: { in: await clientNameMatches(f.q) } },
    ];
  }
  const rows = await db.quote.findMany({
    where, orderBy: { createdAt: "desc" }, take: 1500,
    include: { _count: { select: { items: true } }, items: { orderBy: { position: "asc" }, take: 1, select: { imageUrl: true } } },
  });
  return rows.map((q) => {
    const c = q.clientSnapshot as Record<string, string>;
    return {
      id: q.id, code: q.code, status: q.status, stage: stageOf(q.status), category: q.category, clientName: c.name || "Cliente não informado", contact: c.contact || "", city: c.city || "",
      totalCents: q.totalCents, freightTerm: q.freightTerm, items: q._count.items, imageUrl: q.items[0]?.imageUrl ?? null, seller: q.seller ?? "",
      createdAt: q.createdAt.toISOString(), closedAt: q.closedAt?.toISOString() ?? null, validUntil: validUntil(q.issuedAt, q.validDays).toISOString(), validityOver: (q.status === "EMITIDO" || q.status === "ENVIADO") && validUntil(q.issuedAt, q.validDays).toISOString().slice(0, 10) < todayBR(), lostReason: q.lostReason,
    };
  });
}
/** Busca por nome do cliente/contato sem diferenciar maiúsculas e minúsculas (campo JSON do orçamento). */
async function clientNameMatches(term: string) {
  const like = `%${term.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Quote" WHERE ("clientSnapshot"->>'name') ILIKE ${like} OR ("clientSnapshot"->>'contact') ILIKE ${like} LIMIT 2000`;
  return rows.map((r) => r.id);
}
export type FunnelCard = Awaited<ReturnType<typeof funnelCards>>[number];
