import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseDocNumber } from "@/lib/doc-code";
import { dayRange } from "@/modules/quotes/funnel";
import { deliveryAddress, deliverySummary, isLate, planDeliveryUpdate, promisedDate, type DeliveryStatusKey } from "./rules";

type Tx = Prisma.TransactionClient;

/** Pedido fechado (orçamento APROVADO) → entrega. Reabre a entrega cancelada; atualiza os dados enquanto não saiu para entrega. */
export async function syncDeliveryFromQuote(tx: Tx, quoteId: string) {
  const q = await tx.quote.findUnique({ where: { id: quoteId }, include: { items: { orderBy: { position: "asc" } }, delivery: true } });
  if (!q || q.status !== "APROVADO") return null;
  const c = q.clientSnapshot as Record<string, string>;
  const addr = deliveryAddress(c);
  const closedAt = q.closedAt ?? new Date();
  const weightG = q.items.reduce((a, i) => a + (i.weightG ?? 0) * i.quantity, 0);
  const cubage = q.items.reduce((a, i) => a + (i.cubageM3 ?? 0) * i.quantity, 0);
  const snap = {
    code: q.code, category: q.category, clientName: c.name || "Cliente não informado", clientDoc: c.cnpj || c.cpf || null, contact: c.contact || null, phone: c.mobile || null, email: c.email || null,
    items: q.items.map((i) => ({ name: i.name, quantity: i.quantity, measures: i.measures, finish: i.finish, imageUrl: i.imageUrl })),
    totalCents: q.totalCents, weightKg: weightG ? weightG / 1000 : null, cubageM3: cubage || null, closedAt, promisedAt: promisedDate(closedAt, q.deliveryDays),
  };
  const d = q.delivery;
  if (!d) return tx.delivery.create({ data: { quoteId: q.id, ...snap, address: addr.address, city: addr.city, cep: addr.cep } });
  if (d.status === "CANCELADA") return tx.delivery.update({ where: { id: d.id }, data: { ...snap, address: addr.address, city: addr.city, cep: addr.cep, status: "A_AGENDAR", cancelledAt: null, scheduledAt: null, shippedAt: null, deliveredAt: null, receivedBy: null } });
  // já agendada/em rota/entregue: mantém endereço e logística como estão; só atualiza os dados do pedido
  return tx.delivery.update({ where: { id: d.id }, data: d.status === "A_AGENDAR" ? { ...snap, address: addr.address, city: addr.city, cep: addr.cep } : snap });
}

/** Pedido saiu de Fechados → entrega cancelada. Bloqueia se já foi entregue. */
export async function cancelDeliveryForQuote(tx: Tx, quoteId: string) {
  const d = await tx.delivery.findUnique({ where: { quoteId } });
  if (!d || d.status === "CANCELADA") return;
  if (d.status === "ENTREGUE") throw new AppError("DELIVERY_LOCKED", `O pedido ${d.code} já consta como entregue. Volte a entrega para “A agendar” antes de reabrir ou perder o pedido.`, 409);
  await tx.delivery.update({ where: { id: d.id }, data: { status: "CANCELADA", cancelledAt: new Date() } });
}

export async function backfillDeliveries() {
  const missing = await db.quote.findMany({ where: { status: "APROVADO", delivery: null }, select: { id: true }, take: 500 });
  for (const q of missing) {
    try { await db.$transaction((tx) => syncDeliveryFromQuote(tx, q.id)); } catch (e) { console.error("entrega não gerada para o orçamento", q.id, e); } // não trava a tela
  }
}

