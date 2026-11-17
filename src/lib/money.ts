const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBRL = (cents: number) => brl.format(cents / 100);

export const formatMm = (mm?: number | null) =>
  mm == null ? null : mm >= 1000 ? `${(mm / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m` : `${mm / 10} cm`;
export const formatKg = (g?: number | null) =>
  g == null ? null : `${(g / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
