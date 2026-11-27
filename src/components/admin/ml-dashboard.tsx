import Link from "next/link";
import { formatBRL } from "@/lib/money";
import type { MlDashboard } from "@/modules/mercadolivre/dashboard";
import { Columns, TimeChart } from "./ml-charts";

const pct = (bps: number | null) => (bps == null ? "—" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const share = (v: number, base: number) => (base > 0 ? `${((v / base) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const br = (iso: string) => iso.split("-").reverse().join("/");
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="text-muted">sem base no período anterior</span>;
  const d = (now - before) / Math.abs(before);
  const up = d >= 0;
  return <span className={up ? "text-success" : "text-danger"}><span aria-hidden>{up ? "▲" : "▼"}</span> {(Math.abs(d) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% <span className="text-muted">vs período anterior</span></span>;
}
function Tile({ label, value, children, tone }: { label: string; value: React.ReactNode; children?: React.ReactNode; tone?: "danger" | "warning" }) {
  return <div className="card p-4" data-tile={label}><p className="label">{label}</p><p className={`mt-2 text-2xl ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : ""}`}>{value}</p>{children && <p className="mt-1 text-xs">{children}</p>}</div>;
}
function Photo({ src, alt, size = 44 }: { src: string | null; alt: string; size?: number }) {
  return <div className="shrink-0 overflow-hidden rounded border border-line bg-white" style={{ width: size, height: size }}>{src ? <img src={src} alt={alt} className="h-full w-full object-contain p-0.5" loading="lazy" /> : <span className="grid h-full place-items-center text-[9px] text-muted">sem foto</span>}</div>;
}
function Card({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="card p-5"><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-sans text-sm font-medium">{title}</h3>{sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}</div>{action}</div>{children}</section>;
}

export function MlDashboardView({ d, qs }: { d: MlDashboard; qs: (p: Record<string, string | undefined>) => string }) {
  const k = d.kpi;
  const margin = k.revenue > 0 ? Math.round((k.profit * 10_000) / k.revenue) : null;
  const ticket = k.orders ? Math.round(k.revenue / k.orders) : 0;
  const label = (key: string) => (d.bucket === "mes" ? `${MONTH[Number(key.slice(5, 7)) - 1]}/${key.slice(2, 4)}` : dm(key));
  const points = d.series.map((s) => ({ ...s, label: d.bucket === "semana" ? `sem. ${label(s.key)}` : label(s.key) }));
  // para onde vai cada real vendido
  const parts = [
    { key: "Custo dos produtos", v: k.cost, c: "#257de0" },
    { key: "Tarifas e fretes ML", v: k.fees, c: "#f47230" },
    { key: "Imposto, embalagem e outros", v: k.extras, c: "#00b894" },
    { key: "Lucro", v: Math.max(0, k.profit), c: "#f2a600" },
  ];
  const partsTotal = parts.reduce((a, p) => a + p.v, 0) || 1;
  const maxTopP = Math.max(...d.topProducts.map((p) => p.revenue), 1), maxTopL = Math.max(...d.topListings.map((p) => p.revenue), 1);
  const typeTotal = d.byType.classico.revenue + d.byType.premium.revenue || 1;
  const stageMax = Math.max(...d.stages.map((s) => s.orders), 1);
  const toneBar: Record<string, string> = { success: "#2f6b45", warning: "#a0702a", danger: "#a24a3a", neutral: "#8a8f87" };

  if (!k.total) return <div className="card p-10 text-center text-sm text-muted">Nenhuma venda entre {br(d.de)} e {br(d.ate)}. Importe a planilha de vendas ou escolha outro período.</div>;

  return (
    <div className="space-y-5" data-ml-dashboard>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Faturamento" value={formatBRL(k.revenue)}><Delta now={k.revenue} before={d.prev.revenue} /></Tile>
        <Tile label="Lucro" value={formatBRL(k.profit)} tone={k.profit < 0 ? "danger" : undefined}>margem {pct(margin)} · <Delta now={k.profit} before={d.prev.profit} /></Tile>
        <Tile label="Vendas" value={k.orders.toLocaleString("pt-BR")}>{k.units} unidade(s) · <Delta now={k.orders} before={d.prev.orders} /></Tile>
        <Tile label="Ticket médio" value={formatBRL(ticket)}><span className="text-muted">por venda</span></Tile>
        <Tile label="Tarifas e fretes ML" value={formatBRL(k.fees)}><span className="text-muted">{share(k.fees, k.revenue)} do faturamento</span></Tile>
        <Tile label="Custo dos produtos" value={formatBRL(k.cost)}><span className="text-muted">{share(k.cost, k.revenue)} do faturamento</span>{k.costMissing ? <span className="text-warning"> · {k.costMissing} venda(s) sem custo</span> : null}</Tile>
        <Tile label="Canceladas / devolvidas" value={k.cancelled} tone={k.cancelled ? "warning" : undefined}><span className="text-muted">{share(k.cancelled, k.total)} das vendas</span></Tile>
        <Tile label="A enviar" value={<Link className="hover:underline" href={qs({ aba: "enviar" })}>{k.toShip}</Link>} tone={k.problems ? "warning" : undefined}><span className="text-muted">{k.problems ? `${k.problems} com atenção (reclamação, mediação…)` : "nenhuma com problema"}</span></Tile>
      </div>

      {(k.unlinked > 0 || k.costMissing > 0) && (
        <p className="rounded border border-warning/40 bg-warning/[0.06] px-4 py-3 text-xs" data-dash-warn>
          {k.unlinked > 0 && <>{k.unlinked} venda(s) de anúncios ainda não cadastrados. </>}{k.costMissing > 0 && <>{k.costMissing} venda(s) sem custo do produto — o lucro está maior do que o real. </>}
          <Link className="link" href={qs({ aba: "anuncios" })}>Ver anúncios</Link>
        </p>
      )}

      <CashCard d={d} />
      <CostsCard d={d} qs={qs} />

      <Card title="Faturamento e lucro" sub={`${br(d.de)} a ${br(d.ate)} · passe o mouse no gráfico para ver cada ${d.bucket === "dia" ? "dia" : d.bucket === "semana" ? "semana" : "mês"}`}>
        <TimeChart points={points} bucketLabel={d.bucket === "dia" ? "dia" : d.bucket === "semana" ? "semana" : "mês"} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Para onde vai cada R$ 100 vendido" sub="Sobre o faturamento de produtos das vendas válidas">
          <div className="flex h-7 w-full overflow-hidden rounded" role="img" aria-label="Composição do faturamento">
            {parts.filter((p) => p.v > 0).map((p, i) => <div key={p.key} title={`${p.key}: ${formatBRL(p.v)} (${share(p.v, partsTotal)})`} style={{ width: `${(p.v / partsTotal) * 100}%`, background: p.c, marginLeft: i ? 2 : 0 }} />)}
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {parts.map((p) => <li key={p.key} className="flex items-center gap-2"><i className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: p.c }} />{p.key}<span className="ml-auto font-medium">{formatBRL(p.v)}</span><span className="w-14 text-right text-xs text-muted">{share(p.v, partsTotal)}</span></li>)}
          </ul>
          {k.profit < 0 && <p className="mt-2 text-xs text-danger">Prejuízo de {formatBRL(-k.profit)} no período.</p>}
        </Card>
        <Card title="Clássico × Premium" sub="Faturamento e margem por tipo de anúncio">
          {(["classico", "premium"] as const).map((t) => { const x = d.byType[t]; return (
            <div key={t} className="mb-4 last:mb-0">
              <div className="flex items-baseline justify-between text-sm"><span className="font-medium">{t === "classico" ? "Clássico" : "Premium"}</span><span>{formatBRL(x.revenue)} <span className="text-xs text-muted">· {share(x.revenue, typeTotal)}</span></span></div>
              <div className="mt-1.5 h-3 overflow-hidden rounded bg-ink/[0.06]"><div className="h-full rounded" style={{ width: `${(x.revenue / typeTotal) * 100}%`, background: t === "classico" ? "#257de0" : "#f47230" }} /></div>
              <p className="mt-1 text-xs text-muted">{x.orders} venda(s) · {x.units} un. · tarifas e fretes {formatBRL(x.fees)} · lucro {formatBRL(x.profit)} · margem {pct(x.marginBps)}</p>
            </div>); })}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Vendas por dia da semana" sub="Quantidade de vendas válidas"><Columns data={d.byWeekday.map((w) => ({ label: w.label, value: w.orders, sub: formatBRL(w.revenue) }))} valueLabel="venda(s)" /></Card>
        <Card title="Vendas por horário" sub="Hora da compra (Brasília)"><Columns data={d.byHour.map((h) => ({ label: h.label.replace("h", ""), value: h.orders, sub: formatBRL(h.revenue) }))} valueLabel="venda(s)" /></Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Produtos que mais faturam" sub={`${d.productsCount} produto(s) vendidos · kits divididos entre as peças`} action={<Link className="link text-xs" href={qs({ aba: "produtos" })}>Anúncios por produto</Link>}>
          <ol className="space-y-3" data-top-products>
            {d.topProducts.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="w-4 text-right text-xs text-muted">{i + 1}</span><Photo src={p.image} alt={p.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2"><Link className="truncate text-sm hover:underline" href={qs({ aba: "anuncios", produto: p.id })}>{p.name}</Link><span className="ml-auto whitespace-nowrap text-sm font-medium">{formatBRL(p.revenue)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-ink/[0.06]"><div className="h-full rounded" style={{ width: `${(p.revenue / maxTopP) * 100}%`, background: "#257de0" }} /></div>
                  <p className="mt-0.5 text-xs text-muted">{p.sku} · {p.units} un. · lucro {formatBRL(p.profit)} ({pct(p.marginBps)}){p.costMissing ? " · sem custo em parte" : ""}</p>
                </div>
              </li>))}
            {!d.topProducts.length && <li className="text-sm text-muted">Cadastre os anúncios com os produtos para ver este ranking.</li>}
          </ol>
        </Card>
        <Card title="Anúncios que mais faturam" sub={`${d.listingsCount} anúncio(s) com venda no período`} action={<Link className="link text-xs" href={qs({ aba: "lucro" })}>Lucro por anúncio</Link>}>
          <ol className="space-y-3" data-top-listings>
            {d.topListings.map((l, i) => (
              <li key={l.id} className="flex items-center gap-3">
                <span className="w-4 text-right text-xs text-muted">{i + 1}</span>
                <div className="relative shrink-0" style={{ width: 44 + Math.max(0, Math.min(l.images.length, 2) - 1) * 12, height: 44 }}>
                  {(l.images.length ? l.images.slice(0, 2) : [null]).map((src, j) => <div key={j} className="absolute top-0" style={{ left: j * 12, zIndex: 5 - j }}><Photo src={src} alt={l.title} /></div>)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2"><span className="truncate text-sm" title={l.title}>{l.title}</span><span className="ml-auto whitespace-nowrap text-sm font-medium">{formatBRL(l.revenue)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-ink/[0.06]"><div className="h-full rounded" style={{ width: `${(l.revenue / maxTopL) * 100}%`, background: "#257de0" }} /></div>
                  <p className="mt-0.5 text-xs text-muted">{l.mlb}{l.type ? ` · ${l.type === "premium" ? "Premium" : "Clássico"}` : ""} · {l.units} un. · lucro {formatBRL(l.profit)} ({pct(l.marginBps)}){l.id.startsWith("sem:") ? " · anúncio não cadastrado" : ""}</p>
                </div>
              </li>))}
          </ol>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card title="Situação das vendas" sub="Todas as vendas do período">
          <ul className="space-y-2.5 text-sm">
            {d.stages.map((s) => (
              <li key={s.stage}>
                <div className="flex justify-between"><span>{s.label}</span><span className="font-medium">{s.orders}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-ink/[0.06]"><div className="h-full rounded" style={{ width: `${(s.orders / stageMax) * 100}%`, background: toneBar[s.tone] }} /></div>
              </li>))}
          </ul>
        </Card>
        <Card title="Margem baixa" sub="Anúncios com margem abaixo de 10% no período">
          {d.lowMargin.length ? <ul className="space-y-2 text-sm">{d.lowMargin.map((l) => <li key={l.id} className="flex items-center gap-2"><Photo src={l.images[0] ?? null} alt={l.title} size={32} /><span className="min-w-0 flex-1 truncate" title={l.title}>{l.title}</span><span className={`whitespace-nowrap font-medium ${(l.marginBps ?? 0) < 0 ? "text-danger" : "text-warning"}`}>{pct(l.marginBps)}</span></li>)}</ul> : <p className="text-sm text-muted">Nenhum anúncio com margem abaixo de 10%.</p>}
        </Card>
        <Card title="Últimas vendas" action={<Link className="link text-xs" href={qs({ aba: "vendas" })}>Ver todas</Link>}>
          <ul className="divide-y divide-line text-sm">
            {d.recent.map((r) => (
              <li key={r.orderId} className={`flex items-center gap-3 py-2 ${r.cancelled ? "text-muted" : ""}`}>
                <Photo src={r.image} alt="" size={36} />
                <div className="min-w-0 flex-1"><p className="truncate" title={r.title}>{r.title}</p><p className="text-xs text-muted">{new Date(r.saleDate).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {r.stageLabel}</p></div>
                <div className="text-right"><p className="whitespace-nowrap font-medium">{formatBRL(r.product)}</p>{!r.cancelled && <p className={`text-xs ${r.profit < 0 ? "text-danger" : "text-muted"}`}>lucro {formatBRL(r.profit)}</p>}</div>
              </li>))}
          </ul>
        </Card>
      </div>
      <p className="text-xs text-muted">Faturamento = receita de produtos das vendas válidas (sem canceladas/devolvidas). Lucro = faturamento + frete recebido − reembolsos − tarifas e fretes do Mercado Livre − custo dos produtos − imposto, embalagem e outros custos do anúncio. Comparação com {br(d.prevDe)} a {br(d.prevAte)}.</p>
    </div>
  );
}

/** Todas as receitas e custos das vendas válidas, linha a linha, até o lucro. */
function CostsCard({ d, qs }: { d: MlDashboard; qs: (p: Record<string, string | undefined>) => string }) {
  const b = d.breakdown;
  const base = b.product || 1;
  const row = (l: MlDashboard["breakdown"]["costs"][number], sign: 1 | -1) => (
    <tr key={l.key} data-cost-line={l.key} className="border-b border-line/60 last:border-0">
      <td className="py-2 pr-3">{l.label}{l.hint && <span className={`block text-xs ${l.key === "frete" ? "text-muted" : "text-warning"}`}>{l.hint}</span>}</td>
      <td className="hidden py-2 pr-3 text-xs text-muted sm:table-cell">{l.source === "planilha" ? "planilha do ML" : "cadastro do anúncio/produto"}</td>
      <td className={`py-2 pr-3 text-right tabular-nums ${l.cents === 0 && sign < 0 ? "text-danger" : ""}`}>{l.cents === 0 && sign < 0 ? "R$ 0,00 — não contabilizado" : `${sign < 0 ? "−" : "+"}${formatBRL(Math.abs(l.cents))}`}</td>
      <td className="w-40 py-2"><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded bg-ink/[0.06]"><div className="h-full rounded" style={{ width: `${Math.min(100, (Math.abs(l.cents) / base) * 100)}%`, background: sign < 0 ? "#f47230" : "#257de0" }} /></div><span className="w-12 text-right text-xs text-muted tabular-nums">{share(Math.abs(l.cents), base)}</span></div></td>
    </tr>
  );
  return (
    <Card title="Receitas e custos das vendas" sub={`Vendas válidas de ${br(d.de)} a ${br(d.ate)} · % sobre a receita por produtos · inclui todas as colunas de valor da planilha do ML`} action={<Link className="link text-xs" href={qs({ aba: "validacao" })}>Validar venda por venda</Link>}>
      <div className="overflow-x-auto" data-cost-breakdown>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-label text-muted"><tr><th className="pb-2 text-left font-normal">Receitas</th><th className="hidden pb-2 text-left font-normal sm:table-cell">Origem</th><th className="pb-2 text-right font-normal">Valor</th><th className="pb-2 font-normal" /></tr></thead>
          <tbody>{b.income.map((l) => row(l, 1))}</tbody>
          <tbody><tr><td colSpan={4} className="pb-2 pt-4 text-[11px] uppercase tracking-label text-muted">Custos pagos</td></tr>{b.costs.map((l) => row(l, -1))}</tbody>
          <tfoot className="border-t-2 border-ink/20 font-medium">
            <tr><td className="py-2">Total de custos</td><td className="hidden sm:table-cell" /><td className="py-2 pr-3 text-right tabular-nums">−{formatBRL(Math.abs(b.totalCosts))}</td><td className="py-2 text-right text-xs text-muted">{share(Math.abs(b.totalCosts), base)}</td></tr>
            <tr><td className="py-2">Lucro</td><td className="hidden sm:table-cell" /><td className={`py-2 pr-3 text-right tabular-nums ${b.profit < 0 ? "text-danger" : "text-success"}`}>{formatBRL(b.profit)}</td><td className="py-2 text-right text-xs text-muted">{share(b.profit, base)}</td></tr>
          </tfoot>
        </table>
      </div>
      {(b.outside.cancelled !== 0 || Math.abs(b.outside.unexplained) >= 100) && (
        <div className="mt-4 rounded border border-warning/40 bg-warning/[0.06] p-3 text-xs" data-cost-outside>
          <p className="font-medium">Lançado pelo Mercado Livre e fora do lucro acima</p>
          <ul className="mt-1 space-y-0.5">
            {b.outside.cancelled !== 0 && <li>Canceladas/devolvidas com valor: <b className="font-medium">{formatBRL(b.outside.cancelled)}</b> em {b.outside.cancelledCount} venda(s) (o sistema conta R$ 0 para venda cancelada).</li>}
            {Math.abs(b.outside.unexplained) >= 100 && <li>Diferença entre o Total do ML e as colunas da planilha: <b className="font-medium">{formatBRL(b.outside.unexplained)}</b> (veja em Validação das vendas → “Total do ML não bate”).</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Aumento do caixa: o que o ML repassa (coluna Total) menos o imposto pago na guia. A mercadoria não sai do caixa na venda. */
function CashCard({ d }: { d: MlDashboard }) {
  const c = d.breakdown.cash, b = d.breakdown;
  const line = (label: React.ReactNode, v: React.ReactNode, cls = "") => <div className={`flex items-baseline justify-between gap-4 py-1.5 ${cls}`}><span>{label}</span><span className="tabular-nums">{v}</span></div>;
  return (
    <section className="card p-5" data-cash>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <p className="label">Aumento do caixa</p>
          <p className={`mt-2 text-4xl ${c.increase < 0 ? "text-danger" : "text-success"}`} data-cash-value>{formatBRL(c.increase)}</p>
          <p className="mt-2 text-xs text-muted">{br(d.de)} a {br(d.ate)} · o que o Mercado Livre repassou menos o imposto pago em guia. O custo da mercadoria não entra aqui: ele saiu do caixa na compra, não na venda. Conta pela data da venda: inclui valores que o ML só libera depois da entrega.</p>
        </div>
        <div className="text-sm">
          {line(<>Recebido do Mercado Livre <span className="text-xs text-muted">(coluna Total: já sem tarifa, frete e reembolsos)</span></>, `+${formatBRL(c.mlReceived)}`)}
          {line(<>Imposto <span className="text-xs text-muted">(guia separada, 14,5% sobre a receita por produtos)</span></>, `−${formatBRL(c.tax)}`)}
          {line(<b className="font-medium">Aumento do caixa</b>, <b className="font-medium">{formatBRL(c.increase)}</b>, "border-t border-line")}
          <p className="mt-3 text-xs text-muted">Comparação: lucro {formatBRL(b.profit)} (desconta o custo da mercadoria{b.outside.cancelled ? "; não inclui o que o ML cobrou em devoluções" : ""}). {b.outside.cancelled ? `O caixa já inclui ${formatBRL(b.outside.cancelled)} cobrados pelo ML em canceladas/devolvidas.` : ""}</p>
          {c.noTotal > 0 && <p className="mt-1 text-xs text-warning">{c.noTotal} venda(s) sem a coluna Total: valor recebido calculado pelas colunas.</p>}
        </div>
      </div>
    </section>
  );
}
