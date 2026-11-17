import "server-only";
import { db } from "@/lib/db";
import { getSiteSettings } from "@/modules/companies/site-settings";
import { PAY_METHODS } from "./totals";
import { EMPTY_CLIENT, emptyItem, toMoneyIn, type CommercialData, type CompanyHeader, type SheetData } from "./sheet";
import type { QuoteProductOption } from "./service";

export async function companyHeader(): Promise<CompanyHeader> {
  const s = await getSiteSettings();
  return { brandName: s.brandName, legalName: s.legalName ?? null, cnpj: s.cnpj ?? null, address: s.address ?? null };
}

const today = () => new Date().toISOString().slice(0, 10);
export function newSheet(sellerName: string, category = ""): SheetData {
  return {
    id: null, code: null, status: "RASCUNHO", companyId: "", clientId: "", category, client: { ...EMPTY_CLIENT },
    commercial: { professional: "", seller: sellerName, manager: "", mobile: "", email: "" },
    issuedAt: today(), validDays: 15, deliveryDays: "", orderNumber: "", paymentTerms: PAY_METHODS[0].label, installmentPlan: PAY_METHODS[0].plan, installmentValues: [],
    notes: "", freightTerm: "FOB", freight: "", extraDiscount: "", items: [emptyItem()],
  };
}

/** Lê o orçamento salvo e devolve no formato da folha (dados congelados no momento da emissão). */
export async function loadSheet(id: string, products: Pick<QuoteProductOption, "variantId" | "unitCostCents">[] = []): Promise<SheetData | null> {
  const q = await db.quote.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" } } } });
  if (!q) return null;
  const com = (q.commercialSnapshot ?? {}) as Partial<CommercialData>;
  return {
    id: q.id, code: q.code, status: q.status, companyId: q.companyId ?? "", clientId: q.clientId ?? "", category: q.category ?? "",
    client: { ...EMPTY_CLIENT, ...(q.clientSnapshot as Record<string, string>) },
    commercial: { professional: "", seller: q.seller ?? "", manager: "", mobile: "", email: "", ...com },
    issuedAt: q.issuedAt.toISOString().slice(0, 10), validDays: q.validDays, deliveryDays: q.deliveryDays == null ? "" : String(q.deliveryDays),
    orderNumber: q.orderNumber ?? q.code, paymentTerms: q.paymentTerms, installmentPlan: q.installmentPlan ?? "", installmentValues: Array.isArray(q.installmentValues) ? (q.installmentValues as (number | null)[]) : [], notes: q.notes ?? "",
    freightTerm: q.freightTerm, freight: q.freightCents ? toMoneyIn(q.freightCents) : "", extraDiscount: q.extraDiscountCents ? toMoneyIn(q.extraDiscountCents) : "",
    items: q.items.map((i) => ({
      id: i.id, variantId: i.variantId ?? "", imageUrl: i.imageUrl, name: i.name, fabricLine: i.fabricLine ?? "", paint: i.paint ?? "", measures: i.measures ?? "",
      finish: i.finish ?? "", cordage: i.cordage ?? "", itemNotes: i.itemNotes ?? "", quantity: String(i.quantity), unitPrice: toMoneyIn(i.unitPriceCents),
      unitDiscount: i.unitDiscountCents ? toMoneyIn(i.unitDiscountCents) : "", unitCostCents: i.unitCostCents ?? products.find((p) => p.variantId === i.variantId)?.unitCostCents ?? null,
      weightG: i.weightG, cubageM3: i.cubageM3 == null ? null : Number(i.cubageM3),
    })),
  };
}
