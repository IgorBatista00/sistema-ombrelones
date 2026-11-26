import type { ClientOption } from "./service";
import { installmentPlan, quoteTotals, type STATUS_LABEL } from "./totals";

// ------------------------------------------------------------------ tipos
export type ClientData = Omit<ClientOption, "id" | "key" | "kind" | "code" | "tradeName">;
export interface CommercialData { professional: string; seller: string; manager: string; mobile: string; email: string }
export interface SheetItem {
  id?: string; variantId: string; imageUrl: string | null; name: string; fabricLine: string; paint: string; measures: string; finish: string; cordage: string; itemNotes: string;
  quantity: string; unitPrice: string; unitDiscount: string; unitCostCents: number | null; weightG: number | null; cubageM3: number | null;
}
export interface SheetData {
  id: string | null; code: string | null; status: keyof typeof STATUS_LABEL; companyId: string; clientId: string; category: string; client: ClientData; commercial: CommercialData;
  issuedAt: string; validDays: number; deliveryDays: string; orderNumber: string; paymentTerms: string; installmentPlan: string; installmentValues: (number | null)[]; notes: string;
  freightTerm: "COTAR" | "CIF" | "FOB"; freight: string; extraDiscount: string; items: SheetItem[];
}
export interface CompanyHeader { brandName: string; legalName: string | null; cnpj: string | null; address: string | null; logoUrl?: string | null }

export const EMPTY_CLIENT: ClientData = { name: "", cpf: "", cnpj: "", ie: "", address: "", city: "", cep: "", contact: "", mobile: "", email: "", site: "", birthday: "", delivery: "" };
export const emptyItem = (): SheetItem => ({ variantId: "", imageUrl: null, name: "", fabricLine: "", paint: "", measures: "", finish: "", cordage: "", itemNotes: "", quantity: "1", unitPrice: "", unitDiscount: "", unitCostCents: null, weightG: null, cubageM3: null });
export const toMoneyIn = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
const cents = (s: string) => { const t = (s ?? "").trim().replace(/[R$\s]/g, ""); if (!t) return 0; const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t); return Number.isFinite(n) ? Math.round(n * 100) : 0; };

export function sheetTotals(d: SheetData) {
  return quoteTotals(d.items.filter((i) => i.variantId).map((i) => ({ quantity: parseInt(i.quantity) || 0, unitPriceCents: cents(i.unitPrice), unitDiscountCents: cents(i.unitDiscount), unitCostCents: i.unitCostCents, weightG: i.weightG, cubageM3: i.cubageM3 })),
    { extraDiscountCents: cents(d.extraDiscount), freightTerm: d.freightTerm, freightCents: cents(d.freight) });
}


/** Parcelas da folha: datas pelo texto do parcelamento; valores fixados por parcela (o resto é automático). */
export function sheetInstallments(d: SheetData, totalCents: number) {
  return installmentPlan(totalCents, d.installmentPlan, new Date(d.issuedAt + "T12:00:00Z"), d.installmentValues);
}
