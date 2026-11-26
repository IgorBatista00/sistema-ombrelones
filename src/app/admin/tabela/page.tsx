import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { PageHead } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { ORDER_LABEL, priceTable, tableFilterSchema } from "@/modules/pricing/table";
import { PRICING_LABEL } from "@/modules/pricing/markup";
import { PriceTable } from "@/components/admin/price-table";

export const metadata = { title: "Tabela" };

export default async function PriceTablePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("PRODUCTS");
  const f = tableFilterSchema.parse(await searchParams);
  const { rows, categories, counts, profiles } = await priceTable(f);
  const chip = (k: keyof typeof PRICING_LABEL | "", label: string, n?: number) => {
    const p = new URLSearchParams(); if (f.q) p.set("q", f.q); if (f.categoria) p.set("categoria", f.categoria); if (f.ordem) p.set("ordem", f.ordem); if (f.arquivados) p.set("arquivados", "1"); if (k) p.set("situacao", k);
    const on = (f.situacao ?? "") === k;
    return <Link key={k || "all"} href={`/admin/tabela?${p}`} aria-current={on ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"}`}>{label}{n != null ? ` · ${n}` : ""}</Link>;
  };
  return (
    <>
      <PageHead title="Tabela" subtitle="Escolha o markup de cada produto e atualize o preço do site. Os markups são criados na aba Markup." action={<Link href="/admin/markup" className="inline-flex h-10 items-center rounded border border-ink/70 px-4 text-sm">Gerenciar markups</Link>} />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4" role="search">
        <label className="block min-w-[220px] max-w-md flex-1 text-xs text-muted">Buscar<Input name="q" defaultValue={f.q} placeholder="Código, nome, descrição ou SKU" className="mt-1 h-10" /></label>
        <label className="block text-xs text-muted">Categoria<Select name="categoria" defaultValue={f.categoria ?? ""} className="mt-1 h-10"><option value="">Todas</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select></label>
        <label className="block text-xs text-muted">Ordenar por<Select name="ordem" defaultValue={f.ordem ?? ""} className="mt-1 h-10" data-ordem><option value="">{ORDER_LABEL.codigo}</option>{(["produto", "linha", "preco", "custo"] as const).map((k) => <option key={k} value={k}>{ORDER_LABEL[k]}</option>)}</Select></label>
        {f.situacao && <input type="hidden" name="situacao" value={f.situacao} />}
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="arquivados" value="1" defaultChecked={!!f.arquivados} />Incluir arquivados</label>
        <div className="flex gap-2"><Button type="submit" className="h-10">Filtrar</Button>{(f.q || f.categoria || f.situacao || f.arquivados || f.ordem) && <Link href="/admin/tabela" className="inline-flex h-10 items-center rounded px-3 text-sm hover:bg-ink/5">Limpar</Link>}</div>
      </form>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Situação">
        {chip("", "Todos", f.situacao ? undefined : counts.total)}{chip("desatualizado", "Preço do site diferente", f.situacao ? undefined : counts.desatualizado)}{chip("sem_markup", "Sem markup", f.situacao ? undefined : counts.sem_markup)}{chip("sem_custo", "Sem custo", f.situacao ? undefined : counts.sem_custo)}{chip("abaixo_minimo", "Abaixo da margem mínima", f.situacao ? undefined : counts.abaixo_minimo)}{chip("abaixo_custo", "Abaixo do custo", f.situacao ? undefined : counts.abaixo_custo)}{chip("ok", "Em dia", f.situacao ? undefined : counts.ok)}
      </nav>
      <form action="/api/admin/tabela/pdf" method="get" className="card mb-4 flex flex-wrap items-center gap-3 p-3 text-sm" data-pdf-form>
        <span className="font-medium">Gerar tabela em PDF</span>
        {f.q && <input type="hidden" name="q" value={f.q} />}{f.categoria && <input type="hidden" name="categoria" value={f.categoria} />}{f.situacao && <input type="hidden" name="situacao" value={f.situacao} />}{f.arquivados && <input type="hidden" name="arquivados" value="1" />}{f.ordem && <input type="hidden" name="ordem" value={f.ordem} />}
        <label className="flex items-center gap-1.5"><input type="radio" name="modo" value="clientes" defaultChecked />Para clientes <span className="text-xs text-muted">(código, produto, descrição e preço do site)</span></label>
        <label className="flex items-center gap-1.5"><input type="radio" name="modo" value="interna" />Interna <span className="text-xs text-muted">(custo, markup, preço calculado e margem)</span></label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="fotos" value="1" />Com fotos</label>
        <Button type="submit" variant="secondary" className="h-9">Baixar PDF</Button>
        <span className="w-full text-xs text-muted">O PDF segue a busca, a categoria e a ordem escolhidas acima. A versão para clientes leva só produtos ativos e com preço no site.</span>
      </form>
      <PriceTable profiles={profiles} initial={rows.map((r) => ({ id: r.id, code: r.code, name: r.name, description: r.description, category: r.category, image: r.image, isActive: r.isActive, archived: r.archived, variants: r.variants, mixedSitePrices: r.mixedSitePrices, costCents: r.costCents, markup: r.markup, profileId: r.profileId, sitePriceCents: r.sitePriceCents, state: r.state }))} />
      <p className="mt-3 text-xs text-muted">O custo final vem do cadastro do produto (custo do fornecedor principal + IPI + custos adicionais). Com um markup da aba Markup, o preço = custo final ÷ divisor (margem ideal); no modo manual, preço = custo final × multiplicador. Mudou o custo? A linha passa para “Preço do site diferente” até você atualizar. O preço só muda no site quando você clica em “Atualizar”; o histórico de preços é mantido.</p>
    </>
  );
}
