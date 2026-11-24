import { fmtPct } from "./rules";

/** Valores do formulário de anúncio (texto, como digitado). Compartilhado entre a página (servidor) e o formulário. */
export type ListingInit = {
  id?: string; mlItemId: string; variation: string; sku: string; title: string; listingType: string; status: string; price: string; saleFeePct: string; fixedFee: string;
  shippingCost: string; packaging: string; taxPct: string; otherCost: string; notes: string; components: { variantId: string; quantity: string }[];
};
export const emptyListing = (p?: Partial<ListingInit>): ListingInit => ({ mlItemId: "", variation: "", sku: "", title: "", listingType: "", status: "ATIVO", price: "", saleFeePct: "", fixedFee: "", shippingCost: "", packaging: "", taxPct: "", otherCost: "", notes: "", components: [{ variantId: "", quantity: "1" }], ...p });


const cents = (c: number | null | undefined) => (c == null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const listingInitFrom = (l: { id: string; mlItemId: string | null; variation: string; sku: string | null; title: string; listingType: string | null; status: string; priceCents: number | null; saleFeeBps: number | null; fixedFeeCents: number | null; shippingCostCents: number | null; packagingCents: number | null; taxBps: number | null; otherCostCents: number | null; notes: string | null; components: { variantId: string; quantity: number }[] }): ListingInit => ({
  id: l.id, mlItemId: l.mlItemId ?? "", variation: l.variation, sku: l.sku ?? "", title: l.title, listingType: l.listingType ?? "", status: l.status, price: cents(l.priceCents),
  saleFeePct: fmtPct(l.saleFeeBps), fixedFee: cents(l.fixedFeeCents), shippingCost: cents(l.shippingCostCents), packaging: cents(l.packagingCents), taxPct: fmtPct(l.taxBps), otherCost: cents(l.otherCostCents), notes: l.notes ?? "",
  components: l.components.length ? l.components.map((c) => ({ variantId: c.variantId, quantity: String(c.quantity) })) : [{ variantId: "", quantity: "1" }],
});
