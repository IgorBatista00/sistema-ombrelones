/** Meu dia — regras puras (agregações), sem banco. */
export type DayItem = { code?: string | null; name: string; quantity: number; totalCents?: number | null; measures?: string | null; finish?: string | null };

/** Soma itens iguais (mesmo código ou, sem código, mesmo nome + medidas + acabamento). */
export function aggregateItems(items: DayItem[]) {
  const map = new Map<string, { code: string | null; name: string; measures: string | null; finish: string | null; quantity: number; totalCents: number; hasTotal: boolean }>();
  for (const i of items) {
    const key = i.code ? `c:${i.code}` : `n:${i.name}|${i.measures ?? ""}|${i.finish ?? ""}`;
    const cur = map.get(key) ?? { code: i.code ?? null, name: i.name, measures: i.measures ?? null, finish: i.finish ?? null, quantity: 0, totalCents: 0, hasTotal: false };
    cur.quantity += i.quantity; if (i.totalCents != null) { cur.totalCents += i.totalCents; cur.hasTotal = true; }
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "pt-BR"));
}

/** "2× Ombrelone X, 1× Base Y" (até `max` itens). */
export function itemsSummary(items: { name: string; quantity: number }[], max = 3) {
  const s = items.slice(0, max).map((i) => `${i.quantity}× ${i.name}`).join(", ");
  return items.length > max ? `${s} e mais ${items.length - max}` : s;
}

/** Dia (AAAA-MM-DD) válido ou hoje no fuso de Brasília; e os vizinhos para navegar. */
export function resolveDay(raw: string | undefined, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T12:00:00Z`)) ? raw : today;
  const shift = (n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  return { day, today, isToday: day === today, prev: shift(-1), next: shift(1) };
}

/** Data-alvo da entrega: agendada; sem agendamento, a prometida. */
export const deliveryTarget = (d: { scheduledAt: Date | null; promisedAt: Date | null }) => d.scheduledAt ?? d.promisedAt;
