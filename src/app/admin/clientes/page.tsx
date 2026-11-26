import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { formatCnpj, normalizeCnpj } from "@/modules/companies/cnpj";
import { setCompanyStatusAction } from "@/modules/admin/actions";
import { ActionForm } from "@/components/admin/action-form";
import { PageHead } from "@/components/admin/ui";
import { Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { clientsView } from "@/modules/clients/service";
import { formatCep, formatCpf } from "@/modules/clients/rules";
import { DeleteClientButton, ImportClientsButton } from "@/components/admin/client-import";

const STATUS = { PENDING_EMAIL: ["E-mail pendente", "neutral"], ACTIVE: ["Ativa", "success"], UNDER_REVIEW: ["Em análise", "warning"], BLOCKED: ["Bloqueada", "danger"] } as const;

type SP = { q?: string; status?: string; aba?: string; pagina?: string };

export default async function Customers({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage("CUSTOMERS");
  const sp = await searchParams;
  const aba = sp.aba === "loja" ? "loja" : "cadastro";
  const tabs = (
    <nav className="mb-5 flex gap-1 border-b border-line" aria-label="Seções de clientes">
      {([["cadastro", "Cadastro de clientes"], ["loja", "Contas da loja (site)"]] as const).map(([k, l]) => (
        <Link key={k} href={`/admin/clientes${k === "loja" ? "?aba=loja" : ""}`} aria-current={aba === k ? "page" : undefined}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${aba === k ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>{l}</Link>
      ))}
    </nav>
  );
  if (aba === "cadastro") return <ClientRegistry sp={sp} tabs={tabs} />;
  const digits = sp.q ? normalizeCnpj(sp.q) : "";
  const companies = await db.company.findMany({
    where: {
      ...(sp.status && sp.status in STATUS ? { status: sp.status as keyof typeof STATUS } : {}),
      ...(sp.q ? { OR: [{ legalName: { contains: sp.q, mode: "insensitive" } }, { tradeName: { contains: sp.q, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ cnpj: { contains: digits } }] : [])] } : {}),
    },
    include: { members: { include: { user: { select: { name: true, email: true, phone: true, emailVerifiedAt: true, lastLoginAt: true } } } }, _count: { select: { orders: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  const totals = await db.order.groupBy({ by: ["companyId"], where: { companyId: { in: companies.map((c) => c.id) }, financialStatus: "PAID" }, _sum: { totalCents: true } });
  const paidBy = new Map(totals.map((t) => [t.companyId, t._sum.totalCents ?? 0]));

  return (
    <>
      <PageHead title="Clientes" subtitle="Empresas com conta na loja (login no site)" />
      {tabs}
      <form className="mb-6 flex flex-wrap gap-3">
        <input type="hidden" name="aba" value="loja" />
        <Input name="q" defaultValue={sp.q} placeholder="Razão social, fantasia ou CNPJ" className="h-10 max-w-sm" aria-label="Buscar" />
        <Select name="status" defaultValue={sp.status ?? ""} className="h-10 w-48" aria-label="Situação"><option value="">Todas</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Button type="submit" className="h-10">Filtrar</Button>
      </form>
      <div className="space-y-3">
        {companies.map((c) => (
          <details key={c.id} className="card group p-5" open={companies.length === 1}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
              <span><span className="font-medium">{c.tradeName ?? c.legalName}</span><span className="ml-3 text-sm text-muted">{formatCnpj(c.cnpj)}</span></span>
              <span className="flex items-center gap-3 text-sm"><span className="text-muted">{c._count.orders} pedidos · {formatBRL(paidBy.get(c.id) ?? 0)} pagos</span><Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge></span>
            </summary>
            <div className="mt-5 grid gap-6 border-t border-line pt-5 text-sm lg:grid-cols-3">
              <div>
                <p className="label mb-2">Cadastro</p>
                <p>{c.legalName}</p>
                <p className="text-muted">Situação Receita: {c.registrationStatus}{c.cnpjCheckedAt && ` (consultado ${c.cnpjCheckedAt.toLocaleDateString("pt-BR")})`}</p>
                {c.mainActivity && <p className="text-muted">CNAE: {c.mainActivityCode} – {c.mainActivity}</p>}
                <p className="text-muted">Cadastro: {c.createdAt.toLocaleDateString("pt-BR")}</p>
                <p className="mt-2 text-muted">Risco: {c.riskScore}{c.riskReasons.length > 0 && ` — ${c.riskReasons.join("; ")}`}</p>
                {c.blockedReason && <p className="text-danger">Motivo do bloqueio: {c.blockedReason}</p>}
              </div>
              <div>
                <p className="label mb-2">Usuários vinculados</p>
                <ul className="space-y-2">{c.members.map((m) => <li key={m.id}>{m.user.name} <span className="text-muted">· {m.role} · {m.user.email}{!m.user.emailVerifiedAt && " · e-mail não confirmado"}</span></li>)}</ul>
              </div>
              <div>
                <p className="label mb-2">Ações</p>
                <ActionForm action={setCompanyStatusAction} submit="Aplicar" className="space-y-2">
                  <input type="hidden" name="companyId" value={c.id} />
                  <Select name="status" defaultValue="" required className="h-10"><option value="" disabled>Alterar situação…</option><option value="ACTIVE">Aprovar / desbloquear</option><option value="UNDER_REVIEW">Enviar para análise</option><option value="BLOCKED">Bloquear</option></Select>
                  <Input name="reason" placeholder="Motivo (obrigatório para bloqueio)" className="h-10" />
                </ActionForm>
                <a href={`/admin/pedidos?q=${c.cnpj}`} className="link mt-3 inline-block text-xs">Histórico de compras</a>
              </div>
            </div>
          </details>
        ))}
        {companies.length === 0 && <p className="card p-8 text-center text-sm text-muted">Nenhuma empresa encontrada.</p>}
      </div>
    </>
  );
}

/** Cadastro comercial (orçamentos): importado por planilha, PF ou PJ. */
async function ClientRegistry({ sp, tabs }: { sp: SP; tabs: React.ReactNode }) {
  const page = Math.max(1, Number(sp.pagina) || 1);
  const v = await clientsView(sp.q, page);
  const href = (p: number) => `/admin/clientes?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(p > 1 ? { pagina: String(p) } : {}) })}`;
  return (
    <>
      <PageHead title="Clientes" subtitle={`${v.all} cliente(s) no cadastro · usados no “Cliente cadastrado” dos orçamentos`}
        action={<div className="flex flex-wrap gap-2"><ImportClientsButton /></div>} />
      {tabs}
      <form className="mb-5 flex flex-wrap gap-3" role="search">
        <Input name="q" defaultValue={sp.q} placeholder="Código, nome, fantasia, contato, e-mail, cidade, CNPJ ou CPF" className="h-10 max-w-md" aria-label="Buscar cliente" />
        <Button type="submit" className="h-10">Buscar</Button>
        {sp.q && <Link href="/admin/clientes" className="inline-flex h-10 items-center px-3 text-sm text-muted hover:text-ink">Limpar</Link>}
      </form>
      {v.all === 0 ? (
        <div className="card p-10 text-center text-sm">
          <p className="font-medium">Nenhum cliente cadastrado ainda.</p>
          <p className="mt-2 text-muted">Baixe o modelo, preencha com os dados dos seus clientes e use “Importar planilha”. Você confere a prévia antes de gravar.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Código", "Cliente", "CNPJ / CPF", "Contato", "Cidade", "Orçamentos", ""].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {v.rows.map((c) => (
                <tr key={c.id} data-client={c.name}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.code ?? "—"}</td>
                  <td className="max-w-80 px-4 py-2.5"><span className="font-medium">{c.name}</span>{c.tradeName && <span className="text-muted"> · {c.tradeName}</span>}
                    <div className="mt-0.5 flex flex-wrap gap-1"><Badge tone="neutral">{c.personType}</Badge>{c.hasSiteAccount && <Badge tone="success">Tem conta no site</Badge>}</div></td>
                  <td className="whitespace-nowrap px-4 py-2.5">{c.cnpj ? formatCnpj(c.cnpj) : c.cpf ? formatCpf(c.cpf) : <span className="text-muted">—</span>}{c.stateRegistration && <div className="text-xs text-muted">IE {c.stateRegistration}</div>}</td>
                  <td className="px-4 py-2.5 text-xs">{c.contactName && <div className="text-sm">{c.contactName}</div>}{[c.mobile ?? c.phone, c.email].filter(Boolean).join(" · ") || <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2.5 text-xs">{[c.city, c.state].filter(Boolean).join(" - ") || "—"}{c.zipCode && <div className="text-muted">CEP {formatCep(c.zipCode)}</div>}</td>
                  <td className="px-4 py-2.5">{c._count.quotes}</td>
                  <td className="px-4 py-2.5 text-right"><DeleteClientButton id={c.id} name={c.name} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {v.rows.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum cliente encontrado.</p>}
        </div>
      )}
      {v.pages > 1 && <nav className="mt-6 flex justify-center gap-2 text-sm" aria-label="Paginação">{Array.from({ length: v.pages }, (_, i) => i + 1).map((p) => <Link key={p} href={href(p)} aria-current={p === page ? "page" : undefined} className={`flex h-9 w-9 items-center justify-center rounded ${p === page ? "bg-ink text-canvas" : "hover:bg-ink/5"}`}>{p}</Link>)}</nav>}
    </>
  );
}
