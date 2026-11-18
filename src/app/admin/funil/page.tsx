import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { funnelCards, funnelFilterSchema } from "@/modules/quotes/service";
import { PageHead } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { QuoteKanban } from "@/components/admin/quote-kanban";
import { orderCategoryOptions } from "@/modules/quotes/categories";

export const metadata = { title: "Funil de orçamentos" };

export default async function Funnel({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("ORDERS");
  const f = funnelFilterSchema.parse(await searchParams);
  const [cards, cats] = await Promise.all([funnelCards(f), orderCategoryOptions()]);
  const filtered = !!(f.q || f.criadoDe || f.criadoAte || f.fechadoDe || f.fechadoAte || f.categoria);
  const closedFilter = !!(f.fechadoDe || f.fechadoAte);
  return (
    <>
      <PageHead title="Funil de orçamentos" subtitle="Todo orçamento salvo entra aqui. Arraste os cartões entre as colunas para fechar, perder ou reabrir."
        action={<Link href="/admin/orcamentos/novo" className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink">Novo orçamento</Link>} />
      <form className="card mb-5 grid gap-3 p-4 md:grid-cols-[1.4fr_1fr_auto_auto_auto] md:items-end" role="search">
        <label className="block text-xs text-muted">Buscar
          <Input name="q" defaultValue={f.q} placeholder="Cliente ou nº (ex.: NOV-0042)" className="mt-1 h-10" />
        </label>
        <label className="block text-xs text-muted">Categoria do pedido
          <Select name="categoria" defaultValue={f.categoria ?? ""} className="mt-1 h-10"><option value="">Todas</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}<option value="sem">Sem categoria</option></Select>
        </label>
        <fieldset className="text-xs text-muted"><legend>Data de criação</legend>
          <div className="mt-1 flex items-center gap-1.5"><Input type="date" name="criadoDe" defaultValue={f.criadoDe} className="h-10 w-[150px]" aria-label="Criado de" /><span>até</span><Input type="date" name="criadoAte" defaultValue={f.criadoAte} className="h-10 w-[150px]" aria-label="Criado até" /></div>
        </fieldset>
        <fieldset className="text-xs text-muted"><legend>Data de fechamento</legend>
          <div className="mt-1 flex items-center gap-1.5"><Input type="date" name="fechadoDe" defaultValue={f.fechadoDe} className="h-10 w-[150px]" aria-label="Fechado de" /><span>até</span><Input type="date" name="fechadoAte" defaultValue={f.fechadoAte} className="h-10 w-[150px]" aria-label="Fechado até" /></div>
        </fieldset>
        <div className="flex gap-2"><Button type="submit" className="h-10">Filtrar</Button>{filtered && <Link href="/admin/funil" className="inline-flex h-10 items-center rounded px-3 text-sm hover:bg-ink/5">Limpar</Link>}</div>
      </form>
      <QuoteKanban initial={cards} closedFilter={closedFilter} />
    </>
  );
}
