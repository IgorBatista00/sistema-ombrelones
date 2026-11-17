import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * Dados institucionais exibidos no site, editáveis no painel (Setting "company"/"contact").
 * Sem cadastro, os campos aparecem como PENDENTES — nunca inventados.
 */
export interface SiteSettings {
  brandName: string;
  legalName: string | null;
  cnpj: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  about: string | null;
  businessHours: string | null;
}

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const rows = await db.setting.findMany({ where: { key: { in: ["company", "contact", "brand"] } } }).catch(() => []);
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value as Record<string, string>]));
  return {
    brandName: v.brand?.name ?? "[NOME DA MARCA]",
    legalName: v.company?.legalName ?? null,
    cnpj: v.company?.cnpj ?? null,
    address: v.company?.address ?? null,
    email: v.contact?.email ?? null,
    phone: v.contact?.phone ?? null,
    whatsapp: v.contact?.whatsapp ?? process.env.NEXT_PUBLIC_WHATSAPP ?? null,
    about: v.company?.about ?? null,
    businessHours: v.contact?.businessHours ?? null,
  };
});
