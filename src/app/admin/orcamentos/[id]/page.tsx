import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/session";
import { clientOptions, quoteProductOptions } from "@/modules/quotes/service";
import { companyHeader, loadSheet } from "@/modules/quotes/sheet-data";
import { QuoteEditor } from "@/components/admin/quote-editor";
import { getOrderCategories } from "@/modules/quotes/categories";

export default async function EditQuote({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("ORDERS");
  const [products, clients, company, categories] = await Promise.all([quoteProductOptions(), clientOptions(), companyHeader(), getOrderCategories()]);
  const sheet = await loadSheet((await params).id, products);
  if (!sheet) notFound();
  return <QuoteEditor key={sheet.id} products={products} clients={clients} company={company} initial={sheet} categories={categories} />;
}
