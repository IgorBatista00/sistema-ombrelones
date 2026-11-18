import Link from "next/link";
import { requireAdminAny } from "@/modules/auth/session";
import { purchaseOrdersForDay } from "@/modules/purchase-orders/service";
import { myDay } from "@/modules/admin/my-day";
import { itemsSummary, resolveDay } from "@/modules/admin/my-day-rules";
import { DELIVERY_STATUS } from "@/modules/deliveries/rules";
import { STATUS_LABEL } from "@/modules/quotes/totals";
import { formatBRL } from "@/lib/money";
import { Badge } from "@/components/ui/misc";
import { MlSyncButton } from "@/components/admin/ml-actions";

export const metadata = { title: "Meu dia" };

const dBR = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const hour = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

function Section({ id, title, count, action, children }: { id: string; title: string; count?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="card p-5" data-section={id}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="font-sans text-base font-medium">{title}{count && <span className="ml-2 text-sm font-normal text-muted">{count}</span>}</h2>{action}
      </div>
      {children}
    </section>
  );
}
/** Situação da integração com o Mercado Livre (a sincronização é feita sob demanda). */
function MlStatus({ ml, canSync }: { ml: { connected: boolean; nickname: string | null; lastSyncAt: Date | null; lastSyncError: string | null }; canSync: boolean }) {
  if (!ml.connected) return <p className="mb-3 text-xs text-muted" data-ml-status>Mercado Livre sem integração direta: aqui aparecem as vendas importadas por planilha em <Link className="link" href="/admin/financeiro?aba=mercadolivre">Financeiro › Recebimentos Mercado Livre</Link> (importe a do dia para vê-las).</p>;
  const when = ml.lastSyncAt ? `${ml.lastSyncAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} às ${hour(ml.lastSyncAt)}` : "nunca";
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded bg-ink/[0.03] px-3 py-2 text-xs" data-ml-status>
      <span>Mercado Livre{ml.nickname ? ` (${ml.nickname})` : ""}: atualizado {when}{ml.lastSyncError && <span className="text-danger"> · última tentativa falhou</span>}</span>
      {canSync && <MlSyncButton compact />}
    </div>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded bg-ink/[0.03] px-3 py-4 text-center text-sm text-muted">{children}</p>;
function Kpi({ label, value, hint, href, tone }: { label: string; value: string; hint?: string; href?: string; tone?: "danger" }) {
  const body = <div className={`card h-full p-4 ${tone ? "border-danger/40 bg-danger/[0.04]" : ""}`}><p className="label">{label}</p><p className={`mt-2 text-2xl ${tone ? "text-danger" : ""}`}>{value}</p>{hint && <p className="mt-1 text-xs text-muted">{hint}</p>}</div>;
  return href ? <a href={href} className="block">{body}</a> : body;
}
function ItemsTable({ items, money }: { items: { code: string | null; name: string; measures: string | null; finish: string | null; quantity: number; totalCents: number; hasTotal: boolean }[]; money?: boolean }) {
  return (
    <div className="overflow-x-auto rounded border border-line">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-ink/[0.02] text-[11px] uppercase tracking-label text-muted"><tr><th className="px-3 py-2 font-normal">Qtd</th><th className="px-3 py-2 font-normal">Item</th>{money && <th className="px-3 py-2 text-right font-normal">Valor</th>}</tr></thead>
        <tbody className="divide-y divide-line">{items.map((i, k) => (
          <tr key={k}><td className="w-16 px-3 py-2 text-base font-medium">{i.quantity}×</td>
            <td className="px-3 py-2">{i.name}{i.code && <span className="ml-1 text-xs text-muted">{i.code}</span>}{(i.measures || i.finish) && <div className="text-xs text-muted">{[i.measures, i.finish].filter(Boolean).join(" · ")}</div>}</td>
            {money && <td className="whitespace-nowrap px-3 py-2 text-right">{i.hasTotal ? formatBRL(i.totalCents) : "—"}</td>}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default async function MyDay({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const { admin } = await requireAdminAny(["DASHBOARD", "ORDERS", "LOGISTICS", "FINANCE", "STOCK"]);
  const d = resolveDay((await searchParams).data);
  const canStock = admin.permissions.includes("STOCK");
  const [m, po] = await Promise.all([myDay(d.day, admin.permissions), canStock ? purchaseOrdersForDay(d.day) : null]);
  const title = new Date(`${d.day}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const quoteTotal = m.quotes.rows.length;
  const dl = m.deliveries, toDeliverCount = dl.today.length + dl.late.length;
  const day = d.isToday ? "hoje" : "no dia";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">{d.isToday ? "Hoje" : "Dia selecionado"}</p>
          <h1 className="mt-1 font-sans text-2xl font-medium first-letter:uppercase">Meu dia · {title}</h1>
        </div>
        <nav className="flex items-center gap-1 text-sm" aria-label="Escolher dia">
          <Link href={`/admin/meu-dia?data=${d.prev}`} className="rounded px-3 py-2 hover:bg-ink/5" aria-label="Dia anterior">‹ Anterior</Link>
          {!d.isToday && <Link href="/admin/meu-dia" className="rounded bg-ink px-3 py-2 text-canvas">Hoje</Link>}
          <form className="flex items-center"><input type="date" name="data" defaultValue={d.day} className="h-9 rounded border border-line bg-white px-2" aria-label="Data" /><button className="ml-1 rounded px-2 py-2 hover:bg-ink/5">Ir</button></form>
          <Link href={`/admin/meu-dia?data=${d.next}`} className="rounded px-3 py-2 hover:bg-ink/5" aria-label="Próximo dia">Próximo ›</Link>
        </nav>
      </div>

      {/* resumo */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {m.can.sales && <Kpi label={`Vendas ${day}`} value={formatBRL(m.sales.total)} hint={`${m.sales.count} venda(s) · ${m.soldItems.reduce((a, i) => a + i.quantity, 0)} item(ns)${m.sales.ml.length ? ` · ${formatBRL(m.sales.byChannel.ml)} no Mercado Livre` : ""}`} href="#vendas" />}
        {m.can.orders && <Kpi label={`Orçamentos feitos ${day}`} value={String(quoteTotal)} hint={quoteTotal ? `${formatBRL(m.quotes.total)} orçados` : "Nenhum orçamento"} href="#orcamentos" />}
        {m.can.logistics && <Kpi label="Entregas" value={String(toDeliverCount)} hint={`${dl.today.length} para ${day} · ${dl.late.length} atrasada(s) · ${dl.delivered.length} entregue(s)${dl.undated ? ` · ${dl.undated} sem data` : ""}`} href="#entregas" tone={dl.late.length ? "danger" : undefined} />}
        {po && <Kpi label="Compras a chegar" value={String(po.today.length + po.late.length)} hint={`${po.today.length} prevista(s) para ${day} · ${po.late.length} atrasada(s) · ${po.received.length} entrega(s) recebida(s)`} href="#compras" tone={po.late.length ? "danger" : undefined} />}
        {m.can.finance && <Kpi label={`Vencendo ${day}`} value={formatBRL(m.due.receivableTotal)} hint={`a receber (${m.due.receivables.length}) · ${formatBRL(m.due.expenseTotal)} a pagar (${m.due.expenses.length})`} href="#vencimentos" />}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {m.can.sales && (
          <Section id="vendas" title={`Vendas ${day}`} count={`${m.sales.count} · ${formatBRL(m.sales.total)}`} action={<Link className="link text-xs" href={`/admin/financeiro?aba=vendas&de=${d.day}&ate=${d.day}`}>Ver no Financeiro</Link>}>
            {(m.sales.ml.length > 0 || m.sales.site.length > 0) && m.sales.rows.length + m.sales.site.length + m.sales.ml.length > 1 && (
              <p className="mb-2 text-xs text-muted" data-channels>Funil {formatBRL(m.sales.byChannel.funil)}{m.sales.site.length > 0 && ` · Site ${formatBRL(m.sales.byChannel.site)}`}{m.sales.ml.length > 0 && ` · Mercado Livre ${formatBRL(m.sales.byChannel.ml)}`}</p>
            )}
            <MlStatus ml={m.ml} canSync={m.can.finance} />
            {m.sales.count === 0 ? <Empty>Nenhuma venda fechada {day}.</Empty> : (
              <ul className="divide-y divide-line">
                {m.sales.rows.map((s) => (
                  <li key={s.id} className="py-2.5 text-sm" data-sale={s.code}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span><Link className="font-medium hover:underline" href={`/admin/financeiro/venda/${s.id}`}>{s.code}</Link> · {s.clientName}</span>
                      <span className="font-medium">{formatBRL(s.totalCents)}</span>
                    </div>
                    <p className="text-xs text-muted">{[hour(s.closedAt), s.category, s.paymentTerms, s.seller && `Vendedor: ${s.seller}`].filter(Boolean).join(" · ")}</p>
                    {s.items.length > 0 && <p className="mt-0.5 text-xs">{itemsSummary(s.items, 4)}</p>}
                  </li>
                ))}
                {m.sales.ml.map((o) => (
                  <li key={o.orderId} className="py-2.5 text-sm" data-ml-sale={o.orderId}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span><Link className="font-medium hover:underline" href={`/admin/financeiro?aba=mercadolivre&q=${o.orderId}`}>Pedido {o.orderId}</Link>{o.buyer && <> · {o.buyer}</>} <Badge tone="warning">Mercado Livre</Badge></span>
                      <span className="font-medium">{formatBRL(o.totalCents)}</span>
                    </div>
                    <p className="text-xs text-muted">{[hour(o.saleDate), o.feeCents ? `tarifa ${formatBRL(o.feeCents)}` : null, o.netCents != null ? `líquido ${formatBRL(o.netCents)}` : null].filter(Boolean).join(" · ")}</p>
                    <p className="mt-0.5 text-xs">{itemsSummary(o.items, 4)}</p>
                  </li>
                ))}
                {m.sales.site.map((o) => (
                  <li key={o.id} className="py-2.5 text-sm"><div className="flex justify-between gap-2"><span><Link className="font-medium hover:underline" href={`/admin/pedidos/${o.id}`}>{o.code}</Link> · {o.client} <Badge tone="neutral">site</Badge></span><span className="font-medium">{formatBRL(o.totalCents)}</span></div>
                    <p className="mt-0.5 text-xs">{itemsSummary(o.items, 4)}</p></li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {m.can.sales && (
          <Section id="itens-vendidos" title={`Itens vendidos ${day}`} count={m.soldItems.length ? `${m.soldItems.reduce((a, i) => a + i.quantity, 0)} unidade(s)` : undefined}>
            {m.soldItems.length === 0 ? <Empty>Nenhum item vendido {day}.</Empty> : <ItemsTable items={m.soldItems} money />}
          </Section>
        )}

        {m.can.logistics && (
          <Section id="entregas" title="Entregas" count={`${toDeliverCount} a entregar · ${dl.delivered.length} entregue(s)`} action={<Link className="link text-xs" href="/admin/entregas">Abrir Entregas</Link>}>
            {dl.undated > 0 && <p className="mb-3 rounded border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs"><Link className="link" href="/admin/entregas?situacao=A_AGENDAR">{dl.undated} entrega(s) ainda sem data</Link> — agende para aparecerem no dia certo.</p>}
            {toDeliverCount + dl.delivered.length === 0 ? <Empty>Nenhuma entrega prevista {day}.</Empty> : (
              <ul className="divide-y divide-line">
                {[...dl.late, ...dl.today, ...dl.delivered].map((x) => (
                  <li key={x.id} className="py-2.5 text-sm" data-delivery-day={x.code}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{x.code}</span><Badge tone={DELIVERY_STATUS[x.status].tone}>{DELIVERY_STATUS[x.status].label}</Badge>
                      {x.kind === "atrasada" && <Badge tone="danger">Atrasada · era {dBR(x.target)}</Badge>}
                      {x.kind === "entregue" && x.deliveredAt && <span className="text-xs text-muted">entregue às {hour(x.deliveredAt)}{x.receivedBy ? ` · recebido por ${x.receivedBy}` : ""}</span>}
                      {x.category && <span className="rounded bg-ink/[0.06] px-1.5 py-0.5 text-[11px]">{x.category}</span>}
                      {x.noInvoice && x.kind !== "entregue" && <Badge tone="danger">Sem NF</Badge>}
                    </div>
                    <p>{x.clientName}{x.phone && <span className="text-muted"> · {x.phone}</span>}</p>
                    <p className="text-xs text-muted">{[x.address, x.city && !(x.address ?? "").includes(x.city) ? x.city : null].filter(Boolean).join(" · ") || "Endereço não informado"}{x.carrier ? ` · ${x.carrier}` : ""}</p>
                    {x.items.length > 0 && <p className="mt-0.5 text-xs">{itemsSummary(x.items, 4)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {m.can.logistics && (
          <Section id="itens-entregar" title="Itens a entregar" count={dl.items.length ? `${dl.items.reduce((a, i) => a + i.quantity, 0)} unidade(s) · ${d.isToday ? "hoje" : "no dia"} + atrasadas` : undefined}>
            {dl.items.length === 0 ? <Empty>Nada a separar para entrega.</Empty> : <ItemsTable items={dl.items} />}
          </Section>
        )}

        {m.can.finance && (
          <Section id="vencimentos" title={`Vencendo ${day}`} count={`${formatBRL(m.due.receivableTotal)} a receber · ${formatBRL(m.due.expenseTotal)} a pagar`}>
            {m.due.overdue && (m.due.overdue.receivables.count > 0 || m.due.overdue.expenses.count > 0) && (
              <p className="mb-3 rounded border border-danger/30 bg-danger/[0.04] px-3 py-2 text-xs">
                Já vencidos antes {d.isToday ? "de hoje" : "deste dia"}:{" "}
                {m.due.overdue.receivables.count > 0 && <Link className="link text-danger" href="/admin/financeiro?aba=receber&situacao=atrasado">{formatBRL(m.due.overdue.receivables.cents)} a receber ({m.due.overdue.receivables.count})</Link>}
                {m.due.overdue.receivables.count > 0 && m.due.overdue.expenses.count > 0 && " · "}
                {m.due.overdue.expenses.count > 0 && <Link className="link text-danger" href="/admin/financeiro?aba=saidas&situacao=vencidas">{formatBRL(m.due.overdue.expenses.cents)} a pagar ({m.due.overdue.expenses.count})</Link>}
              </p>
            )}
            {m.billing && (m.billing.faturar.count > 0 || m.billing.boletos.count > 0) && (
              <div className="mb-3 grid gap-2 sm:grid-cols-2" data-billing-pending>
                {m.billing.faturar.count > 0 && <Link href="/admin/financeiro?aba=faturamento&etapa=faturar" className="rounded border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs hover:border-warning"><b>{m.billing.faturar.count} venda(s) a faturar</b><span className="block text-muted">{formatBRL(m.billing.faturar.cents)}{m.billing.faturar.urgent ? ` · ${m.billing.faturar.urgent} já entregue/em rota` : ""} — informar NF</span></Link>}
                {m.billing.boletos.count > 0 && <Link href="/admin/financeiro?aba=faturamento&etapa=boletos" className="rounded border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs hover:border-warning"><b>{m.billing.boletos.count} boleto(s) a emitir</b><span className="block text-muted">{formatBRL(m.billing.boletos.cents)}{m.billing.boletos.dueSoon ? ` · ${m.billing.boletos.dueSoon} vencem em até 7 dias` : ""}</span></Link>}
              </div>
            )}
            <p className="label mb-1.5">A receber (parcelas e boletos de clientes)</p>
            {m.due.receivables.length === 0 ? <Empty>Nenhuma parcela vencendo {day}.</Empty> : (
              <ul className="mb-4 divide-y divide-line text-sm">{m.due.receivables.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2" data-due-rec={r.sale.code}>
                  <span><Link className="font-medium hover:underline" href={`/admin/financeiro/venda/${r.sale.id}`}>{r.sale.code}</Link> · {r.sale.clientName}<span className="block text-xs text-muted">{r.label}{/boleto/i.test(r.sale.paymentTerms) ? " · boleto" : ` · ${r.sale.paymentTerms}`}</span></span>
                  <span className="font-medium">{formatBRL(r.amountCents)}</span>
                </li>))}</ul>
            )}
            <p className="label mb-1.5 mt-3">A pagar (contas e boletos)</p>
            {m.due.expenses.length === 0 ? <Empty>Nenhuma conta vencendo {day}.</Empty> : (
              <ul className="divide-y divide-line text-sm">{m.due.expenses.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2" data-due-exp={e.description}>
                  <span>{e.description}{e.seriesLabel && <span className="text-muted"> {e.seriesLabel}</span>}<span className="block text-xs text-muted">{[e.payee, e.category].filter(Boolean).join(" · ")}</span></span>
                  <span className="font-medium">{formatBRL(e.amountCents)}</span>
                </li>))}</ul>
            )}
            <p className="mt-3 text-right"><Link className="link text-xs" href={`/admin/financeiro?aba=saidas&de=${d.day}&ate=${d.day}`}>Dar baixa nas contas</Link></p>
          </Section>
        )}

        {po && (
          <Section id="compras" title="Compras a chegar (ordens de compra)" count={`${po.today.length + po.late.length} a chegar · ${po.received.length} recebida(s)`} action={<Link className="link text-xs" href="/admin/ordens-compra">Abrir Ordens de compra</Link>}>
            {po.today.length + po.late.length + po.received.length === 0 ? <Empty>Nenhuma compra prevista para chegar {day}.</Empty> : (
              <ul className="divide-y divide-line text-sm">
                {[...po.late, ...po.today].map((r) => (
                  <li key={r.id} className="py-2.5" data-po-day={r.code}>
                    <div className="flex flex-wrap items-center gap-2"><Link className="font-medium hover:underline" href={`/admin/ordens-compra/${r.id}`}>{r.code}</Link> · {r.supplierName}
                      {r.late ? <Badge tone="danger">Atrasada {r.lateDays} dia(s) · era {dBR(r.due!)}</Badge> : <Badge tone="warning">Prevista para {day}</Badge>}{r.state === "PARCIAL" && <Badge tone="neutral">Parcial</Badge>}</div>
                    <p className="mt-0.5 text-xs">{r.items.filter((i) => i.pending > 0).slice(0, 4).map((i) => `${i.pending.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${i.unit} ${i.description}`).join(" · ")}</p>
                    {r.buyer && <p className="text-xs text-muted">Responsável: {r.buyer}</p>}
                  </li>
                ))}
                {po.received.map((r) => (
                  <li key={r.id} className="py-2.5" data-po-received={r.code}>
                    <div className="flex flex-wrap items-center gap-2"><Link className="font-medium hover:underline" href={`/admin/ordens-compra/${r.orderId}`}>{r.code}</Link> · {r.supplierName} <Badge tone="success">Recebida{r.invoiceNumber ? ` · NF ${r.invoiceNumber}` : ""}</Badge></div>
                    <p className="mt-0.5 text-xs">{r.lines.map((l) => `${l.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${l.unit} ${l.description}`).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {m.can.orders && (
          <Section id="orcamentos" title={`Orçamentos feitos ${day}`} count={quoteTotal ? `${quoteTotal} · ${formatBRL(m.quotes.total)}` : "0"} action={<Link className="link text-xs" href={`/admin/funil?criadoDe=${d.day}&criadoAte=${d.day}`}>Ver no Funil</Link>}>
            {quoteTotal === 0 ? <Empty>Nenhum orçamento criado {day}.</Empty> : (
              <ul className="divide-y divide-line text-sm">{m.quotes.rows.map((q) => (
                <li key={q.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2" data-quote-day={q.code}>
                  <span><Link className="font-medium hover:underline" href={`/admin/orcamentos/${q.id}`}>{q.code}</Link> · {q.clientName}
                    <span className="block text-xs text-muted">{[hour(q.createdAt), STATUS_LABEL[q.status], `${q._count.items} item(ns)`, q.category].filter(Boolean).join(" · ")}</span></span>
                  <span className="font-medium">{formatBRL(q.totalCents)}</span>
                </li>))}</ul>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
