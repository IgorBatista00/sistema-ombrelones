import Image from "next/image";
import Link from "next/link";
import { getViewer } from "@/modules/auth/session";
import { listCategories, listFeatured } from "@/modules/catalog/queries";
import { getSiteSettings } from "@/modules/companies/site-settings";
import { ProductCard } from "@/components/catalog/product-card";
import { ButtonLink } from "@/components/ui/button";
import { ImagePlaceholder, SectionTitle } from "@/components/ui/misc";
import { ArrowIcon } from "@/components/ui/icons";
import type { Metadata } from "next";
import { isPlaceholder, ldJson, siteUrl } from "@/lib/seo";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Dados da empresa para o Google — só publicados quando a marca e os dados reais estiverem cadastrados (nada inventado). */
function orgLd(s: Awaited<ReturnType<typeof getSiteSettings>>) {
  if (isPlaceholder(s.brandName)) return null;
  const contact = s.phone || s.email ? [{ "@type": "ContactPoint", contactType: "sales", areaServed: "BR", availableLanguage: "Portuguese", ...(s.phone ? { telephone: s.phone } : {}), ...(s.email ? { email: s.email } : {}) }] : undefined;
  return [
    { "@context": "https://schema.org", "@type": "Organization", name: s.brandName, url: siteUrl(), ...(s.legalName ? { legalName: s.legalName } : {}), ...(s.cnpj ? { taxID: s.cnpj } : {}), ...(s.address ? { address: s.address } : {}), ...(contact ? { contactPoint: contact } : {}) }, // logo: incluir quando o arquivo da marca existir
    { "@context": "https://schema.org", "@type": "WebSite", name: s.brandName, url: siteUrl(), inLanguage: "pt-BR" },
  ];
}

const BENEFITS = [
  { title: "Compra direta pelo site", text: "Monte seu pedido e finalize online, a qualquer hora." },
  { title: "Preços exclusivos para empresas", text: "Valores de atacado liberados após validação do CNPJ." },
  { title: "Catálogo completo", text: "Ombrelones, bases e acessórios com ficha técnica detalhada." },
  { title: "Sem pedido mínimo", text: "Compre a quantidade que sua operação precisa." },
  { title: "Atendimento comercial especializado", text: "Equipe dedicada a lojistas, distribuidores e hotelaria." },
];

export default async function HomePage() {
  const viewer = await getViewer();
  const [categories, featured, settings] = await Promise.all([listCategories(), listFeatured(viewer.canSeePrices), getSiteSettings()]);
  const locked = !viewer.canSeePrices;

  const org = orgLd(settings);
  return (
    <>
      {org && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(org) }} />}
      {/* Banner principal */}
      <section className="relative">
        <div className="relative h-[78svh] min-h-[520px] w-full overflow-hidden md:h-[86svh]">
          {/* Inserir fotografia definitiva: ombrelone em ambiente externo sofisticado (public/hero.jpg) */}
          <ImagePlaceholder label="Fotografia do banner principal pendente" className="absolute inset-0" icon={false} />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/10 to-transparent" />
          <div className="container relative flex h-full flex-col justify-end pb-14 md:pb-20">
            <div className="max-w-2xl text-canvas fade-in">
              <p className="label mb-5 text-canvas/80">Venda exclusiva para empresas</p>
              <h1 className="text-[2.6rem] leading-[1.05] md:text-6xl">Ombrelones para revenda, direto para sua empresa.</h1>
              <p className="mt-6 max-w-xl text-base text-canvas/85 md:text-lg">
                Conheça nossa linha de ombrelones, bases e acessórios. Cadastre seu CNPJ e tenha acesso aos preços exclusivos para lojistas.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/produtos" className="bg-canvas text-ink hover:bg-canvas/90">Explorar produtos</ButtonLink>
                {!viewer.user && <ButtonLink href="/cadastro" variant="secondary" className="border-canvas/80 text-canvas hover:bg-canvas hover:text-ink">Cadastrar minha empresa</ButtonLink>}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categorias */}
      <section className="container py-20 md:py-28">
        <SectionTitle eyebrow="Linhas" title="Categorias" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
          {categories.map((c) => (
            <Link key={c.id} href={`/categorias/${c.slug}`} className="group">
              <div className="relative aspect-[3/4] overflow-hidden rounded">
                {c.imageUrl
                  ? <Image src={c.imageUrl} alt={c.name} fill sizes="(min-width:768px) 25vw, 50vw" className="object-cover transition-transform duration-700 ease-soft group-hover:scale-[1.03]" />
                  : <ImagePlaceholder label={`Imagem da categoria ${c.name} pendente`} />}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <h3 className="font-sans text-sm md:text-[15px]">{c.name}</h3>
                <ArrowIcon width={16} className="text-muted transition-transform duration-300 group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Destaques */}
      {featured.length > 0 && (
        <section className="container pb-20 md:pb-28">
          <SectionTitle eyebrow="Seleção" title="Produtos em destaque" action={<Link href="/produtos" className="link hidden text-sm md:inline">Ver catálogo</Link>} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:gap-x-6">
            {featured.map((p) => <ProductCard key={p.id} p={p} locked={locked} />)}
          </div>
        </section>
      )}

      {/* Benefícios */}
      <section className="border-y border-line bg-surface">
        <div className="container grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          {BENEFITS.map((b, i) => (
            <div key={b.title}>
              <p className="font-display text-sm text-muted">0{i + 1}</p>
              <h3 className="mt-3 font-sans text-[15px]">{b.title}</h3>
              <p className="mt-2 text-sm text-muted">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sobre */}
      <section id="sobre" className="container grid gap-10 py-20 md:grid-cols-2 md:py-28">
        <div>
          <p className="label mb-3">Sobre nós</p>
          <h2 className="text-3xl md:text-4xl">{settings.brandName}</h2>
        </div>
        <div className="space-y-4 text-muted">
          {settings.about
            ? settings.about.split("\n").map((p, i) => <p key={i}>{p}</p>)
            : <p>[Texto institucional pendente — edite em Admin › Configurações › Dados empresariais.]</p>}
          {locked && <Link href="/cadastro" className="link inline-block pt-2 text-ink">Cadastre sua empresa</Link>}
        </div>
      </section>
    </>
  );
}
