import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { formatCnpj } from "@/modules/companies/cnpj";
import { StatusBadge } from "@/components/account/status";
import { LogoutButton } from "@/components/account/account-actions";

export const metadata: Metadata = { title: "Minha conta", robots: { index: false } };

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect("/entrar?next=/minha-conta");
  const company = viewer.company;
  const [user, addresses, orders, docs] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: viewer.user.id } }),
    company ? db.address.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "asc" } }) : [],
    company ? db.order.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" }, take: 50, include: { items: { select: { productName: true, quantity: true } } } }) : [],
    company ? db.fiscalDocument.findMany({ where: { order: { companyId: company.id }, status: "AUTHORIZED" }, include: { order: { select: { number: true, code: true } } }, orderBy: { createdAt: "desc" } }) : [],
  ]);

  return (
    <div className="container py-10 md:py-16">
      <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-3">Minha conta</p>
          <h1 className="text-4xl md:text-5xl">{company?.tradeName ?? company?.legalName ?? user.name}</h1>
        </div>
        <LogoutButton />
      </div>

      <nav className="mb-12 flex gap-6 overflow-x-auto border-b border-line text-sm" aria-label="Seções">
        {[["#pedidos", "Meus pedidos"], ["#cadastro", "Meu cadastro"], ["#documentos", "Documentos"]].map(([h, l]) => <a key={h} href={h} className="-mb-px whitespace-nowrap border-b border-transparent pb-3 text-muted hover:border-ink hover:text-ink">{l}</a>)}
      </nav>

      <section id="pedidos" className="scroll-mt-28">
        <h2 className="mb-6 text-2xl">Meus pedidos</h2>
        {orders.length === 0 ? <p className="text-sm text-muted">Nenhum pedido ainda. <Link href="/produtos" className="link text-ink">Explorar produtos</Link></p> : (
          <div className="divide-y divide-line border-y border-line">
            {orders.map((o) => (
              <Link key={o.id} href={`/minha-conta/pedidos/${o.id}`} className="grid gap-2 py-5 transition-colors hover:bg-ink/[0.02] md:grid-cols-[110px_120px_1fr_auto] md:items-center md:gap-6">
                <p className="font-medium">Nº {o.code}</p>
                <p className="text-sm text-muted">{o.createdAt.toLocaleDateString("pt-BR")}</p>
                <p className="truncate text-sm text-muted">{o.items.map((i) => `${i.quantity}× ${i.productName}`).join(", ")}</p>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <StatusBadge dim="COMMERCIAL" value={o.commercialStatus} />
                  <StatusBadge dim="FINANCIAL" value={o.financialStatus} />
                  <StatusBadge dim="LOGISTIC" value={o.logisticStatus} />
                  <span className="ml-2 text-sm">{o.totalCents != null ? formatBRL(o.totalCents) : formatBRL(o.subtotalCents) + " + frete"}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="cadastro" className="mt-20 grid scroll-mt-28 gap-10 md:grid-cols-2">
        <div>
          <h2 className="mb-6 text-2xl">Meu cadastro</h2>
          <dl className="divide-y divide-line border-y border-line text-sm">
            {[
              ["Razão social", company?.legalName], ["Nome fantasia", company?.tradeName], ["CNPJ", company ? formatCnpj(company.cnpj) : null],
              ["Responsável", user.name], ["E-mail", user.email], ["Telefone", user.phone],
            ].map(([k, v]) => <div key={k} className="grid grid-cols-[140px_1fr] py-3"><dt className="text-muted">{k}</dt><dd>{v ?? "—"}</dd></div>)}
          </dl>
          <p className="mt-4 text-xs text-muted">Para alterar dados empresariais, fale com nosso comercial.</p>
        </div>
        <div>
          <h2 className="mb-6 text-2xl">Endereços</h2>
          <ul className="space-y-3 text-sm">
            {addresses.map((a) => (
              <li key={a.id} className="card p-4">
                {a.label && <p className="font-medium">{a.label}</p>}
                <p className="text-muted">{a.recipient} · {a.street}, {a.number}{a.complement && ` – ${a.complement}`} · {a.district} · {a.city}/{a.state} · CEP {a.zipCode}</p>
              </li>
            ))}
            {addresses.length === 0 && <li className="text-muted">Nenhum endereço cadastrado. Adicione no checkout.</li>}
          </ul>
        </div>
      </section>

      <section id="documentos" className="mt-20 scroll-mt-28">
        <h2 className="mb-6 text-2xl">Documentos</h2>
        {docs.length === 0 ? <p className="text-sm text-muted">Notas fiscais e comprovantes aparecem aqui após a emissão.</p> : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <span>NF-e {d.number}/{d.series} · Pedido nº {d.order.code}</span>
                <span className="flex gap-4">{d.pdfUrl && <a className="link" href={d.pdfUrl} target="_blank" rel="noopener">DANFE (PDF)</a>}{d.xmlUrl && <a className="link" href={d.xmlUrl} target="_blank" rel="noopener">XML</a>}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