const updateSchema = z.object({
  status: z.enum(["A_AGENDAR", "AGENDADA", "EM_ROTA", "ENTREGUE", "CANCELADA"]),
  scheduledAt: z.string().optional(), carrier: z.string().max(120).optional(), trackingCode: z.string().max(80).optional(),
  shippedAt: z.string().optional(), deliveredAt: z.string().optional(), receivedBy: z.string().max(120).optional(), notes: z.string().max(2000).optional(),
  address: z.string().max(400).optional(), contact: z.string().max(120).optional(), phone: z.string().max(40).optional(),
});
export async function updateDelivery(actorId: string, id: string, raw: unknown) {
  const p = updateSchema.safeParse(raw);
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Dados inválidos.", 422);
  return db.$transaction(async (tx) => {
    const d = await tx.delivery.findUnique({ where: { id } });
    if (!d) throw new AppError("NOT_FOUND", "Entrega não encontrada.", 404);
    const plan = planDeliveryUpdate(d, p.data);
    if ("error" in plan) throw new AppError("INVALID", plan.error as string, 409);
    const u = await tx.delivery.update({ where: { id }, data: plan.data as Prisma.DeliveryUpdateInput });
    await tx.auditLog.create({ data: { actorId, action: `delivery.${p.data.status.toLowerCase()}`, entity: "Delivery", entityId: id, before: { status: d.status, scheduledAt: d.scheduledAt, deliveredAt: d.deliveredAt }, after: JSON.parse(JSON.stringify(plan.data)) } });
    return u;
  });
}

export const deliveryFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  situacao: z.string().optional().catch(undefined), // pendentes (padrão) | atrasadas | A_AGENDAR | AGENDADA | EM_ROTA | ENTREGUE | CANCELADA | todas
  categoria: z.string().max(60).optional().catch(undefined), // categoria interna do pedido ("sem" = sem categoria)
  de: z.string().optional().catch(undefined), ate: z.string().optional().catch(undefined), // previsão (pendentes) ou data da entrega (entregues)
});
export type DeliveryFilters = z.infer<typeof deliveryFilterSchema>;

export async function deliveriesView(f: DeliveryFilters) {
  const sit = f.situacao || "pendentes";
  const and: Prisma.DeliveryWhereInput[] = [];
  if (f.q) {
    const n = parseDocNumber(f.q);
    and.push({ OR: [{ code: { contains: f.q.trim().toUpperCase() } }, { clientName: { contains: f.q, mode: "insensitive" } }, { address: { contains: f.q, mode: "insensitive" } }, { city: { contains: f.q, mode: "insensitive" } }, { contact: { contains: f.q, mode: "insensitive" } },
      ...(n && /^[a-z]{0,3}[-\s]?\d+$/i.test(f.q.trim()) ? [{ code: { endsWith: String(n).padStart(4, "0") } }] : [])] });
  }
  if (f.categoria) and.push({ category: f.categoria === "sem" ? null : f.categoria });
  if (sit === "pendentes" || sit === "atrasadas") and.push({ status: { in: ["A_AGENDAR", "AGENDADA", "EM_ROTA"] } });
  else if (sit !== "todas") and.push({ status: sit as DeliveryStatusKey });
  const range = dayRange(f.de, f.ate);
  // período: data da entrega (entregues) ou data-alvo (agendada; sem agendamento, a prometida)
  if (range) and.push(sit === "ENTREGUE" ? { deliveredAt: range } : { OR: [{ scheduledAt: range }, { scheduledAt: null, promisedAt: range }, { deliveredAt: range }] });
  const where: Prisma.DeliveryWhereInput = { AND: and };
  const [rows, all] = await Promise.all([
    db.delivery.findMany({ where, take: 2000, orderBy: sit === "ENTREGUE" ? { deliveredAt: "desc" } : [{ scheduledAt: { sort: "asc", nulls: "last" } }, { promisedAt: { sort: "asc", nulls: "last" } }, { closedAt: "asc" }] }),
    db.delivery.findMany({ where: { status: { not: "CANCELADA" } }, select: { status: true, promisedAt: true, scheduledAt: true, deliveredAt: true } }),
  ]);
  const now = new Date();
  const list = rows.map((r) => ({ ...r, late: isLate(r, now) })).filter((r) => sit !== "atrasadas" || r.late);
  return { rows: list, summary: deliverySummary(all, now) };
}
