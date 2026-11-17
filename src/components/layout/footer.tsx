import Link from "next/link";
import type { SiteSettings } from "@/modules/companies/site-settings";
import { formatCnpj } from "@/modules/companies/cnpj";

export const POLICIES = [
  { slug: "politica-de-privacidade", label: "Política de privacidade" },
  { slug: "termos-comerciais", label: "Termos comerciais" },
  { slug: "politica-de-entrega", label: "Política de entrega" },
  { slug: "trocas-e-devolucoes", label: "Trocas e devoluções" },
];

const pending = <span className="text-muted/60">[pendente]</span>;

export function Footer({ s, categories = [] }: { s: SiteSettings; categories?: { slug: string; name: string }[] }) {
  return (
    <footer id="contato" className="mt-24 border-t border-line bg-surface">
      <div className="container grid gap-12 py-16 md:grid-cols-5">
        <div className="md:col-span-2">
          <p className="font-display text-2xl">{s.brandName}</p>
          <p className="mt-4 max-w-sm text-sm text-muted">Ombrelones, bases e acessórios para empresas.</p>
        </div>
        {categories.length > 0 && (
          <nav aria-label="Categorias">
            <p className="label mb-4">Produtos</p>
            <ul className="space-y-2 text-sm">
              {categories.map((c) => <li key={c.slug}><Link className="hover:text-muted" href={`/categorias/${c.slug}`}>{c.name}</Link></li>)}
              <li><Link className="hover:text-muted" href="/produtos">Todos os produtos</Link></li>
            </ul>
          </nav>
        )}
        <div>
          <p className="label mb-4">Contato comercial</p>
          <ul className="space-y-2 text-sm">
            <li>{s.email ? <a className="link" href={`mailto:${s.email}`}>{s.email}</a> : <>E-mail {pending}</>}</li>
            <li>{s.phone ?? <>Telefone {pending}</>}</li>
            <li>{s.whatsapp ? <a className="link" href={`https://wa.me/${s.whatsapp}`} target="_blank" rel="noopener">WhatsApp</a> : <>WhatsApp {pending}</>}</li>
            {s.businessHours && <li className="text-muted">{s.businessHours}</li>}
          </ul>
        </div>
        <div>
          <p className="label mb-4">Institucional</p>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-muted" href="/#sobre">Sobre nós</Link></li>
            {POLICIES.map((p) => <li key={p.slug}><Link className="hover:text-muted" href={`/institucional/${p.slug}`}>{p.label}</Link></li>)}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container flex flex-col gap-2 py-6 text-xs text-muted md:flex-row md:justify-between">
          <p>
            {s.legalName ?? "[RAZÃO SOCIAL]"} · CNPJ {s.cnpj ? formatCnpj(s.cnpj) : "[pendente]"}
            {s.address ? ` · ${s.address}` : " · Endereço [pendente]"}
          </p>
          <p>Venda exclusiva para pessoas jurídicas.</p>
        </div>
      </div>
    </footer>
  );
}
