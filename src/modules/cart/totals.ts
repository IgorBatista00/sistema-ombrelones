/** Cálculo puro de totais (centavos inteiros, sem ponto flutuante). */
export interface PricedLine { unitPriceCents: number | null; quantity: number }

export function lineTotal(l: PricedLine) {
  return l.unitPriceCents == null ? null : l.unitPriceCents * l.quantity;
}

export function cartSubtotal(lines: PricedLine[]) {
  let total = 0;
  for (const l of lines) {
    const t = lineTotal(l);
    if (t == null) return null; // item sem preço vigente bloqueia o checkout
    total += t;
  }
  return total;
}
