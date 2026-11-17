import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { POLICIES } from "@/components/layout/footer";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Só páginas indexáveis e canônicas: home, catálogo, categorias, produtos e institucionais COM texto. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [products, categories, pages] = await Promise.all([
    db.product.findMany({ where: { isActive: true, deletedAt: null, category: { isActive: true } }, select: { slug: true, updatedAt: true, images: { orderBy: { position: "asc" }, take: 5, select: { url: true } } } }),
    db.category.findMany({ where: { isActive: true }, orderBy: { position: "asc" }, select: { slug: true, products: { where: { isActive: true, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } } } }),
    db.setting.findMany({ where: { key: { in: POLICIES.map((p) => `page:${p.slug}`) } } }),
  ]);
  const filled = new Set(pages.filter((r) => ((r.value as { body?: string } | null)?.body ?? "").trim()).map((r) => r.key.slice(5)));
  const abs = (u: string) => (/^https?:\/\//.test(u) ? u : `${base}${u}`);
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/produtos`, changeFrequency: "daily", priority: 0.9 },
    ...categories.map((c) => ({ url: `${base}/categorias/${c.slug}`, lastModified: c.products[0]?.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${base}/produtos/${p.slug}`, lastModified: p.updatedAt, priority: 0.7, images: p.images.map((i) => abs(i.url)) })),
    ...POLICIES.filter((p) => filled.has(p.slug)).map((p) => ({ url: `${base}/institucional/${p.slug}`, priority: 0.2 })),
  ];
}
