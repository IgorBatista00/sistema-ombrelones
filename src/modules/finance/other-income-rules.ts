/** Outras receitas — regras puras. */
export const DEFAULT_CATEGORIES = ["Juros de aplicação", "Rendimentos", "Juros e multas de clientes", "Reembolsos", "Venda de sucata ou ativos", "Outras receitas"];

/** Limpa a lista de categorias: sem vazios, sem repetidas (ignorando maiúsculas), até 40, cada uma com até 60 caracteres. */
export function normalizeCategories(list: string[]) {
  const seen = new Set<string>(), out: string[] = [];
  for (const raw of list) {
    const c = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase()); out.push(c);
  }
  return out.slice(0, 40);
}

export function otherIncomeSummary(rows: { status: "PREVISTA" | "RECEBIDA"; category: string; amountCents: number; date: Date }[], now = new Date()) {
  const received = rows.filter((r) => r.status === "RECEBIDA");
  const planned = rows.filter((r) => r.status === "PREVISTA");
  const byCat = new Map<string, number>();
  for (const r of received) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amountCents);
  return {
    received: received.reduce((a, r) => a + r.amountCents, 0),
    planned: planned.reduce((a, r) => a + r.amountCents, 0),
    overduePlanned: planned.filter((r) => r.date.getTime() < now.getTime() - 86_400_000).reduce((a, r) => a + r.amountCents, 0),
    byCategory: [...byCat.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
  };
}
