import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { clientOptions, quoteProductOptions } from "@/modules/quotes/service";
import { companyHeader, newSheet } from "@/modules/quotes/sheet-data";
import { getOrderCategories } from "@/modules/quotes/categories";
import { QuoteEditor } from "@/components/admin/quote-editor";
import { OrderCategoriesButton } from "@/components/admin/order-categories";
import { PageHead } from "@/components/admin/ui";

/** Novo orçamento: primeiro escolhe a categoria interna do pedido; depois abre a folha já com ela. */
export default async function NewQuote({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { user } = await requireAdminPage("ORDERS");
  const sp = await searchParams;
  const categories = await getOrderCategories();
  const chosen = sp.categoria === "sem" ? "" : categories.find((c) => c === sp.categoria);
  if (chosen === undefined) {
    return (
      <>
        <PageHead title="Novo orçamento" subtitle="Escolha a categoria do pedido. Ela é só para controle interno: não aparece no orçamento impresso nem no PDF."
          action={<div className="flex gap-2"><OrderCategoriesButton categories={categories} /><Link href="/admin/orcamentos" className="inline-flex h-10 items-center rounded px-4 text-sm hover:bg-ink/5">Voltar</Link></div>} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-category-choice>
          {categories.map((c, i) => (
            <Link key={c} href={`/admin/orcamentos/novo?categoria=${encodeURIComponent(c)}`} className="card group flex items-center gap-4 p-6 transition hover:border-ink/40 hover:shadow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/5 text-sm font-medium group-hover:bg-accent group-hover:text-accent-ink">{i + 1}</span>
              <span className="text-base font-medium">{c}</span>
            </Link>
          ))}
        </div>
        <p className="mt-6 text-sm"><Link className="link text-muted" href="/admin/orcamentos/novo?categoria=sem">Continuar sem categoria</Link></p>
      </>
    );
  }
  const [products, clients, company] = await Promise.all([quoteProductOptions(), clientOptions(), companyHeader()]);
  return <QuoteEditor products={products} clients={clients} company={company} categories={categories} initial={newSheet(user.name, chosen)} />;
}
