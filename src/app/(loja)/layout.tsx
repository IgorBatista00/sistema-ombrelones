import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { getSiteSettings } from "@/modules/companies/site-settings";
import { listCategories } from "@/modules/catalog/queries";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [s, categories] = await Promise.all([getSiteSettings(), listCategories()]);
  return (
    <>
      <Header brandName={s.brandName} />
      <main id="conteudo" className="flex-1">{children}</main>
      <Footer s={s} categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
    </>
  );
}
