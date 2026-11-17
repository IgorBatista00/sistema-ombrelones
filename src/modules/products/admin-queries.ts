import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUnitPrices } from "@/modules/pricing";
import { cubicMeters, marginBps, principalOf } from "./cost";

export interface AdminProductFilters {
  q?: string;
  categoria?: string;
  status?: "ativo" | "inativo" | "arquivado" | "";
  cor?: string;
  alerta?: "sem-foto" | "sem-fornecedor" | "sem-preco" | "sem-custo" | "margem-baixa" | "";
}
export const LOW_MARGIN_BPS = 1500; // abaixo de 15% → alerta

/** Lista do painel: mesma consulta para a tela e para o Excel exportado. */
export async function listAdminProducts(f: AdminProductFilters) {
  const and: Prisma.ProductWhereInput[] = [];
  if (f.status === "arquivado") and.push({ deletedAt: { not: null } });
  else {
    and.push({ deletedAt: null });
    if (f.status === "ativo") and.push({ isActive: true });
    if (f.status === "inativo") and.push({ isActive: false });
  }
  if (f.categoria) and.push({ categoryId: f.categoria });
  if (f.cor) and.push({ color: f.cor });
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({ OR: [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { category: { name: { contains: q, mode: "insensitive" } } },
      { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
      { suppliers: { some: { isPrincipal: true, supplier: { OR: [{ legalName: { contains: q, mode: "insensitive" } }, { tradeName: { contains: q, mode: "insensitive" } }] } } } },
    ] });
  }
  const products = await db.product.findMany({
    where: { AND: and },
    include: {
      category: { select: { name: true } },
      images: { orderBy: { position: "asc" }, take: 1 },
      packages: true,
      variants: { orderBy: { position: "asc" }, select: { id: true, sku: true, stock: true } },
      suppliers: { include: { supplier: { select: { legalName: true, tradeName: true, cnpj: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });
  const prices = await getUnitPrices(products.map((p) => p.variants[0]?.id).filter(Boolean) as string[]);

  const rows = products.map((p) => {
    const principal = principalOf(p.suppliers);
    const price = p.variants[0] ? prices.get(p.variants[0].id) ?? null : null;
    const margin = marginBps(price, p.costFinalCents);
    const free = p.variants.reduce((a, v) => a + Math.max(0, (v.stock?.onHand ?? 0) - (v.stock?.reserved ?? 0)), 0);
    const alerts: string[] = [];
    if (!p.images.length) alerts.push("Sem foto");
    if (!p.suppliers.length) alerts.push("Sem fornecedor");
    if (price == null) alerts.push("Sem preço");
    if (p.costFinalCents == null || (principal && principal.costCents == null)) alerts.push("Sem custo");
    if (margin != null && margin < LOW_MARGIN_BPS) alerts.push("Margem baixa");
    return {
      id: p.id, code: p.code, name: p.name, slug: p.slug, color: p.color, category: p.category.name,
      image: p.images[0]?.url ?? null, isActive: p.isActive, archived: !!p.deletedAt, isFeatured: p.isFeatured,
      supplier: principal ? principal.supplier.tradeName ?? principal.supplier.legalName : null,
      supplierCnpj: principal?.supplier.cnpj ?? null, supplierCostCents: principal?.costCents ?? null, supplierIpiBps: principal?.ipiBps ?? null,
      costFinalCents: p.costFinalCents, priceCents: price, marginBps: margin,
      cubage: cubicMeters(p.packages), freeStock: free, skus: p.variants.map((v) => v.sku), alerts,
    };
  });
  const ALERT_LABEL: Record<string, string> = { "sem-foto": "Sem foto", "sem-fornecedor": "Sem fornecedor", "sem-preco": "Sem preço", "sem-custo": "Sem custo", "margem-baixa": "Margem baixa" };
  const wanted = f.alerta ? ALERT_LABEL[f.alerta] : undefined;
  const filtered = wanted ? rows.filter((r) => r.alerts.includes(wanted)) : rows;
  return filtered;
}
export type AdminProductRow = Awaited<ReturnType<typeof listAdminProducts>>[number];

export async function getColorOptions() {
  const rows = await db.product.findMany({ where: { color: { not: null }, deletedAt: null }, select: { color: true }, distinct: ["color"], orderBy: { color: "asc" } });
  return rows.map((r) => r.color!);
}
