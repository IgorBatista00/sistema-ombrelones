import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { POLICIES } from "@/components/layout/footer";
import { clip } from "@/lib/seo";

/** Páginas institucionais: conteúdo editável no painel (Setting "page:<slug>"). Nunca texto inventado. */
type Props = { params: Promise<{ slug: string }> };

async function pageBody(slug: string) {
  const row = await db.setting.findUnique({ where: { key: `page:${slug}` } });
  return ((row?.value as { body?: string } | null)?.body ?? "").trim() || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = POLICIES.find((x) => x.slug === slug);
  if (!p) return {};
  const body = await pageBody(slug);
  // sem texto aprovado: a página existe para o cliente, mas fica fora do Google
  return { title: p.label, alternates: { canonical: `/institucional/${slug}` }, ...(body ? { description: clip(body) } : { robots: { index: false, follow: true } }) };
}

export default async function InstitutionalPage({ params }: Props) {
  const { slug } = await params;
  const meta = POLICIES.find((p) => p.slug === slug);
  if (!meta) notFound();
  const content = await pageBody(slug);
  return (
    <article className="container max-w-3xl py-14 md:py-20">
      <p className="label mb-4">Institucional</p>
      <h1 className="text-4xl md:text-5xl">{meta.label}</h1>
      <div className="mt-10 space-y-4 leading-relaxed text-muted">
        {content
          ? content.split("\n\n").map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)
          : <p>[Conteúdo pendente — cadastre o texto aprovado pelo jurídico em Admin › Configurações › Páginas institucionais.]</p>}
      </div>
    </article>
  );
}
