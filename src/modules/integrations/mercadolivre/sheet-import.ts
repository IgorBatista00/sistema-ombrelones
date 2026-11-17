import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { readMatrix } from "@/modules/products/excel";
import { findHeader, parseMlRow, type MlSheetRow } from "./sheet-rules";

/** Recebimentos vindos de planilha usam este prefixo no paymentId (a integração direta usa o id real do pagamento). */
export const SHEET_PREFIX = "PLAN-";
const MAX_LINES = 5000;

export type MlImportOrder = {
  orderId: string; lines: number[]; saleDate: string; buyer: string | null; items: string; quantity: number;
  productCents: number; feeCents: number | null; netCents: number | null; cancelled: boolean; status: string;
  action: "criar" | "atualizar" | "ignorar"; note: string | null;
};
export type MlImportPreview = { orders: MlImportOrder[]; lineIssues: { line: number; orderId: string; errors: string[]; warnings: string[] }[]; totals: { orders: number; productCents: number; feeCents: number; cancelled: number } };

async function analyze(buf: Buffer, filename: string) {
  const matrix = await readMatrix(buf, filename);
  const h = findHeader(matrix);
  if (!h) throw new AppError("BAD_HEADER", "Não encontrei as colunas do relatório de vendas (nº da venda e título do anúncio ou receita). Use a planilha baixada em Mercado Livre › Vendas › “Baixar Excel de vendas”, sem alterar os títulos das colunas.", 422);
  const body = matrix.slice(h.row + 1);
  if (body.length > MAX_LINES) throw new AppError("TOO_MANY_ROWS", `Máximo de ${MAX_LINES} linhas por importação — exporte um período menor.`, 422);
  const parsed = body.map((cells, i) => parseMlRow((cells ?? []).map((c) => String(c ?? "")), h.cols, h.row + i + 2)).filter((r) => !(r.skipped && !r.warnings.length && !r.errors.length));
  const byOrder = new Map<string, MlSheetRow[]>();
  for (const r of parsed) if (r.ok) byOrder.set(r.ok.orderId, [...(byOrder.get(r.ok.orderId) ?? []), r.ok]);
  const ids = [...byOrder.keys()];
  const existing = await db.mlReceipt.findMany({ where: { orderId: { in: ids } }, select: { orderId: true, paymentId: true } });
  const fromApi = new Set(existing.filter((e) => !e.paymentId.startsWith(SHEET_PREFIX)).map((e) => e.orderId));
  const fromSheet = new Set(existing.filter((e) => e.paymentId.startsWith(SHEET_PREFIX)).map((e) => e.orderId));
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
      cancelled, status: [...new Set(rows.map((r) => r.status))].join(" / "),
      items: rows.map((r) => `${r.quantity}× ${r.title}`).join(", "),
    };
    const action: MlImportOrder["action"] = fromApi.has(orderId) ? "ignorar" : fromSheet.has(orderId) ? "atualizar" : "criar";
    return { ...o, action, note: fromApi.has(orderId) ? "Já veio pela integração direta — mantida a versão da integração." : null };
  });
  const lineIssues = parsed.filter((r) => r.errors.length || r.warnings.length).map((r) => ({ line: r.line, orderId: r.orderId, errors: r.errors, warnings: r.warnings }));
  return { orders, lineIssues };
}

export async function previewMlSheet(buf: Buffer, filename: string): Promise<MlImportPreview> {
  const { orders, lineIssues } = await analyze(buf, filename);
  if (!orders.length && !lineIssues.length) throw new AppError("EMPTY", "Nenhuma venda encontrada na planilha.", 422);
  const valid = orders.filter((o) => o.action !== "ignorar" && !o.cancelled);
  return {
    orders: orders.map(({ rows: _r, ...o }) => ({ ...o, saleDate: o.saleDate.toISOString() })), // eslint-disable-line @typescript-eslint/no-unused-vars
    lineIssues,
    totals: { orders: valid.length, productCents: valid.reduce((a, o) => a + o.productCents, 0), feeCents: valid.reduce((a, o) => a + (o.feeCents ?? 0), 0), cancelled: orders.filter((o) => o.cancelled && o.action !== "ignorar").length },
  };
}

/** Grava as vendas (como recebimentos "sem informação de liberação") e os itens, para aparecerem na aba, nas categorias e no Meu dia. */
export async function commitMlSheet(actorId: string, buf: Buffer, filename: string) {
  const { orders } = await analyze(buf, filename);
  const todo = orders.filter((o) => o.action !== "ignorar");
  if (!todo.length) throw new AppError("NOTHING", "Nenhuma venda para importar (todas já vieram pela integração ou a planilha só tem erros).", 422);
  await db.$transaction(async (tx) => {
    for (const o of todo) {
      const data = {
        paymentId: `${SHEET_PREFIX}${o.orderId}`, orderId: o.orderId, packId: null, orderStatus: o.cancelled ? "cancelled" : "paid", paymentStatus: o.cancelled ? "refunded" : "approved",
        saleDate: o.saleDate, buyerNickname: o.buyer, itemsSummary: o.items.slice(0, 500), grossCents: o.productCents + (o.shippingCents ?? 0), shippingCents: o.shippingCents,
        feeCents: o.feeCents, netCents: o.netCents, releaseDate: null, releaseStatus: null,
        raw: { source: "planilha", file: filename.slice(0, 120), lines: o.lines, status: o.status } as Prisma.InputJsonValue, syncedAt: new Date(),
      };
      await tx.mlReceipt.upsert({ where: { paymentId: data.paymentId }, update: data, create: data });
      await tx.mlOrderItem.deleteMany({ where: { orderId: o.orderId } });
      await tx.mlOrderItem.createMany({ data: o.rows.map((r, i) => ({
        orderId: o.orderId, position: i, itemId: r.itemId ?? r.sku ?? "PLANILHA", title: r.title, categoryId: null, quantity: r.quantity, unitPriceCents: r.unitPriceCents,
        saleFeeCents: r.feeCents != null ? Math.round(r.feeCents / r.quantity) : null, orderStatus: r.cancelled ? "cancelled" : "paid", saleDate: r.saleDate,
      })) });
    }
    await tx.auditLog.create({ data: { actorId, action: "mercadolivre.sheet_import", entity: "MlReceipt", entityId: "planilha", after: { file: filename.slice(0, 120), created: todo.filter((o) => o.action === "criar").length, updated: todo.filter((o) => o.action === "atualizar").length } } });
  }, { timeout: 120_000 });
  return { created: todo.filter((o) => o.action === "criar").length, updated: todo.filter((o) => o.action === "atualizar").length, skipped: orders.length - todo.length };
}
