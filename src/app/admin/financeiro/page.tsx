import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { PageHead, Table, Td } from "@/components/admin/ui";
import { Badge, Notice } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { isPaymentConfigured } from "@/modules/integrations/payments";
import { backfillSales } from "@/modules/finance/sales";
import { financeFilterSchema, receivablesView, salesView, type FinanceFilters } from "@/modules/finance/queries";
import { SALE_LABEL, STATE_LABEL } from "@/modules/finance/receivables";
import { ReceivableActions } from "@/components/admin/finance-actions";
import { OtherIncomeRowActions, OtherIncomeToolbar } from "@/components/admin/other-income";
import { otherIncomeView } from "@/modules/finance/other-income";
import { mlConfig } from "@/modules/integrations/mercadolivre/client";
import { mlView } from "@/modules/integrations/mercadolivre/service";
import { RELEASE_LABEL } from "@/modules/integrations/mercadolivre/rules";
import { MlDisconnectButton, MlSyncButton } from "@/components/admin/ml-actions";
import { ExpenseActions, ExpenseToolbar } from "@/components/admin/expenses";
import { MlSheetImportButton } from "@/components/admin/ml-sheet-import";
import { billingFilterSchema, billingView, type BillingStep } from "@/modules/finance/billing";
import { PARCEL_STAGE_LABEL } from "@/modules/finance/billing-rules";
import { BoletoButton, InvoiceButton, PlannedMethodSelect, UndoButton } from "@/components/admin/billing";
import { expensesView } from "@/modules/finance/expenses";
import { EXPENSE_STATE_LABEL } from "@/modules/finance/expense-rules";
import { DOC_TYPES } from "@/modules/finance/document-rules";
import { orderCategoryOptions } from "@/modules/quotes/categories";

export const metadata = { title: "Financeiro" };
const d = (x: Date | null) => (x ? x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const pct = (bps: number | null) => (bps == null ? "—" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const SALE_TONE = { quitada: "success", em_aberto: "warning", em_atraso: "danger", cancelada: "neutral" } as const;
const REC_TONE = { aberto: "warning", atrasado: "danger", a_definir: "neutral", recebido: "success", cancelado: "neutral" } as const;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const METHOD_GUESS = (terms: string) => (/pix/i.test(terms) ? "Pix" : /boleto/i.test(terms) ? "Boleto" : /cart/i.test(terms) ? "Cartão de crédito" : "Pix");

function href(f: FinanceFilters, patch: Partial<FinanceFilters>) {
  const p = new URLSearchParams(); const m = { ...f, ...patch };
  for (const [k, v] of Object.entries(m)) if (v) p.set(k, String(v));
  return `/admin/financeiro?${p}`;
}
function periods() {
  const fmt = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(x);
  const now = new Date(), [y, m] = fmt(now).split("-").map(Number);
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const last = (yy: number, mm: number) => fmt(new Date(Date.UTC(yy, mm, 0, 12)));
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  return [["Este mês", first(y, m), last(y, m)], ["Mês passado", first(py, pm), last(py, pm)], ["Este ano", `${y}-01-01`, `${y}-12-31`]] as const;
}

export default async function Finance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("FINANCE");
  const { skipped } = await backfillSales();
  const raw = await searchParams;
  const f = financeFilterSchema.parse(raw);
  const tabs = [["vendas", "Vendas"], ["faturamento", "Faturamento e cobrança"], ["receber", "Contas a receber"], ["saidas", "Saídas"], ["outras", "Outras receitas"], ["mercadolivre", "Recebimentos Mercado Livre"], ["site", "Pagamentos do site"]] as const;
  return (
    <>
      <PageHead title="Financeiro" subtitle="Vendas do funil, contas a receber, saídas (contas a pagar), outras receitas, Mercado Livre e pagamentos do site" />
      {skipped.length > 0 && (
        <div className="mb-4 rounded border border-danger/40 bg-danger/5 p-3 text-sm" role="alert">
          <p className="font-medium text-danger">{skipped.length === 1 ? "1 orçamento fechado não entrou no Financeiro" : `${skipped.length} orçamentos fechados não entraram no Financeiro`}</p>
          <ul className="mt-1 space-y-0.5">{skipped.slice(0, 10).map((s) => <li key={s.id}><a className="link" href={`/admin/orcamentos/${s.id}`}>{s.code}</a> — {s.reason.replace(/\s*\(orçamento [^)]*\)$/, "")}</li>)}</ul>
          <p className="mt-1 text-xs text-muted">Abra o orçamento, ajuste as parcelas para fechar o total e salve: a venda é gerada automaticamente.</p>
        </div>
      )}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Seções do financeiro">
        {tabs.map(([k, l]) => <Link key={k} href={`/admin/financeiro?aba=${k}`} aria-current={f.aba === k ? "page" : undefined} className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${f.aba === k ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>{l}</Link>)}
      </nav>
      {f.aba === "vendas" ? <Sales f={f} /> : f.aba === "faturamento" ? <Billing sp={raw} /> : f.aba === "receber" ? <Receivables f={f} /> : f.aba === "saidas" ? <Expenses f={f} /> : f.aba === "outras" ? <OtherIncomes f={f} /> : f.aba === "mercadolivre" ? <MercadoLivre f={f} /> : <SitePayments />}
    </>
  );
}

function Filters({ f, dateLabel, children }: { f: FinanceFilters; dateLabel: string; children?: React.ReactNode }) {
  return (
    <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" role="search">
      <input type="hidden" name="aba" value={f.aba} />
      {f.venda && <input type="hidden" name="venda" value={f.venda} />}
      <label className="block min-w-[220px] max-w-md flex-1 text-xs text-muted">Buscar<Input name="q" defaultValue={f.q} placeholder={f.aba === "saidas" ? "Descrição, fornecedor ou observação" : f.aba === "outras" ? "Descrição ou observação" : f.aba === "mercadolivre" ? "Pedido ML, comprador ou produto" : "Cliente, CNPJ ou nº (ex.: NOV-0042)"} className="mt-1 h-10" /></label>
      <fieldset className="text-xs text-muted"><legend>{dateLabel}</legend>
        <div className="mt-1 flex items-center gap-1.5"><Input type="date" name="de" defaultValue={f.de} className="h-10 w-[150px]" aria-label={`${dateLabel} de`} /><span>até</span><Input type="date" name="ate" defaultValue={f.ate} className="h-10 w-[150px]" aria-label={`${dateLabel} até`} /></div>
        <div className="mt-1.5 flex gap-3">{periods().map(([l, a, b]) => <Link key={l} className="link" href={href(f, { de: a, ate: b })}>{l}</Link>)}</div>
      </fieldset>
      {children}
      <div className="flex gap-2"><Button type="submit" className="h-10">Filtrar</Button>{(f.q || f.de || f.ate || f.situacao || f.venda || f.categoria || f.liberacao || f.pedido) && <Link href={`/admin/financeiro?aba=${f.aba}`} className="inline-flex h-10 items-center rounded px-3 text-sm hover:bg-ink/5">Limpar</Link>}</div>
    </form>
  );
}
function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return <div className="card p-4"><p className="label">{label}</p><p className={`mt-1 text-xl font-medium ${tone === "danger" ? "text-danger" : ""}`}>{value}</p>{hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}</div>;
}

