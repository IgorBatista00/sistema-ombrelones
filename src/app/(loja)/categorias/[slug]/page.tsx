import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { CatalogView, catalogParamsSchema, listingRobots } from "@/components/catalog/catalog-view";
import { breadcrumbLd, categoryMetaDescription, ldJson } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> };

const getCategory = cache(async (slug: string) => {
  const c = await db.category.findFirst({ where: { slug, isActive: true } });
  if (!c) return null;
  const total = await db.product.count({ where: { categoryId: c.id, isActive: true, deletedAt: null } });
  return { ...c, total };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const c = await getCategory((await params).slug);
  if (!c) return {};
  const sp = catalogParamsSchema.parse(await searchParams);
  const title = c.seoTitle?.trim() || c.name;
  const description = categoryMetaDescription(c, c.total);
  return {
    title: sp.pagina && sp.pagina > 1 ? `${title} — página ${sp.pagina}` : title,
    description,
    openGraph: { title, description, ...(c.imageUrl ? { images: [{ url: c.imageUrl, alt: c.name }] } : {}) },
    ...listingRobots(sp, `/categorias/${c.slug}`),
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const c = await getCategory((await params).slug);
  if (!c) notFound();
  const raw = await searchParams;
  // trocou a categoria no filtro (formulário sem JavaScript) → vai para a página da outra categoria
  if (raw.categoria !== undefined && raw.categoria !== c.slug) {
    const { categoria, ...rest } = raw;
    const q = new URLSearchParams(Object.entries(rest).filter(([, v]) => v) as [string, string][]);
    permanentRedirect(`${categoria ? `/categorias/${encodeURIComponent(categoria)}` : "/produtos"}${q.size ? `?${q}` : ""}`);
  }
  const sp = catalogParamsSchema.parse(raw);
  const crumbs = breadcrumbLd([{ name: "Início", path: "/" }, { name: "Produtos", path: "/produtos" }, { name: c.name, path: `/categorias/${c.slug}` }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(crumbs) }} />
      <CatalogView sp={sp} category={{ slug: c.slug, name: c.name, description: c.description }} />
    </>
  );
}
