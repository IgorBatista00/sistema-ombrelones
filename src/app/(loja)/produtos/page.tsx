import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { CatalogView, catalogParamsSchema, listingRobots } from "@/components/catalog/catalog-view";

type Props = { searchParams: Promise<Record<string, string>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = catalogParamsSchema.parse(await searchParams);
  return {
    title: sp.pagina && sp.pagina > 1 ? `Catálogo de ombrelones, bases e acessórios — página ${sp.pagina}` : "Catálogo de ombrelones, bases e acessórios",
    description: "Catálogo de ombrelones centrais, laterais, com LED, bases e acessórios para empresas, com ficha técnica completa e preço de atacado para CNPJ.",
    ...listingRobots(sp, "/produtos"),
  };
}

export default async function CatalogPage({ searchParams }: Props) {
  const raw = await searchParams;
  // endereço antigo (/produtos?categoria=x) → página própria da categoria (redirecionamento permanente, 308)
  if (raw.categoria) {
    const { categoria, ...rest } = raw;
    const q = new URLSearchParams(Object.entries(rest).filter(([, v]) => v) as [string, string][]);
    permanentRedirect(`/categorias/${encodeURIComponent(categoria)}${q.size ? `?${q}` : ""}`);
  }
  return <CatalogView sp={catalogParamsSchema.parse(raw)} />;
}