/** Filtro pela categoria interna do pedido (escolhida no "Novo orçamento"). */
async function OrderCategoryFilter({ value }: { value?: string }) {
  const opts = await orderCategoryOptions();
  return <label className="block text-xs text-muted">Categoria do pedido<Select name="pedido" defaultValue={value ?? ""} className="mt-1 h-10"><option value="">Todas</option>{opts.map((c) => <option key={c} value={c}>{c}</option>)}<option value="sem">Sem categoria</option></Select></label>;
}

async function Sales({ f }: { f: FinanceFilters }) {
  const { rows, kpis: k, forecast, othersReceived, othersPlanned } = await salesView(f);
  const max = Math.max(1, ...forecast.map((x) => x.cents));
  return (
    <>
      <Filters f={f} dateLabel="Data da venda (fechamento)">
        <OrderCategoryFilter value={f.pedido} />
        <label className="block text-xs text-muted">Situação<Select name="situacao" defaultValue={f.situacao ?? ""} className="mt-1 h-10"><option value="">Todas</option>{Object.entries(SALE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
      </Filters>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Vendas fechadas" value={formatBRL(k.revenue)} hint={`${k.salesCount} venda(s)${k.avgTicket ? ` · ticket médio ${formatBRL(k.avgTicket)}` : ""}`} />
        <Kpi label="Margem bruta estimada" value={pct(k.grossMarginBps)} hint={k.cost == null ? "Sem custo cadastrado" : `CMV ${formatBRL(k.cost)} (custo médio)`} />
        <Kpi label={f.de || f.ate ? "Recebido no período" : "Recebido"} value={formatBRL(k.received + othersReceived)} hint={othersReceived ? `Vendas ${formatBRL(k.received)} · outras receitas ${formatBRL(othersReceived)}` : "Parcelas de vendas"} />
        <Kpi label="A receber (carteira)" value={formatBRL(k.toReceive)} hint={`Próx. 7 dias ${formatBRL(k.next7)}${k.undefinedDue ? ` · a definir ${formatBRL(k.undefinedDue)}` : ""}`} />
      </div>
      {k.overdue > 0 && <div className="mb-3"><Notice tone="danger" title={`Em atraso: ${formatBRL(k.overdue)}`}><Link className="link" href="/admin/financeiro?aba=receber&situacao=atrasado">Ver parcelas em atraso</Link></Notice></div>}
      <div className="card mb-5 p-4">
        <p className="label mb-3">Previsão de recebimento (parcelas em aberto{othersPlanned ? " + outras receitas previstas" : ""} · atrasadas entram no mês atual)</p>
        <div className="grid grid-cols-6 items-end gap-3" style={{ height: 120 }}>
          {forecast.map((x) => { const [y, m] = x.month.split("-").map(Number); return (
            <div key={x.month} className="flex h-full flex-col justify-end text-center text-xs">
              <span className="mb-1 text-[11px]">{x.cents ? formatBRL(x.cents) : "—"}</span>
              <div className="rounded-t bg-[#2f6b45]/80" style={{ height: `${Math.max(2, (x.cents / max) * 70)}px` }} />
              <span className="mt-1 text-muted">{MONTHS[m - 1]}/{String(y).slice(2)}</span>
            </div>); })}
        </div>
      </div>
      <Table head={["Venda", "Nº", "Cliente", "Pagamento", "Total", "Recebido", "Saldo", "Situação", "NF / anexos", ""]} empty={rows.length === 0}>
        {rows.map((s) => (
          <tr key={s.id} className={s.status === "CANCELADA" ? "text-muted line-through decoration-ink/30" : ""}>
            <Td>{d(s.closedAt)}</Td>
            <Td><Link className="link font-medium" href={`/admin/financeiro/venda/${s.id}`}>{s.code}</Link></Td>
            <Td className="max-w-52 truncate">{s.clientName}<div className="text-xs text-muted">{[s.category, s.seller && `Vendedor: ${s.seller}`].filter(Boolean).join(" · ") || "\u00a0"}</div></Td>
            <Td className="max-w-44 truncate">{s.paymentTerms}<div className="text-xs text-muted">{s.receivables.filter((r) => r.status !== "CANCELADO").length || s.receivables.length} parcela(s)</div></Td>
            <Td>{formatBRL(s.totalCents)}</Td>
            <Td>{formatBRL(s.sum.received)}</Td>
            <Td className={s.sum.overdue ? "text-danger" : ""}>{formatBRL(s.sum.open)}</Td>
            <Td><Badge tone={SALE_TONE[s.sum.state]}>{SALE_LABEL[s.sum.state]}</Badge><div className="mt-0.5 text-xs text-muted">margem {pct(s.sum.marginBps)}</div></Td>
            <Td className="text-xs">{s.documents.some((x) => x.type === "NOTA_FISCAL") ? <span className="text-success">NF anexada</span> : s.status === "ATIVA" ? <span className="text-danger">Sem NF</span> : "—"}<div className="text-muted">{s.documents.length} anexo(s){s._count.notes ? ` · ${s._count.notes} obs.` : ""}</div></Td>
            <Td className="text-xs"><Link className="link" href={`/admin/financeiro/venda/${s.id}`}>Abrir</Link></Td>
          </tr>
        ))}
      </Table>
      <p className="mt-3 text-xs text-muted">As vendas entram aqui automaticamente quando o orçamento vai para <Link className="link" href="/admin/funil">Fechados</Link> no funil. Se o orçamento for reaberto ou perdido, a venda é cancelada (o sistema não deixa se já houver recebimento lançado).</p>
    </>
  );
}

async function Receivables({ f }: { f: FinanceFilters }) {
  const { rows, totals } = await receivablesView(f);
  const sale = f.venda ? await db.sale.findUnique({ where: { id: f.venda }, select: { code: true, clientName: true } }) : null;
  return (
    <>
      {sale && <div className="mb-3 text-sm">Parcelas da venda <b>{sale.code}</b> · {sale.clientName} · <Link className="link" href="/admin/financeiro?aba=receber">ver todas</Link></div>}
      <Filters f={f} dateLabel="Vencimento">
        <OrderCategoryFilter value={f.pedido} />
        <label className="block text-xs text-muted">Situação<Select name="situacao" defaultValue={f.situacao ?? ""} className="mt-1 h-10">
          <option value="">Em aberto (todas)</option><option value="atrasado">Em atraso</option><option value="aberto">A vencer</option><option value="a_definir">Vencimento a definir</option><option value="recebido">Recebidas</option><option value="cancelado">Canceladas</option><option value="todas">Todas</option>
        </Select></label>
      </Filters>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Em atraso" value={formatBRL(totals.atrasado)} tone={totals.atrasado ? "danger" : undefined} />
        <Kpi label="A vencer" value={formatBRL(totals.aberto)} />
        <Kpi label="Vencimento a definir" value={formatBRL(totals.a_definir)} hint="Ex.: parcelas “na entrega”" />
        <Kpi label="Recebido (na lista)" value={formatBRL(totals.recebido)} />
      </div>
      <Table head={["Vencimento", "Venda", "Cliente", "Parcela", "Valor", "Situação", "Recebimento", ""]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id} data-rec={`${r.sale.code} ${r.label}`}>
            <Td className={r.state === "atrasado" ? "font-medium text-danger" : ""}>{r.dueDate ? d(r.dueDate) : "A definir"}</Td>
            <Td><Link className="link" href={`/admin/financeiro/venda/${r.sale.id}`}>{r.sale.code}</Link>{r.documents.length > 0 && <div className="text-xs text-muted">{r.documents.length} anexo(s)</div>}</Td>
            <Td className="max-w-56 truncate">{r.sale.clientName}{r.sale.category && <div className="text-xs text-muted">{r.sale.category}</div>}</Td>
            <Td>{r.label}</Td>
            <Td>{formatBRL(r.amountCents)}</Td>
            <Td><Badge tone={REC_TONE[r.state]}>{STATE_LABEL[r.state]}</Badge></Td>
            <Td className="text-xs">{r.status === "RECEBIDO" ? <>{d(r.receivedAt)} · {formatBRL(r.receivedCents ?? r.amountCents)}<br /><span className="text-muted">{r.method}{r.note ? ` · ${r.note}` : ""}</span></> : "—"}</Td>
            <Td className="text-right"><ReceivableActions id={r.id} label={r.label} code={r.sale.code} client={r.sale.clientName} amountCents={r.amountCents} state={r.state} suggestedMethod={METHOD_GUESS(r.sale.paymentTerms)} /></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}

async function OtherIncomes({ f }: { f: FinanceFilters }) {
  const { rows, categories, summary: sm } = await otherIncomeView(f);
  const cats = [...new Set([...categories, ...rows.map((r) => r.category)])];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">Valores recebidos sem venda ligada — juros de aplicação, rendimentos, reembolsos e outros. Entram no “Recebido” e na previsão do Financeiro, separados das vendas (não afetam a margem).</p>
        <OtherIncomeToolbar categories={categories} />
      </div>
      <Filters f={f} dateLabel="Data">
        <label className="block text-xs text-muted">Categoria<Select name="categoria" defaultValue={f.categoria ?? ""} className="mt-1 h-10"><option value="">Todas</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select></label>
        <label className="block text-xs text-muted">Situação<Select name="situacao" defaultValue={f.situacao ?? ""} className="mt-1 h-10"><option value="">Todas</option><option value="RECEBIDA">Recebidas</option><option value="PREVISTA">Previstas</option></Select></label>
      </Filters>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label={f.de || f.ate ? "Recebido no período" : "Recebido"} value={formatBRL(sm.received)} hint={`${rows.filter((r) => r.status === "RECEBIDA").length} lançamento(s)`} />
        <Kpi label="Previsto (a receber)" value={formatBRL(sm.planned)} hint={sm.overduePlanned ? `${formatBRL(sm.overduePlanned)} com data passada — confirme o recebimento` : undefined} tone={sm.overduePlanned ? "danger" : undefined} />
        <div className="card p-4"><p className="label">Recebido por categoria</p>
          {sm.byCategory.length ? <ul className="mt-2 space-y-1 text-sm">{sm.byCategory.slice(0, 5).map((c) => <li key={c.category} className="flex justify-between gap-3"><span className="truncate">{c.category}</span><span>{formatBRL(c.cents)}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted">—</p>}
        </div>
      </div>
      <Table head={["Data", "Descrição", "Categoria", "Valor", "Situação", "Forma", ""]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id} data-income={r.description}>
            <Td>{d(r.date)}</Td>
            <Td className="max-w-72 truncate">{r.description}{r.note && <div className="text-xs text-muted">{r.note}</div>}</Td>
            <Td>{r.category}</Td>
            <Td className="font-medium">{formatBRL(r.amountCents)}</Td>
            <Td><Badge tone={r.status === "RECEBIDA" ? "success" : "warning"}>{r.status === "RECEBIDA" ? "Recebida" : "Prevista"}</Badge></Td>
            <Td className="text-muted">{r.method ?? "—"}</Td>
            <Td className="text-right"><OtherIncomeRowActions categories={categories} row={{ id: r.id, description: r.description, category: r.category, amountCents: r.amountCents, status: r.status, date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(r.date), method: r.method, note: r.note }} /></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}

/** Faturamento e cobrança: esteira das vendas do funil — a faturar → boleto a emitir → boleto emitido → recebido. */
async function Billing({ sp }: { sp: Record<string, string | undefined> }) {
  const f = billingFilterSchema.parse(sp);
  const v = await billingView(f);
  const k = v.kpis;
  const opts = await orderCategoryOptions();
  const hrefStep = (etapa: BillingStep) => `/admin/financeiro?${new URLSearchParams({ aba: "faturamento", etapa, ...(f.q ? { q: f.q } : {}), ...(f.pedido ? { pedido: f.pedido } : {}) })}`;
  const day = (x: Date | null) => (x ? x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "a definir");
  const step = (id: BillingStep, n: string, label: string, value: string, hint: string, tone?: "danger" | "warning") => (
    <Link href={hrefStep(id)} aria-current={f.etapa === id ? "step" : undefined} data-step={id}
      className={`card block p-4 transition ${f.etapa === id ? "ring-2 ring-ink" : "hover:border-ink/40"} ${tone === "danger" ? "border-danger/40 bg-danger/[0.04]" : ""}`}>
      <p className="label flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink/10 text-[10px] text-ink">{n}</span>{label}</p>
      <p className={`mt-2 text-xl font-medium ${tone === "danger" ? "text-danger" : ""}`}>{value}</p><p className="mt-0.5 text-xs text-muted">{hint}</p>
    </Link>
  );
  const parcelRow = (p: (typeof v.aEmitir)[number], action: React.ReactNode, extra?: React.ReactNode) => (
    <tr key={p.id} data-parcel={`${p.code} ${p.label}`}>
      <Td className={p.overdue ? "font-medium text-danger" : ""}>{day(p.dueDate)}{p.overdue && <div className="text-[11px]">vencida</div>}</Td>
      <Td><Link className="font-medium hover:underline" href={`/admin/financeiro/venda/${p.saleId}`}>{p.code}</Link><div className="max-w-56 truncate text-xs text-muted">{p.clientName}</div></Td>
      <Td className="text-xs">{p.label}<div className="text-muted">{p.invoiceNumber ? `NF ${p.invoiceNumber}` : <span className="text-warning">NF pendente</span>}</div></Td>
      <Td className="whitespace-nowrap">{formatBRL(p.amountCents)}</Td>
      <Td><PlannedMethodSelect receivableId={p.id} value={p.plannedMethod} fallback={p.defaultMethod} /></Td>
      <Td className="text-xs">{extra}</Td>
      <Td className="text-right">{action}</Td>
    </tr>
  );
  return (
    <>
      <p className="mb-4 max-w-4xl text-sm text-muted">Vendas fechadas nos orçamentos: informe a NF, registre os boletos das parcelas e dê baixa quando receber. Clique em cada etapa para ver a lista do que falta. (Mercado Livre e site faturam pelo próprio canal.)</p>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {step("faturar", "1", "A faturar", String(k.faturar.count), `${formatBRL(k.faturar.cents)}${k.faturar.urgent ? ` · ${k.faturar.urgent} já entregue/em rota` : ""}`, k.faturar.urgent ? "danger" : undefined)}
        {step("boletos", "2", "Boletos a emitir", String(k.boletos.count), `${formatBRL(k.boletos.cents)}${k.boletos.dueSoon ? ` · ${k.boletos.dueSoon} vencem em até 7 dias` : ""}`)}
        {step("emitidos", "3", "Boletos emitidos", String(k.emitidos.count), `${formatBRL(k.emitidos.cents)} aguardando pagamento${k.emitidos.overdue ? ` · ${k.emitidos.overdue} vencido(s)` : ""}`)}
        {step("atraso", "!", "Em atraso", formatBRL(k.atraso.cents), `${k.atraso.count} parcela(s) vencida(s)`, k.atraso.count ? "danger" : undefined)}
        {step("recebido", "4", "Recebido", formatBRL(k.recebido.cents), `${k.recebido.count} parcela(s) · ${k.recebido.from.split("-").reverse().join("/")} a ${k.recebido.to.split("-").reverse().join("/")}`)}
      </div>
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" role="search">
        <input type="hidden" name="aba" value="faturamento" /><input type="hidden" name="etapa" value={f.etapa} />
        <label className="block min-w-[220px] max-w-md flex-1 text-xs text-muted">Buscar<Input name="q" defaultValue={f.q} placeholder="Cliente, nº do pedido ou nº da NF" className="mt-1 h-10" /></label>
        <label className="block text-xs text-muted">Categoria do pedido<Select name="pedido" defaultValue={f.pedido ?? ""} className="mt-1 h-10"><option value="">Todas</option>{opts.map((c) => <option key={c} value={c}>{c}</option>)}<option value="sem">Sem categoria</option></Select></label>
        {f.etapa === "recebido" && <fieldset className="text-xs text-muted"><legend>Recebido entre</legend><div className="mt-1 flex items-center gap-1.5"><Input type="date" name="de" defaultValue={k.recebido.from} className="h-10 w-[150px]" /><span>e</span><Input type="date" name="ate" defaultValue={k.recebido.to} className="h-10 w-[150px]" /></div></fieldset>}
        <div className="flex gap-2"><Button type="submit" className="h-10">Filtrar</Button>{(f.q || f.pedido || f.de || f.ate) && <Link href={hrefStep(f.etapa).replace(/&q=[^&]*|&pedido=[^&]*/g, "")} className="inline-flex h-10 items-center px-3 text-sm text-muted hover:text-ink">Limpar</Link>}</div>
      </form>
      {v.semForma.length > 0 && f.etapa === "boletos" && <p className="mb-3 rounded border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs">{v.semForma.length} parcela(s) com <b>forma a definir</b> (ex.: “50% na entrega”): escolha a forma na venda para saber se precisa de boleto.</p>}

      {f.etapa === "faturar" && (
        <Table head={["Venda", "Cliente", "Fechada em", "Valor", "Situação", ""]} empty={v.toInvoice.length === 0}>
          {v.toInvoice.map((s) => (
            <tr key={s.id} data-to-invoice={s.code}>
              <Td><Link className="font-medium hover:underline" href={`/admin/financeiro/venda/${s.id}`}>{s.code}</Link>{s.category && <div className="text-xs text-muted">{s.category}</div>}</Td>
              <Td className="max-w-64 truncate">{s.clientName}<div className="text-xs text-muted">{s.paymentTerms}</div></Td>
              <Td>{day(s.closedAt)}<div className="text-xs text-muted">{s.days === 0 ? "hoje" : `há ${s.days} dia(s)`}</div></Td>
              <Td className="whitespace-nowrap">{formatBRL(s.totalCents)}</Td>
              <Td>{s.alert ? <Badge tone={s.alert.tone}>{s.alert.text}</Badge> : <span className="text-xs text-muted">—</span>}{s.nfAttached && <div className="mt-1 text-xs text-warning">NF anexada, falta o número</div>}</Td>
              <Td className="text-right"><InvoiceButton saleId={s.id} code={s.code} client={s.clientName} compact /></Td>
            </tr>
          ))}
        </Table>
      )}
      {f.etapa === "boletos" && (
        <Table head={["Vencimento", "Venda", "Parcela", "Valor", "Forma", "", ""]} empty={v.aEmitir.length === 0}>
          {v.aEmitir.map((p) => parcelRow(p, <BoletoButton receivableId={p.id} code={p.code} client={p.clientName} label={p.label} amount={formatBRL(p.amountCents)} due={day(p.dueDate)} compact />))}
        </Table>
      )}
      {f.etapa === "emitidos" && (
        <Table head={["Vencimento", "Venda", "Parcela", "Valor", "Forma", "Boleto", ""]} empty={v.emitidos.length === 0}>
          {v.emitidos.map((p) => parcelRow(p,
            <span className="inline-flex flex-col items-end gap-1"><ReceivableActions id={p.id} label={p.label} code={p.code} client={p.clientName} amountCents={p.amountCents} state={p.overdue ? "atrasado" : "aberto"} suggestedMethod="Boleto" /><UndoButton kind="boleto" id={p.id} label="Desfazer boleto" /></span>,
            <>{p.boletoNumber && <div className="max-w-40 truncate font-mono" title={p.boletoNumber}>{p.boletoNumber}</div>}{p.boletoDocs.map((d) => <a key={d.id} className="link block max-w-40 truncate" href={`/api/admin/financeiro/documentos/${d.id}`} target="_blank" rel="noopener">{d.fileName}</a>)}{p.boletoIssuedAt && <div className="text-muted">emitido {day(p.boletoIssuedAt)}</div>}</>))}
        </Table>
      )}
      {f.etapa === "atraso" && (
        <Table head={["Vencimento", "Venda", "Parcela", "Valor", "Forma", "Etapa", ""]} empty={v.atraso.length === 0}>
          {v.atraso.map((p) => parcelRow(p,
            p.stage === "boleto_a_emitir" ? <BoletoButton receivableId={p.id} code={p.code} client={p.clientName} label={p.label} amount={formatBRL(p.amountCents)} due={day(p.dueDate)} compact /> : <ReceivableActions id={p.id} label={p.label} code={p.code} client={p.clientName} amountCents={p.amountCents} state="atrasado" suggestedMethod={p.effective ?? "Pix"} />,
            <Badge tone={p.stage === "boleto_a_emitir" ? "danger" : "warning"}>{PARCEL_STAGE_LABEL[p.stage]}</Badge>))}
        </Table>
      )}
      {f.etapa === "recebido" && (
        <Table head={["Recebido em", "Venda", "Parcela", "Valor recebido", "Forma", "NF", ""]} empty={v.recebido.length === 0}>
          {v.recebido.map((p) => (
            <tr key={p.id}>
              <Td>{day(p.receivedAt)}</Td>
              <Td><Link className="font-medium hover:underline" href={`/admin/financeiro/venda/${p.saleId}`}>{p.code}</Link><div className="max-w-56 truncate text-xs text-muted">{p.clientName}</div></Td>
              <Td className="text-xs">{p.label}<div className="text-muted">venc. {day(p.dueDate)}</div></Td>
              <Td className="whitespace-nowrap">{formatBRL(p.receivedCents ?? p.amountCents)}</Td><Td className="text-xs">{p.method ?? "—"}</Td>
              <Td className="text-xs">{p.invoiceNumber ? `NF ${p.invoiceNumber}` : <span className="text-warning">pendente</span>}</Td><Td>{" "}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

const EXP_TONE = { paga: "success", vencida: "danger", vence_hoje: "warning", a_pagar: "neutral" } as const;
async function Expenses({ f }: { f: FinanceFilters }) {
  const situacao = f.situacao === "abertas" || f.situacao === "vencidas" || f.situacao === "pagas" ? f.situacao : undefined;
  const { rows, categories, summary: s, payees } = await expensesView({ q: f.q, de: f.de, ate: f.ate, categoria: f.categoria, situacao });
  const cats = [...new Set([...categories, ...rows.map((r) => r.category)])];
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(x);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">Custos e contas do dia a dia: lance o que vai pagar (ou já pagou), parcele ou repita todo mês, dê baixa e anexe boleto, NF ou comprovante.</p>
        <ExpenseToolbar categories={categories} payees={payees} />
      </div>
      <Filters f={f} dateLabel={situacao === "pagas" ? "Data do pagamento" : "Vencimento / pagamento"}>
        <label className="block text-xs text-muted">Categoria<Select name="categoria" defaultValue={f.categoria ?? ""} className="mt-1 h-10"><option value="">Todas</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select></label>
        <label className="block text-xs text-muted">Situação<Select name="situacao" defaultValue={situacao ?? ""} className="mt-1 h-10"><option value="">Todas</option><option value="abertas">A pagar</option><option value="vencidas">Vencidas</option><option value="pagas">Pagas</option></Select></label>
      </Filters>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="A pagar" value={formatBRL(s.open)} hint={`${s.openCount} conta(s) em aberto`} />
        <Kpi label="Vencidas" value={formatBRL(s.overdue)} hint={`${s.overdueCount} conta(s)`} tone={s.overdue ? "danger" : undefined} />
        <Kpi label="Próximos 7 dias" value={formatBRL(s.next7)} />
        <Kpi label={f.de || f.ate ? "Pago no período" : "Pago"} value={formatBRL(s.paid)} hint={`${s.paidCount} pagamento(s)`} />
      </div>
      {s.byCategory.length > 0 && (
        <div className="card mb-4 p-4"><p className="label mb-2">Pago por categoria{f.de || f.ate ? " (no período)" : ""}</p>
          <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-3">{s.byCategory.map((c) => <div key={c.category} className="flex justify-between gap-3 border-b border-line/60 py-1"><span className="truncate">{c.category}</span><span>{formatBRL(c.cents)}</span></div>)}</div></div>
      )}
      <Table head={["Vencimento", "Descrição", "Categoria", "Valor", "Situação", "Pagamento", "Anexos", ""]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id} data-expense={r.description + (r.seriesLabel ? ` ${r.seriesLabel}` : "")}>
            <Td className={r.state === "vencida" ? "font-medium text-danger" : ""}>{d(r.dueDate)}</Td>
            <Td className="max-w-72"><span className="block truncate font-medium">{r.description}{r.seriesLabel && <span className="ml-1 font-normal text-muted">{r.seriesLabel}</span>}</span><span className="block truncate text-xs text-muted">{[r.payee, r.note].filter(Boolean).join(" · ") || "\u00a0"}</span></Td>
            <Td className="text-xs">{r.category}</Td>
            <Td className="whitespace-nowrap">{formatBRL(r.amountCents)}</Td>
            <Td><Badge tone={EXP_TONE[r.state]}>{EXPENSE_STATE_LABEL[r.state]}</Badge></Td>
            <Td className="text-xs">{r.status === "PAGA" ? <>{d(r.paidAt)} · {formatBRL(r.paidCents ?? r.amountCents)}<br /><span className="text-muted">{r.method}</span></> : "—"}</Td>
            <Td className="text-xs">{r.documents.length ? r.documents.map((x) => <div key={x.id} className="max-w-[160px] truncate"><a className="link" href={`/api/admin/financeiro/saidas/documentos/${x.id}`} target="_blank" rel="noopener">{DOC_TYPES[x.type].split(" ")[0]}</a></div>) : "—"}</Td>
            <Td className="text-right"><ExpenseActions categories={categories} e={{ id: r.id, description: r.description, category: r.category, payee: r.payee, amountCents: r.amountCents, dueDay: r.dueDay, status: r.status, paidDay: r.paidAt ? day(r.paidAt) : null, paidCents: r.paidCents, method: r.method, note: r.note, seriesId: r.seriesId, seriesLabel: r.seriesLabel, documents: r.documents }} /></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}

const ML_MSG: Record<string, [string, "success" | "warning" | "danger"]> = {
  conectado: ["Conta do Mercado Livre conectada. Clique em “Sincronizar agora” para trazer os recebimentos.", "success"],
  negado: ["A autorização foi cancelada no Mercado Livre.", "warning"],
  invalido: ["Não foi possível confirmar a conexão (link expirado ou aberto em outra sessão). Tente conectar de novo.", "danger"],
  erro: ["O Mercado Livre não concluiu a conexão. Tente novamente em instantes.", "danger"],
  pendente: ["A integração ainda não está configurada (veja os passos abaixo).", "warning"],
};
const RELEASE_TONE = { liberado: "success", a_liberar: "warning", sem_info: "neutral", estornado: "danger" } as const;

/** Recebimentos do Mercado Livre — integração automática (OAuth). Valores só nesta aba (não entram nos totais do Financeiro). */
async function MercadoLivre({ f }: { f: FinanceFilters }) {
  const cfg = mlConfig();
  const { connection: c, rows, summary: s, breakdown, categoryOptions } = await mlView({ q: f.q, de: f.de, ate: f.ate, liberacao: f.liberacao, categoria: f.categoria });
  const catName = f.categoria ? categoryOptions.find((o) => o.id === f.categoria)?.name ?? f.categoria : null;
  const totalRevenue = breakdown.reduce((a, r) => a + r.revenueCents, 0);
  const flash = f.ml ? ML_MSG[f.ml] : null;
  return (
    <>
      {flash && <div className="mb-4"><Notice tone={flash[1]}>{flash[0]}</Notice></div>}
      <section className="card mb-5 p-4">
        {!cfg.configured ? (
          <div className="text-sm">
            <div className="flex flex-wrap items-center gap-2"><Badge tone="warning">Integração pendente</Badge><span className="text-muted">Faltam as credenciais: {cfg.missing.join(", ")}.</span></div>
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              <li>No portal de desenvolvedores do Mercado Livre (developers.mercadolivre.com.br), crie um aplicativo com a sua conta de vendedor.</li>
              <li>Cadastre como URL de retorno (redirect URI): <code className="rounded bg-ink/5 px-1">{cfg.redirectUri}</code></li>
              <li>Copie o Client ID e o Client Secret para MERCADOLIVRE_CLIENT_ID e MERCADOLIVRE_CLIENT_SECRET no servidor, e gere a APP_ENCRYPTION_KEY (<code className="rounded bg-ink/5 px-1">openssl rand -base64 32</code>).</li>
              <li>Volte aqui e clique em “Conectar conta do Mercado Livre”.</li>
            </ol>
          </div>
        ) : !c ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div><Badge tone="neutral">Não conectado</Badge> <span className="ml-2 text-muted">Autorize o acesso de leitura aos seus pedidos e pagamentos do Mercado Livre.</span></div>
            <a href="/api/admin/integracoes/mercadolivre/conectar" className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink">Conectar conta do Mercado Livre</a>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <Badge tone="success">Conectado</Badge> <span className="ml-2 font-medium">{c.nickname ?? `Vendedor ${c.sellerId}`}</span>
              <p className="mt-1 text-xs text-muted">Conectado em {d(c.connectedAt)} · última sincronização: {c.lastSyncAt ? c.lastSyncAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "ainda não sincronizado"}</p>
              {c.lastSyncError && <p className="mt-1 text-xs text-danger">{c.lastSyncError}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-4"><MlSyncButton /><MlDisconnectButton /></div>
          </div>
        )}
      </section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">{c ? "Também dá para importar a planilha de vendas exportada pelo Mercado Livre (útil para períodos antigos)." : "Enquanto a integração direta não está ligada, importe a planilha de vendas exportada pelo Mercado Livre. Quando conectar, a integração substitui o que veio da planilha, sem duplicar."}</p>
        <MlSheetImportButton />
      </div>
      <Filters f={f} dateLabel="Data da venda">
        <label className="block text-xs text-muted">Categoria do anúncio<Select name="categoria" defaultValue={f.categoria ?? ""} className="mt-1 h-10 max-w-64"><option value="">Todas</option>{categoryOptions.map((o) => <option key={o.id} value={o.id} title={o.path}>{o.name}</option>)}</Select></label>
        <label className="block text-xs text-muted">Liberação<Select name="liberacao" defaultValue={f.liberacao ?? ""} className="mt-1 h-10"><option value="">Todas</option>{Object.entries(RELEASE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
      </Filters>
      {catName && <p className="mb-2 text-xs text-muted">Filtrando por <b>{catName}</b>: os indicadores e a lista abaixo mostram os pagamentos dos pedidos que têm anúncio dessa categoria (valor do pedido inteiro). O valor exato da categoria está no quadro “Vendas por categoria de anúncio”.</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Vendas (bruto)" value={formatBRL(s.gross)} hint={`${s.count} pagamento(s) aprovado(s)`} />
        <Kpi label="Tarifas Mercado Livre" value={formatBRL(s.fees)} />
        <Kpi label={s.netEstimated ? "Líquido (parte estimada)" : "Líquido"} value={formatBRL(s.net)} hint={s.netEstimated ? "Sem líquido do Mercado Pago: bruto − tarifa" : undefined} />
        <Kpi label="A liberar" value={formatBRL(s.toRelease)} />
        <Kpi label="Liberado" value={formatBRL(s.released)} hint={s.refunded ? `${s.refunded} devolvido(s)/estornado(s)` : undefined} />
      </div>
      <section className="card mb-5 overflow-x-auto">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
          <p className="label">Vendas por categoria de anúncio{catName ? ` · filtrado: ${catName}` : ""}</p>
          <p className="text-xs text-muted">Faturamento = preço unitário × quantidade dos anúncios (sem frete), pedidos não cancelados{f.de || f.ate ? ", no período" : ""}.</p>
        </div>
        <table className="mt-2 w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Categoria", "Pedidos", "Unidades", "Faturamento", "Participação", "Tarifas", "Ticket médio"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-2 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {breakdown.map((r) => {
              const id = r.categoryId ?? "sem", on = f.categoria === id;
              const p = new URLSearchParams({ aba: "mercadolivre" }); if (f.q) p.set("q", f.q); if (f.de) p.set("de", f.de); if (f.ate) p.set("ate", f.ate); if (f.liberacao) p.set("liberacao", f.liberacao); if (!on) p.set("categoria", id);
              return (
                <tr key={id} className={on ? "bg-ink/[0.04]" : ""} data-cat={r.name}>
                  <td className="px-4 py-2.5"><Link className="font-medium hover:underline" href={`/admin/financeiro?${p}`} title={on ? "Remover filtro" : "Filtrar por esta categoria"}>{r.name}</Link>{r.path && r.path !== r.name && <div className="max-w-80 truncate text-xs text-muted" title={r.path}>{r.path}</div>}</td>
                  <td className="px-4 py-2.5">{r.orders}</td><td className="px-4 py-2.5">{r.units}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium">{formatBRL(r.revenueCents)}</td>
                  <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded bg-ink/10"><div className="h-full bg-[#2f6b45]" style={{ width: `${Math.min(100, r.sharePct)}%` }} /></div><span className="text-xs">{r.sharePct.toLocaleString("pt-BR")}%</span></div></td>
                  <td className="whitespace-nowrap px-4 py-2.5">{formatBRL(r.feeCents)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{formatBRL(r.avgTicketCents)}</td>
                </tr>
              );
            })}
            {breakdown.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">Sem vendas para mostrar. {c ? "Sincronize para trazer os pedidos." : ""}</td></tr>}
            {breakdown.length > 1 && <tr className="font-medium"><td className="px-4 py-2.5">Total</td><td className="px-4 py-2.5">—</td><td className="px-4 py-2.5">{breakdown.reduce((a, r) => a + r.units, 0)}</td><td className="whitespace-nowrap px-4 py-2.5">{formatBRL(totalRevenue)}</td><td className="px-4 py-2.5">100%</td><td className="whitespace-nowrap px-4 py-2.5">{formatBRL(breakdown.reduce((a, r) => a + r.feeCents, 0))}</td><td /></tr>}
          </tbody>
        </table>
      </section>
      <Table head={["Venda", "Pedido ML", "Comprador", "Itens", "Categoria", "Bruto", "Tarifa", "Líquido", "Liberação"]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id} data-ml={r.orderId}>
            <Td>{d(r.saleDate)}</Td>
            <Td className="font-mono text-xs">{r.orderId}{r.packId && <div className="text-muted">pacote {r.packId}</div>}{r.paymentId.startsWith("PLAN-") && <div className="font-sans text-[10px] text-muted" data-from-sheet>via planilha</div>}</Td>
            <Td>{r.buyerNickname ?? "—"}</Td>
            <Td className="max-w-52"><span className="line-clamp-2 whitespace-normal text-xs" title={r.itemsSummary}>{r.itemsSummary}</span></Td>
            <Td className="max-w-40"><span className="line-clamp-2 whitespace-normal text-xs" title={r.categories.join(", ")}>{r.categories.join(", ") || "—"}</span></Td>
            <Td>{formatBRL(r.grossCents)}{r.shippingCents ? <div className="text-xs text-muted">frete {formatBRL(r.shippingCents)}</div> : null}</Td>
            <Td>{r.feeCents != null ? formatBRL(r.feeCents) : "—"}</Td>
            <Td>{r.netCents != null ? formatBRL(r.netCents) : <span title="Estimado: bruto − tarifa">{formatBRL(r.grossCents - (r.feeCents ?? 0))}*</span>}</Td>
            <Td><Badge tone={RELEASE_TONE[r.release]}>{RELEASE_LABEL[r.release]}</Badge>{r.releaseDate && <div className="mt-0.5 text-xs text-muted">{d(r.releaseDate)}</div>}</Td>
          </tr>
        ))}
      </Table>
      <p className="mt-3 text-xs text-muted">Valores conforme informados pela API do Mercado Livre/Mercado Pago. * Líquido estimado (bruto − tarifa) quando o Mercado Pago não informa o valor líquido; pode não incluir custos de envio cobrados do vendedor e impostos — confira no relatório de liberações do Mercado Pago. Estes valores ficam só nesta aba e não entram nos totais do Financeiro.</p>
    </>
  );
}

/** Pagamentos do site (gateway). Somente leitura: nenhuma ação manual altera a confirmação de pagamento. */
async function SitePayments() {
  const [payments, failedEvents, mismatches] = await Promise.all([
    db.payment.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { id: true, number: true, code: true, totalCents: true, company: { select: { legalName: true } } } } } }),
    db.integrationEvent.findMany({ where: { processedAt: null, error: { not: null } }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.payment.findMany({ where: { status: "PAID" }, include: { order: { select: { id: true, number: true, code: true, totalCents: true } } } }),
  ]);
  const divergent = mismatches.filter((p) => p.order.totalCents != null && p.amountCents !== p.order.totalCents);
  return (
    <>
      {!isPaymentConfigured() && <div className="mb-6"><Notice tone="warning" title="Gateway não configurado">Defina PAYMENT_PROVIDER e as chaves do Pagar.me para habilitar cobranças.</Notice></div>}
      {(failedEvents.length > 0 || divergent.length > 0) && (
        <div className="mb-6 space-y-3">
          {failedEvents.map((e) => <Notice key={e.id} tone="danger" title={`Webhook com erro · ${e.provider} · ${e.eventType}`}>{e.error} (tentativas: {e.attempts})</Notice>)}
          {divergent.map((p) => <Notice key={p.id} tone="danger" title={`Divergência no pedido nº ${p.order.code}`}>Pago {formatBRL(p.amountCents)} · total do pedido {formatBRL(p.order.totalCents!)}</Notice>)}
        </div>
      )}
      <Table head={["Data", "Pedido", "Empresa", "Meio", "Valor", "Situação", "ID provedor"]} empty={payments.length === 0}>
        {payments.map((p) => (
          <tr key={p.id}>
            <Td>{p.createdAt.toLocaleString("pt-BR")}</Td>
            <Td><Link className="link" href={`/admin/pedidos/${p.order.id}`}>{p.order.code}</Link></Td>
            <Td className="max-w-48 truncate">{p.order.company.legalName}</Td>
            <Td>{p.method}</Td>
            <Td>{formatBRL(p.amountCents)}</Td>
            <Td><Badge tone={p.status === "PAID" ? "success" : p.status === "PENDING" ? "warning" : "danger"}>{p.status}</Badge></Td>
            <Td className="text-xs text-muted">{p.externalId ?? "—"}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
