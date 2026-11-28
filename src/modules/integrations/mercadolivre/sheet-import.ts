import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { readMatrix } from "@/modules/products/excel";
import { extraMoneyCols, findHeader, parseMlRow, type MlSheetRow } from "./sheet-rules";
import { applyMlStock, getOwnPrefixes, relinkItems } from "@/modules/mercadolivre/service";
import { allocatePackShipping, foreignOf } from "@/modules/mercadolivre/rules";
import { spDay } from "@/modules/purchase-orders/rules";

/** Recebimentos vindos de planilha usam este prefixo no paymentId (a integração direta usa o id real do pagamento). */
export const SHEET_PREFIX = "PLAN-";
const MAX_LINES = 5000;

export type MlImportOrder = {
  orderId: string; lines: number[]; saleDate: string; buyer: string | null; items: string; quantity: number;
  productCents: number; feeCents: number | null; netCents: number | null; cancelled: boolean; status: string; foreign: boolean;
  action: "criar" | "atualizar" | "ignorar"; note: string | null;
};
export type MlImportPreview = { orders: MlImportOrder[]; lineIssues: { line: number; orderId: string; errors: string[]; warnings: string[] }[]; totals: { orders: number; productCents: number; feeCents: number; cancelled: number; removed: number; foreign: number }; prefixes: string[] };

async function analyze(buf: Buffer, filename: string) {
  const matrix = await readMatrix(buf, filename);
  const h = findHeader(matrix);
  if (!h) throw new AppError("BAD_HEADER", "Não encontrei as colunas do relatório de vendas (nº da venda e título do anúncio ou receita). Use a planilha baixada em Mercado Livre › Vendas › “Baixar Excel de vendas”, sem alterar os títulos das colunas.", 422);
  const body = matrix.slice(h.row + 1);
  if (body.length > MAX_LINES) throw new AppError("TOO_MANY_ROWS", `Máximo de ${MAX_LINES} linhas por importação — exporte um período menor.`, 422);
  const extra = extraMoneyCols((matrix[h.row] ?? []).map((c) => String(c ?? "")), h.cols);
  const parsed = body.map((cells, i) => parseMlRow((cells ?? []).map((c) => String(c ?? "")), h.cols, h.row + i + 2, extra)).filter((r) => !(r.skipped && !r.warnings.length && !r.errors.length));
  const byOrder = new Map<string, MlSheetRow[]>();
  for (const r of parsed) if (r.ok) byOrder.set(r.ok.orderId, [...(byOrder.get(r.ok.orderId) ?? []), r.ok]);
  const ids = [...byOrder.keys()];
  const existing = await db.mlReceipt.findMany({ where: { orderId: { in: ids } }, select: { orderId: true, paymentId: true } });
  const fromApi = new Set(existing.filter((e) => !e.paymentId.startsWith(SHEET_PREFIX)).map((e) => e.orderId));
  const fromSheet = new Set(existing.filter((e) => e.paymentId.startsWith(SHEET_PREFIX)).map((e) => e.orderId));
  // vendas de outra empresa (mesma conta do ML): pela regra do SKU, mantendo correções manuais já feitas
  const prefixes = await getOwnPrefixes();
  const manual = new Map((await db.mlOrderItem.findMany({ where: { orderId: { in: ids }, foreignManual: { not: null } }, select: { orderId: true, itemId: true, variation: true, foreignManual: true } })).map((m) => [`${m.orderId}|${m.itemId}|${m.variation ?? ""}`, m.foreignManual]));
  const foreignRow = (r: MlSheetRow) => foreignOf(r.sku, manual.get(`${r.orderId}|${r.itemId ?? r.sku ?? "PLANILHA"}|${r.variation ?? ""}`), prefixes);
  const orders = ids.map((orderId) => {
    const rows = byOrder.get(orderId)!;
    const cancelled = rows.every((r) => r.cancelled);
    const withFee = rows.filter((r) => r.feeCents != null), withTotal = rows.filter((r) => r.totalCents != null);
    const o = {
      orderId, rows, lines: rows.map((r) => r.line), saleDate: new Date(Math.min(...rows.map((r) => r.saleDate.getTime()))),
      buyer: rows.find((r) => r.buyer)?.buyer ?? null, quantity: rows.reduce((a, r) => a + r.quantity, 0),
      productCents: rows.reduce((a, r) => a + r.productCents, 0), shippingCents: rows.some((r) => r.shippingCents != null) ? rows.reduce((a, r) => a + (r.shippingCents ?? 0), 0) : null,
      feeCents: withFee.length ? withFee.reduce((a, r) => a + r.feeCents!, 0) : null,
      netCents: withTotal.length === rows.length ? rows.reduce((a, r) => a + r.totalCents!, 0) : null,
      cancelled, status: [...new Set(rows.map((r) => r.status))].join(" / "), foreign: rows.every(foreignRow),
      items: rows.map((r) => `${r.quantity}× ${r.title}`).join(", "),
    };
    const action: MlImportOrder["action"] = fromApi.has(orderId) ? "ignorar" : fromSheet.has(orderId) ? "atualizar" : "criar";
    return { ...o, action, note: fromApi.has(orderId) ? "Já veio pela integração direta — mantida a versão da integração." : null };
  });
  const lineIssues = parsed.filter((r) => r.errors.length || r.warnings.length).map((r) => ({ line: r.line, orderId: r.orderId, errors: r.errors, warnings: r.warnings }));
  // resumos de pacote que uma importação antiga gravou como venda: removidos ao importar de novo
  const summaryIds = parsed.filter((r) => r.packSummary && r.orderId && !byOrder.has(r.orderId)).map((r) => r.orderId);
  const staleSummaries = summaryIds.length ? (await db.mlReceipt.findMany({ where: { orderId: { in: summaryIds }, paymentId: { startsWith: SHEET_PREFIX } }, select: { orderId: true } })).map((x) => x.orderId) : [];
  return { orders, lineIssues, staleSummaries, prefixes, foreignRow, manual };
}

