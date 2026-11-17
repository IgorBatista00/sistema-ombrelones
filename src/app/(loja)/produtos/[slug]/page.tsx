import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/modules/auth/session";
import { getProductBySlug, listRelated } from "@/modules/catalog/queries";
import { formatKg, formatMm } from "@/lib/money";
import { Gallery } from "@/components/product/gallery";
import { BuyBox } from "@/components/product/buy-box";
import { ProductCard } from "@/components/catalog/product-card";
import { SectionTitle } from "@/components/ui/misc";
import { absUrl, breadcrumbLd, displayTitle, ldJson, productMetaDescription } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug, false);
  if (!p) return {};
  const title = p.seoTitle?.trim() || displayTitle(p.name);
  const description = productMetaDescription({ name: p.name, seoDescription: p.seoDescription, description: p.description, categoryName: p.category.name, color: p.color, frameMaterial: p.frameMaterial });
  return {
    title, description,
    alternates: { canonical: `/produtos/${p.slug}` },
    openGraph: { type: "website", title, description, images: p.images[0] ? [{ url: p.images[0].url, alt: p.images[0].alt }] : [] },
  };
}

const OPENING: Record<string, string> = { MANIVELA: "Manivela", MANUAL: "Manual", ALAVANCA: "Alavanca", AUTOMATICA: "Automática", OUTRO: "Outro" };

export default async function ProductPage({ params }: Props) {
  const viewer = await getViewer();
  const product = await getProductBySlug((await params).slug, viewer.canSeePrices);
  if (!product) notFound();
  const related = await listRelated(product.id, product.categoryId, viewer.canSeePrices);

  const pkg = product.variants[0]?.packages ?? [];
  const specs: [string, string | null | undefined][] = [
    ["Cor / acabamento", product.color],
    ["Altura", formatMm(product.heightMm)],
    ["Comprimento", formatMm(product.lengthMm)],
    ["Diâmetro / largura", formatMm(product.diameterMm)],
    ["Profundidade", formatMm(product.depthMm)],
    ["Material da estrutura", product.frameMaterial],
    ["Tipo de abertura", product.openingType ? OPENING[product.openingType] : null],
    ["Cobertura", product.coverFeatures],
    ["Peso", formatKg(product.weightG)],
    ["Dimensões embaladas", pkg.length ? pkg.map((p) => `${p.lengthMm / 10} × ${p.widthMm / 10} × ${p.heightMm / 10} cm`).join(" · ") : null],
    ["Quantidade de volumes", pkg.length ? String(pkg.reduce((a, p) => a + p.quantity, 0)) : null],
    ["Garantia", product.warranty],
    ["Cuidados e conservação", product.careInstructions],
  ];
  const filledSpecs = specs.filter(([, v]) => v);

  // Dados estruturados SEM preço (preço é restrito a empresas validadas) — só dados reais do cadastro.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: displayTitle(product.name),
    url: absUrl(`/produtos/${product.slug}`),
    sku: product.variants[0]?.sku,
    category: product.category.name,
    image: product.images.map((i) => absUrl(i.url)),
    description: product.description ?? undefined,
    color: product.color ?? undefined,
    material: product.frameMaterial ?? undefined,
  };
  const crumbs = breadcrumbLd([{ name: "Início", path: "/" }, { name: product.category.name, path: `/categorias/${product.category.slug}` }, { name: displayTitle(product.name), path: `/produtos/${product.slug}` }]);

  return (
    <div className="container py-8 md:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(crumbs) }} />
      <nav aria-label="Trilha" className="label mb-6">
        <Link href="/produtos">Produtos</Link> / <Link href={`/categorias/${product.category.slug}`}>{product.category.name}</Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
        <Gallery images={product.images} name={product.name} />
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="label">{product.category.name}</p>
          <h1 className="mt-3 text-3xl leading-tight md:text-4xl">{product.name}</h1>
          <BuyBox
            variants={product.variants}
            locked={!viewer.canSeePrices}
            loggedIn={!!viewer.user}
            canBuy={viewer.canSeePrices && viewer.role !== "VIEWER"}
          />
          {product.description && <div className="mt-10 space-y-3 border-t border-line pt-8 text-sm leading-relaxed text-muted">{product.description.split("\n").map((p, i) => <p key={i}>{p}</p>)}</div>}
        </div>
      </div>

      <section className="mt-20 grid gap-8 border-t border-line pt-12 md:grid-cols-[1fr_2fr]">
        <h2 className="text-2xl md:text-3xl">Ficha técnica</h2>
        {filledSpecs.length === 0 ? (
          <p className="text-sm text-muted">Ficha técnica em atualização. Fale com nosso comercial para mais informações.</p>
        ) : (
          <dl className="divide-y divide-line border-y border-line text-sm">
            {filledSpecs.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[1fr_1.4fr] gap-4 py-4">
                <dt className="text-muted">{k}</dt><dd className="whitespace-pre-line">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {related.length > 0 && (
        <section className="mt-24">
          <SectionTitle title="Produtos relacionados" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:gap-x-6">
            {related.map((p) => <ProductCard key={p.id} p={p} locked={!viewer.canSeePrices} />)}
          </div>
        </section>
      )}
    </div>
  );
}
