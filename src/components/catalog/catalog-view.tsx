import Link from "next/link";
import { z } from "zod";
import { getViewer } from "@/modules/auth/session";
import { getFacets, listCategories, listProducts } from "@/modules/catalog/queries";
import { ProductCard } from "@/components/catalog/product-card";
import { CatalogFilters } from "@/components/catalog/filters";

const OPENINGS = ["MANIVELA", "MANUAL", "ALAVANCA", "AUTOMATICA", "OUTRO"] as const;
export const catalogParamsSchema = z.object({
  q: z.string().max(80).optional(),
  categoria: z.string().max(80).optional(),
  dimensao: z.string().max(40).optional(),
  cor: z.string().max(40).optional(),
  abertura: z.enum(OPENINGS).optional().catch(undefined),
  disponibilidade: z.enum(["in_stock", "made_to_order"]).optional().catch(undefined),
  ordem: z.enum(["name", "price_asc", "price_desc"]).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).max(500).optional().catch(1),
});
export type CatalogParams = z.infer<typeof catalogParamsSchema>;

/** Listagem do catálogo — usada em /produtos (todos) e /categorias/<slug> (categoria fixa). */
export async function CatalogView({ sp, category }: { sp: CatalogParams; category?: { slug: string; name: string; description: string | null } }) {
  const viewer = await getViewer();
  const basePath = category ? `/categorias/${category.slug}` : "/produtos";
  const [categories, facets, result] = await Promise.all([
    listCategories(),
    getFacets(),
    listProducts(
      { q: sp.q, category: category?.slug, size: sp.dimensao, color: sp.cor, opening: sp.abertura, availability: sp.disponibilidade, sort: sp.ordem, page: sp.pagina },
      viewer.canSeePrices,
    ),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageHref = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v != null && k !== "pagina" && k !== "categoria").map(([k, v]) => [k, String(v)]));
    if (p > 1) q.set("pagina", String(p));
    return `${basePath}${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="container py-10 md:py-16">
      <header className="mb-10 md:mb-14">
        <nav aria-label="Trilha" className="label mb-4">
          <Link href="/">Início</Link> / {category ? <><Link href="/produtos">Produtos</Link> / {category.name}</> : "Produtos"}
        </nav>
        <h1 className="text-4xl md:text-5xl">{category?.name ?? "Todos os produtos"}</h1>
        {category?.description && <div className="mt-4 max-w-3xl space-y-2 text-base leading-relaxed text-muted">{category.description.split(/\n{2,}/).map((t, i) => <p key={i} className="whitespace-pre-line">{t}</p>)}</div>}
        <p className="mt-3 text-sm text-muted">{result.total} {result.total === 1 ? "produto" : "produtos"}</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-14">
        <CatalogFilters
          categories={categories.map((c) => ({ value: c.slug, label: c.name }))}
          facets={facets}
          values={{ ...sp, categoria: category?.slug }}
          canSortByPrice={viewer.canSeePrices}
          basePath={basePath}
        />
        <div>
          {result.items.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="font-display text-2xl">Nenhum produto encontrado</p>
              <p className="mt-2 text-sm text-muted">Ajuste os filtros ou <Link className="link" href="/produtos">veja todos os produtos</Link>.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6">
              {result.items.map((p) => <ProductCard key={p.id} p={p} locked={!viewer.canSeePrices} />)}
            </div>
          )}

          {totalPages > 1 && (
            <nav aria-label="Paginação" className="mt-16 flex items-center justify-center gap-2 text-sm">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link key={p} href={pageHref(p)} aria-current={p === result.page ? "page" : undefined}
                  className={`flex h-10 w-10 items-center justify-center rounded ${p === result.page ? "bg-ink text-canvas" : "hover:bg-ink/5"}`}>{p}</Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

/** Indexação das listagens: filtros/busca/ordem → noindex (seguindo links) e canônico na página base; paginação → canônico próprio. */
export function listingRobots(sp: CatalogParams, basePath: string) {
  const filtered = ["q", "dimensao", "cor", "abertura", "disponibilidade", "ordem"].some((k) => (sp as Record<string, unknown>)[k]);
  const page = sp.pagina && sp.pagina > 1 ? sp.pagina : null;
  return {
    alternates: { canonical: !filtered && page ? `${basePath}?pagina=${page}` : basePath },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}
