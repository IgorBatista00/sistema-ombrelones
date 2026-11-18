import { parseDocNumber } from "@/lib/doc-code";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { STATUS_LABEL, validUntil } from "@/modules/quotes/totals";
import { PageHead, Stat } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { DuplicateQuoteButton } from "@/components/admin/quote-editor";
import { orderCategoryOptions } from "@/modules/quotes/categories";

const TONE = { RASCUNHO: "neutral", EMITIDO: "warning", ENVIADO: "warning", APROVADO: "success", RECUSADO: "danger", EXPIRADO: "danger" } as const;

export default async function Quotes({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; categoria?: string }> }) {
  await requireAdminPage("ORDERS");
  const sp = await searchParams;
  const where: Prisma.QuoteWhereInput = {};
  if (sp.status && sp.status in STATUS_LABEL) where.status = sp.status as keyof typeof STATUS_LABEL;
  if (sp.categoria) where.category = sp.categoria === "sem" ? null : sp.categoria;
  const n = sp.q ? parseDocNumber(sp.q) : null;
  if (sp.q?.trim()) where.OR = [...(n ? [{ number: n }] : []), { clientSnapshot: { path: ["name"], string_contains: sp.q } }, { clientSnapshot: { path: ["name"], string_contains: sp.q.toUpperCase() } }, { code: { contains: sp.q.trim().toUpperCase() } }];
  const [quotes, all, cats] = await Promise.all([
    db.quote.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { _count: { select: { items: true } } } }),
    db.quote.groupBy({ by: ["status"], _sum: { totalCents: true }, _count: true }),
    orderCategoryOptions(),
  ]);
  const g = (s: string[]) => all.filter((x) => s.includes(x.status));
  const sum = (s: string[]) => g(s).reduce((a, x) => a + (x._sum.totalCents ?? 0), 0);
  const cnt = (s: string[]) => g(s).reduce((a, x) => a + x._count, 0);
  const decided = cnt(["APROVADO", "RECUSADO"]);
  return (
    <>
      <PageHead title="Orçamentos" subtitle="Propostas comerciais com dados e fotos do cadastro de produtos" action={<Link href="/admin/orcamentos/novo" className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink">Novo orçamento</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Em aberto" value={formatBRL(sum(["EMITIDO", "ENVIADO"]))} hint={`${cnt(["EMITIDO", "ENVIADO"])} aguardando o cliente`} />
        <Stat label="Aprovados" value={formatBRL(sum(["APROVADO"]))} hint={`${cnt(["APROVADO"])} orçamento(s)`} />
        <Stat label="Taxa de aprovação" value={decided ? `${Math.round((cnt(["APROVADO"]) / decided) * 100)}%` : "—"} hint="Aprovados ÷ (aprovados + recusados)" />
        <Stat label="Rascunhos" value={cnt(["RASCUNHO"])} hint="Ainda não emitidos" />
      </div>
      <form className="mb-4 mt-6 grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
        <Input name="q" defaultValue={sp.q} placeholder="Código (ex.: NOV-0042) ou cliente" className="h-10" aria-label="Buscar" />
        <Select name="status" defaultValue={sp.status ?? ""} className="h-10" aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Select name="categoria" defaultValue={sp.categoria ?? ""} className="h-10" aria-label="Categoria do pedido"><option value="">Todas as categorias</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}<option value="sem">Sem categoria</option></Select>
        <Button type="submit" className="h-10">Filtrar</Button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Número", "Cliente", "Categoria", "Emissão", "Validade", "Itens", "Total", "Situação", ""].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {quotes.map((q) => { const c = q.clientSnapshot as Record<string, string>; return (
              <tr key={q.id}>
                <td className="whitespace-nowrap px-4 py-2 font-medium">{q.code}</td>
                <td className="px-4 py-2">{c.name}<div className="text-xs text-muted">{c.contact}</div></td>
                <td className="px-4 py-2 text-xs">{q.category ?? <span className="text-muted">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-2">{q.issuedAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                <td className="whitespace-nowrap px-4 py-2">{validUntil(q.issuedAt, q.validDays).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                <td className="px-4 py-2">{q._count.items}</td>
                <td className="whitespace-nowrap px-4 py-2">{formatBRL(q.totalCents)}{q.freightTerm === "COTAR" && <div className="text-xs text-muted">+ frete a cotar</div>}</td>
                <td className="px-4 py-2"><Badge tone={TONE[q.status]}>{STATUS_LABEL[q.status]}</Badge></td>
                <td className="whitespace-nowrap px-4 py-2 text-xs"><span className="flex gap-3"><Link className="link" href={`/admin/orcamentos/${q.id}`}>Editar</Link>{q.status !== "RASCUNHO" && <Link className="link" href={`/orcamento/${q.id}`} target="_blank">Ver orçamento</Link>}<DuplicateQuoteButton id={q.id} /></span></td>
              </tr>); })}
          </tbody>
        </table>
        {quotes.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum orçamento.</p>}
      </div>
    </>
  );
}
