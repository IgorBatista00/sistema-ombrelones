import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, IntegrationNotConfiguredError } from "@/lib/errors";
import { open, seal } from "@/lib/secret-box";
import { dayRange } from "@/modules/quotes/funnel";
import { exchangeCode, getCategory, getMe, getMpPayment, isMlConfigured, refreshToken, searchOrders, type MlToken } from "./client";
import { categoryBreakdown, categoryPath, mlSummary, needsRefresh, orderToItems, orderToReceipts, releaseState, type MpPayment, type ReleaseState } from "./rules";

const MAX_ORDERS_PER_SYNC = 300; // respeita o limite de requisições da API (pagamentos consultados um a um)

async function saveTokens(t: MlToken, extra: { sellerId?: string; nickname?: string | null; actorId?: string }) {
  const data = { accessTokenEnc: seal(t.access_token), refreshTokenEnc: seal(t.refresh_token), expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  return db.mlConnection.upsert({
    where: { id: "default" },
    update: { ...data, ...(extra.sellerId ? { sellerId: extra.sellerId, nickname: extra.nickname ?? null } : {}), lastSyncError: null },
    create: { id: "default", ...data, sellerId: extra.sellerId ?? String(t.user_id), nickname: extra.nickname ?? null, connectedById: extra.actorId ?? "" },
  });
}

/** Callback do OAuth: troca o código por tokens e guarda a conta conectada. */
export async function completeConnection(actorId: string, code: string, verifier: string) {
  if (!isMlConfigured()) throw new IntegrationNotConfiguredError("Mercado Livre");
  const t = await exchangeCode(code, verifier);
  const me = await getMe(t.access_token);
  await saveTokens(t, { sellerId: String(me.id), nickname: me.nickname ?? null, actorId });
  await db.auditLog.create({ data: { actorId, action: "mercadolivre.connect", entity: "MlConnection", entityId: "default", after: { sellerId: String(me.id), nickname: me.nickname ?? null } } });
}

async function validToken() {
  const c = await db.mlConnection.findUnique({ where: { id: "default" } });
  if (!c) throw new AppError("ML_NOT_CONNECTED", "Conecte a conta do Mercado Livre primeiro.", 409);
  if (!needsRefresh(c.expiresAt)) return { token: open(c.accessTokenEnc), sellerId: c.sellerId };
  try {
    const t = await refreshToken(open(c.refreshTokenEnc));
    await saveTokens(t, {});
    return { token: t.access_token, sellerId: c.sellerId };
  } catch (e) {
    await db.mlConnection.update({ where: { id: "default" }, data: { lastSyncError: "Não foi possível renovar a autorização. Conecte a conta novamente." } });
    throw e instanceof AppError ? e : new AppError("ML_REFRESH", "Não foi possível renovar a autorização. Conecte a conta novamente.", 401);
  }
}

/** Busca os pedidos dos últimos `days` dias e grava/atualiza os recebimentos (idempotente por pagamento). */
export async function syncMercadoLivre(actorId: string, days = 30) {
  if (!isMlConfigured()) throw new IntegrationNotConfiguredError("Mercado Livre");
  const { token, sellerId } = await validToken();
  const from = new Date(Date.now() - days * 86_400_000);
  let offset = 0, orders = 0, saved = 0, withRelease = 0;
  const categoryIds = new Set<string>();
  try {
    while (orders < MAX_ORDERS_PER_SYNC) {
      const page = await searchOrders(token, sellerId, from, offset);
      for (const o of page.results) {
        const mp = new Map<string, MpPayment>();
        for (const p of o.payments ?? []) { const d = await getMpPayment(token, String(p.id)); if (d) { mp.set(String(p.id), d); if (d.money_release_date) withRelease++; } }
        // pedido que veio antes pela planilha: a integração passa a valer (evita contar a venda duas vezes)
        await db.mlReceipt.deleteMany({ where: { orderId: String(o.id), paymentId: { startsWith: "PLAN-" } } });
        await db.mlOrderItem.deleteMany({ where: { orderId: String(o.id), position: { gte: orderToItems(o).length } } });
        for (const r of orderToReceipts(o, mp)) {
          const data = { ...r, raw: JSON.parse(JSON.stringify({ order: { id: o.id, status: o.status, pack_id: o.pack_id ?? null }, payment: (o.payments ?? []).find((p) => String(p.id) === r.paymentId), mp: mp.get(r.paymentId) ?? null })) as Prisma.InputJsonValue, syncedAt: new Date() };
          await db.mlReceipt.upsert({ where: { paymentId: r.paymentId }, update: data, create: data });
          saved++;
        }
        for (const it of orderToItems(o)) {
          await db.mlOrderItem.upsert({ where: { orderId_position: { orderId: it.orderId, position: it.position } }, update: { ...it, syncedAt: new Date() }, create: it });
          if (it.categoryId) categoryIds.add(it.categoryId);
        }
        orders++;
      }
      offset += page.paging.limit;
      if (!page.results.length || offset >= page.paging.total) break;
    }
    // nomes das categorias novas (cache local; renova a cada 30 dias)
    const known = await db.mlCategory.findMany({ where: { id: { in: [...categoryIds] }, fetchedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, select: { id: true } });
    for (const id of [...categoryIds].filter((c) => !known.some((k) => k.id === c))) {
      const c = await getCategory(token, id);
      if (c) await db.mlCategory.upsert({ where: { id }, update: { name: c.name, path: categoryPath(c), fetchedAt: new Date() }, create: { id, name: c.name, path: categoryPath(c) } });
    }
    await db.mlConnection.update({ where: { id: "default" }, data: { lastSyncAt: new Date(), lastSyncError: null } });
    await db.auditLog.create({ data: { actorId, action: "mercadolivre.sync", entity: "MlConnection", entityId: "default", after: { days, orders, saved, withRelease } } });
    return { orders, saved, withRelease, capped: orders >= MAX_ORDERS_PER_SYNC };
  } catch (e) {
    const msg = e instanceof AppError ? e.message : "Erro inesperado na sincronização.";
    await db.mlConnection.update({ where: { id: "default" }, data: { lastSyncError: msg } });
    throw e;
  }
}

export async function disconnectMercadoLivre(actorId: string) {
  await db.mlConnection.deleteMany({ where: { id: "default" } }); // apaga os tokens (os recebimentos já sincronizados ficam)
  await db.auditLog.create({ data: { actorId, action: "mercadolivre.disconnect", entity: "MlConnection", entityId: "default" } });
}

export const mlFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  de: z.string().optional().catch(undefined), ate: z.string().optional().catch(undefined),
  liberacao: z.enum(["a_liberar", "liberado", "sem_info", "estornado"]).optional().catch(undefined),
  categoria: z.string().max(40).optional().catch(undefined), // id da categoria do ML, ou "sem" para itens sem categoria
});
export async function mlView(f: z.infer<typeof mlFilterSchema>) {
  const range = dayRange(f.de, f.ate);
  const q = f.q ? { contains: f.q, mode: "insensitive" as const } : null;
  // pedidos que têm item na categoria escolhida
  const catOrders = f.categoria ? (await db.mlOrderItem.findMany({ where: { categoryId: f.categoria === "sem" ? null : f.categoria }, select: { orderId: true }, distinct: ["orderId"] })).map((x) => x.orderId) : null;
  const where: Prisma.MlReceiptWhereInput = {
    ...(range ? { saleDate: range } : {}),
    ...(q ? { OR: [{ orderId: { contains: f.q!.replace(/\D/g, "") || "§" } }, { buyerNickname: q }, { itemsSummary: q }] } : {}),
    ...(catOrders ? { orderId: { in: catOrders } } : {}),
  };
  const itemWhere: Prisma.MlOrderItemWhereInput = {
    ...(range ? { saleDate: range } : {}),
    ...(q ? { OR: [{ orderId: { contains: f.q!.replace(/\D/g, "") || "§" } }, { title: q }, { itemId: q }] } : {}),
  };
  const [conn, all, items, cats] = await Promise.all([
    db.mlConnection.findUnique({ where: { id: "default" }, select: { sellerId: true, nickname: true, connectedAt: true, lastSyncAt: true, lastSyncError: true, expiresAt: true } }),
    db.mlReceipt.findMany({ where, orderBy: { saleDate: "desc" }, take: 2000 }),
    db.mlOrderItem.findMany({ where: itemWhere, select: { orderId: true, categoryId: true, quantity: true, unitPriceCents: true, saleFeeCents: true, orderStatus: true }, take: 20000 }),
    db.mlCategory.findMany({ select: { id: true, name: true, path: true } }),
  ]);
  const now = new Date();
  const names = new Map(cats.map((c) => [c.id, { name: c.name, path: c.path }]));
  const rows = all.map((r) => ({ ...r, release: releaseState(r, now) as ReleaseState })).filter((r) => !f.liberacao || r.release === f.liberacao);
  const breakdown = categoryBreakdown(items, names);
  // opções do filtro: todas as categorias já vendidas (independe do período)
  const options = (await db.mlOrderItem.findMany({ select: { categoryId: true }, distinct: ["categoryId"] })).map((x) => ({ id: x.categoryId ?? "sem", name: x.categoryId ? names.get(x.categoryId)?.name ?? x.categoryId : "Sem categoria", path: x.categoryId ? names.get(x.categoryId)?.path ?? "" : "" })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  // categorias de cada pedido (para a coluna da tabela)
  const orderCats = new Map<string, string[]>();
  for (const it of await db.mlOrderItem.findMany({ where: { orderId: { in: rows.map((r) => r.orderId) } }, select: { orderId: true, categoryId: true } })) {
    const n = it.categoryId ? names.get(it.categoryId)?.name ?? it.categoryId : "Sem categoria";
    orderCats.set(it.orderId, [...new Set([...(orderCats.get(it.orderId) ?? []), n])]);
  }
  return { connection: conn, rows: rows.map((r) => ({ ...r, categories: orderCats.get(r.orderId) ?? [] })), summary: mlSummary(rows, now), breakdown, categoryOptions: options };
}
