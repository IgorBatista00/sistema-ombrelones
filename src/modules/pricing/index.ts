import "server-only";
import { db } from "@/lib/db";

export const DEFAULT_PRICE_LIST = "ATACADO";

/**
 * Preço vigente por variação. ÚNICA função autorizada a ler a tabela Price.
 * Chamadores devem ter verificado `viewer.canSeePrices` (ver catalog/queries).
 */
export async function getUnitPrices(variantIds: string[], priceListCode = DEFAULT_PRICE_LIST) {
  if (variantIds.length === 0) return new Map<string, number>();
  const now = new Date();
  const rows = await db.price.findMany({
    where: {
      variantId: { in: variantIds },
      priceList: { code: priceListCode },
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    orderBy: { validFrom: "desc" },
  });
  const map = new Map<string, number>();
  for (const r of rows) if (!map.has(r.variantId)) map.set(r.variantId, r.amountCents);
  return map;
}