export async function previewMlSheet(buf: Buffer, filename: string): Promise<MlImportPreview> {
  const { orders, lineIssues, staleSummaries, prefixes } = await analyze(buf, filename);
  if (!orders.length && !lineIssues.length) throw new AppError("EMPTY", "Nenhuma venda encontrada na planilha.", 422);
  const valid = orders.filter((o) => o.action !== "ignorar" && !o.cancelled && !o.foreign);
  return {
    orders: orders.map(({ rows: _r, ...o }) => ({ ...o, saleDate: o.saleDate.toISOString() })), // eslint-disable-line @typescript-eslint/no-unused-vars
    lineIssues,
    totals: { orders: valid.length, productCents: valid.reduce((a, o) => a + o.productCents, 0), feeCents: valid.reduce((a, o) => a + (o.feeCents ?? 0), 0), cancelled: orders.filter((o) => o.cancelled && !o.foreign && o.action !== "ignorar").length, removed: staleSummaries.length, foreign: orders.filter((o) => o.foreign && o.action !== "ignorar").length },
    prefixes,
  };
}

/** Grava as vendas (como recebimentos "sem informação de liberação") e os itens, para aparecerem na aba, nas categorias e no Meu dia. */
export async function commitMlSheet(actorId: string, buf: Buffer, filename: string) {
  const { orders, staleSummaries, foreignRow, manual } = await analyze(buf, filename);
  const todo = orders.filter((o) => o.action !== "ignorar");
  if (!todo.length) throw new AppError("NOTHING", "Nenhuma venda para importar (todas já vieram pela integração ou a planilha só tem erros).", 422);
  const alloc = allocatePackShipping(todo.flatMap((o) => o.rows.map((r) => ({
    key: `${r.orderId}|${r.line}`, productCents: r.productCents, shippingFeeCents: r.shippingFeeCents,
    group: r.inPack && !r.cancelled && !foreignRow(r) && r.buyer ? `${r.buyer.toLowerCase()}|${spDay(r.saleDate)}` : null,
  }))));
  let stock = { moved: 0, negative: [] as string[] };
  await db.$transaction(async (tx) => {
    if (staleSummaries.length) { // resumo de pacote gravado como venda por engano: devolve estoque (se baixou) e apaga
      await tx.mlOrderItem.updateMany({ where: { orderId: { in: staleSummaries } }, data: { orderStatus: "cancelled" } });
      await applyMlStock(tx, actorId, staleSummaries);
      await tx.mlOrderItem.deleteMany({ where: { orderId: { in: staleSummaries } } });
      await tx.mlOrderControl.deleteMany({ where: { orderId: { in: staleSummaries } } });
      await tx.mlReceipt.deleteMany({ where: { orderId: { in: staleSummaries }, paymentId: { startsWith: SHEET_PREFIX } } });
    }
    for (const o of todo) {
      const data = {
        paymentId: `${SHEET_PREFIX}${o.orderId}`, orderId: o.orderId, foreign: o.foreign, packId: null, orderStatus: o.cancelled ? "cancelled" : "paid", paymentStatus: o.cancelled ? "refunded" : "approved",
        saleDate: o.saleDate, buyerNickname: o.buyer, itemsSummary: o.items.slice(0, 500), grossCents: o.productCents + (o.shippingCents ?? 0), shippingCents: o.shippingCents,
        feeCents: o.feeCents, netCents: o.netCents, releaseDate: null, releaseStatus: null,
        raw: { source: "planilha", file: filename.slice(0, 120), lines: o.lines, status: o.status } as Prisma.InputJsonValue, syncedAt: new Date(),
      };
      await tx.mlReceipt.upsert({ where: { paymentId: data.paymentId }, update: data, create: data });
      // custo já "congelado" de uma importação anterior é mantido (o lucro histórico não muda com compras novas)
      const prev = new Map((await tx.mlOrderItem.findMany({ where: { orderId: o.orderId }, select: { itemId: true, variation: true, costCents: true, quantity: true } })).map((p) => [`${p.itemId}|${p.variation ?? ""}|${p.quantity}`, p.costCents]));
      await tx.mlOrderItem.deleteMany({ where: { orderId: o.orderId } });
      await tx.mlOrderItem.createMany({ data: o.rows.map((r, i) => ({
        orderId: o.orderId, position: i, itemId: r.itemId ?? r.sku ?? "PLANILHA", title: r.title, categoryId: null, quantity: r.quantity, unitPriceCents: r.unitPriceCents,
        saleFeeCents: r.saleFeeCents != null ? Math.round(r.saleFeeCents / r.quantity) : null, orderStatus: r.cancelled ? "cancelled" : "paid", saleDate: r.saleDate,
        sku: r.sku, variation: r.variation, productCents: r.productCents, shippingRevenueCents: r.shippingCents, saleFeeTotalCents: r.saleFeeCents, shippingFeeCents: r.shippingFeeCents,
        refundCents: r.refundCents, netCents: r.totalCents, inPack: r.inPack, shipAllocCents: alloc.get(`${r.orderId}|${r.line}`) ?? null, bonusCents: r.bonusCents, otherLines: r.otherLines.length ? (r.otherLines as Prisma.InputJsonValue) : Prisma.DbNull, statusText: r.status.slice(0, 200), shipBy: r.shipBy,
        foreign: foreignRow(r), foreignManual: manual.get(`${r.orderId}|${r.itemId ?? r.sku ?? "PLANILHA"}|${r.variation ?? ""}`) ?? null,
        costCents: prev.get(`${r.itemId ?? r.sku ?? "PLANILHA"}|${r.variation ?? ""}|${r.quantity}`) ?? null,
      })) });
    }
    const ids = todo.map((o) => o.orderId);
    await relinkItems(tx, ids);
    stock = await applyMlStock(tx, actorId, ids);
    await tx.auditLog.create({ data: { actorId, action: "mercadolivre.sheet_import", entity: "MlReceipt", entityId: "planilha", after: { file: filename.slice(0, 120), created: todo.filter((o) => o.action === "criar").length, updated: todo.filter((o) => o.action === "atualizar").length, removedPackSummaries: staleSummaries } } });
  }, { timeout: 120_000 });
  return { created: todo.filter((o) => o.action === "criar").length, updated: todo.filter((o) => o.action === "atualizar").length, skipped: orders.length - todo.length, removed: staleSummaries.length, stockMoves: stock.moved, negative: stock.negative };
}
