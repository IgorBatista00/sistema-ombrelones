/** Entregas — regras puras (sem banco). */
export type DeliveryStatusKey = "A_AGENDAR" | "AGENDADA" | "EM_ROTA" | "ENTREGUE" | "CANCELADA";
export const DELIVERY_STATUS: Record<DeliveryStatusKey, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  A_AGENDAR: { label: "A agendar", tone: "warning" },
  AGENDADA: { label: "Agendada", tone: "neutral" },
  EM_ROTA: { label: "Em rota", tone: "neutral" },
  ENTREGUE: { label: "Entregue", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "neutral" },
};
export const OPEN_STATUSES: DeliveryStatusKey[] = ["A_AGENDAR", "AGENDADA", "EM_ROTA"];

const dayStartBR = (d: Date) => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d)}T00:00:00-03:00`);
const isoDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const brDate = (s: string) => new Date(`${s}T12:00:00-03:00`);

/** Prazo prometido = data do fechamento + prazo de entrega do orçamento (dias corridos). */
export function promisedDate(closedAt: Date, deliveryDays: number | null | undefined) {
  if (deliveryDays == null || deliveryDays < 0) return null;
  return new Date(dayStartBR(closedAt).getTime() + deliveryDays * 86_400_000 + 15 * 3_600_000);
}

/** Endereço de entrega: usa "Endereço de entrega" do orçamento; se vazio, o endereço do cliente. */
export function deliveryAddress(c: Record<string, string | undefined>) {
  const own = (c.delivery ?? "").trim();
  if (own) return { address: own, city: (c.city ?? "").trim() || null, cep: (c.cep ?? "").trim() || null, fromClient: false };
  const address = [c.address, c.city, c.cep && `CEP ${c.cep}`].map((x) => (x ?? "").trim()).filter(Boolean).join(" · ");
  return { address: address || "Endereço não informado", city: (c.city ?? "").trim() || null, cep: (c.cep ?? "").trim() || null, fromClient: true };
}

/** Atrasada: ainda não entregue e a data-alvo (agendada, senão prometida) já passou. */
export function isLate(d: { status: DeliveryStatusKey; promisedAt: Date | null; scheduledAt: Date | null }, now = new Date()) {
  if (!OPEN_STATUSES.includes(d.status)) return false;
  const target = d.scheduledAt ?? d.promisedAt;
  return !!target && dayStartBR(target).getTime() < dayStartBR(now).getTime();
}

export interface DeliveryUpdateInput { status: DeliveryStatusKey; scheduledAt?: string; carrier?: string; trackingCode?: string; shippedAt?: string; deliveredAt?: string; receivedBy?: string; notes?: string; address?: string; contact?: string; phone?: string }

/** Valida a mudança e devolve os campos a gravar (ou erro). Cancelamento só acontece pelo funil. */
export function planDeliveryUpdate(current: { status: DeliveryStatusKey; shippedAt: Date | null }, input: DeliveryUpdateInput, now = new Date()) {
  const s = input.status;
  if (current.status === "CANCELADA") return { error: "Entrega cancelada (o pedido saiu de Fechados no funil)." } as const;
  if (s === "CANCELADA") return { error: "Para cancelar a entrega, reabra ou marque o pedido como perdido no funil." } as const;
  if (!DELIVERY_STATUS[s]) return { error: "Situação inválida." } as const;
  const t = (v?: string) => (v ?? "").trim() || null;
  const out: Record<string, unknown> = { status: s, carrier: t(input.carrier), trackingCode: t(input.trackingCode), notes: t(input.notes)?.slice(0, 2000) ?? null };
  if (input.address !== undefined) { if (!t(input.address)) return { error: "Informe o endereço de entrega." } as const; out.address = t(input.address)!.slice(0, 400); }
  if (input.contact !== undefined) out.contact = t(input.contact);
  if (input.phone !== undefined) out.phone = t(input.phone);
  const today = dayStartBR(now).getTime() + 86_400_000;
  if (s === "A_AGENDAR") Object.assign(out, { scheduledAt: input.scheduledAt && isoDay(input.scheduledAt) ? brDate(input.scheduledAt) : null, shippedAt: null, deliveredAt: null, receivedBy: null });
  if (s === "AGENDADA" || s === "EM_ROTA" || s === "ENTREGUE") {
    if (s === "AGENDADA" && !(input.scheduledAt && isoDay(input.scheduledAt))) return { error: "Informe a data agendada." } as const;
    out.scheduledAt = input.scheduledAt && isoDay(input.scheduledAt) ? brDate(input.scheduledAt) : null;
  }
  if (s === "AGENDADA") Object.assign(out, { shippedAt: null, deliveredAt: null, receivedBy: null });
  if (s === "EM_ROTA") Object.assign(out, { shippedAt: input.shippedAt && isoDay(input.shippedAt) ? brDate(input.shippedAt) : current.shippedAt ?? now, deliveredAt: null, receivedBy: null });
  if (s === "ENTREGUE") {
    if (!(input.deliveredAt && isoDay(input.deliveredAt))) return { error: "Informe a data da entrega." } as const;
    const d = brDate(input.deliveredAt);
    if (d.getTime() >= today) return { error: "A data da entrega não pode ser futura." } as const;
    Object.assign(out, { deliveredAt: d, receivedBy: t(input.receivedBy), shippedAt: current.shippedAt ?? (input.shippedAt && isoDay(input.shippedAt) ? brDate(input.shippedAt) : d) });
  }
  return { data: out } as const;
}

export function deliverySummary(rows: { status: DeliveryStatusKey; promisedAt: Date | null; scheduledAt: Date | null; deliveredAt: Date | null }[], now = new Date()) {
  const n = (s: DeliveryStatusKey) => rows.filter((r) => r.status === s).length;
  const monthKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(d);
  const delivered = rows.filter((r) => r.status === "ENTREGUE" && r.deliveredAt);
  const onTime = delivered.filter((r) => r.promisedAt && dayStartBR(r.deliveredAt!).getTime() <= dayStartBR(r.promisedAt).getTime()).length;
  const withPromise = delivered.filter((r) => r.promisedAt).length;
  return {
    aAgendar: n("A_AGENDAR"), agendadas: n("AGENDADA"), emRota: n("EM_ROTA"), entregues: n("ENTREGUE"),
    late: rows.filter((r) => isLate(r, now)).length,
    deliveredThisMonth: delivered.filter((r) => monthKey(r.deliveredAt!) === monthKey(now)).length,
    onTimePct: withPromise ? Math.round((onTime / withPromise) * 1000) / 10 : null,
  };
}
