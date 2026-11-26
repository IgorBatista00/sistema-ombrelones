import Link from "next/link";
import { formatBRL } from "@/lib/money";
import { fmtPct } from "@/modules/pricing/markup";
import { DEDUCTIONS } from "@/modules/finance/operation-rules";
import type { operationResult } from "@/modules/finance/operation-result";
import { Stat } from "./ui";

type R = Awaited<ReturnType<typeof operationResult>>;
const br = (s: string) => s.split("-").reverse().join("/");
const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const pct = (v: number, base: number) => (base > 0 ? fmtPct(Math.round((v * 10_000) / base), 1) : "—");
const monthBounds = (offset: number) => {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const a = new Date(now.getFullYear(), now.getMonth() + offset, 1), b = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { de: iso(a), ate: offset === 0 ? iso(now) : iso(b) };
};

/** Bloco do Dashboard: DRE simples das vendas fechadas (orçamentos) + Mercado Livre em linha separada. */
export function OperationResult({ r, keep }: { r: R; keep: Record<string, string | undefined> }) {
  const t = r.totals;
  const link = (de: string, ate: string) => { const p = new URLSearchParams(Object.entries(keep).filter(([, v]) => v) as [string, string][]); p.set("rde", de); p.set("rate", ate); return `/admin?${p}#resultado`; };
  const cur = monthBounds(0), prev = monthBounds(-1);
  const mlOthers = r.ml.revenue - r.ml.fees - r.ml.cost - r.ml.result;
  const Row = ({ label, v, base, strong, neg, muted }: { label: string; v: number; base: number; strong?: boolean; neg?: boolean; muted?: boolean }) => (
    <tr className={`${strong ? "border-t border-line font-medium" : ""} ${muted ? "text-muted" : ""}`}>
      <td className="px-4 py-1.5">{label}</td>
      <td className={`whitespace-nowrap px-4 py-1.5 text-right ${strong && v < 0 ? "text-danger" : ""}`}>{neg ? `${v ? "− " : ""}${formatBRL(Math.abs(v))}` : formatBRL(v)}</td>
      <td className="whitespace-nowrap px-4 py-1.5 text-right text-xs text-muted">{pct(v, base)}</td>
    </tr>
  );
  const Summary = ({ title, list }: { title: string; list: R["byMarkup"] }) => (
    <div className="card overflow-x-auto">
      <p className="label px-4 pt-4">{title}</p>
      <table className="mt-2 w-full text-sm"><tbody className="divide-y divide-line">
        {list.map((a) => <tr key={a.name}><td className="px-4 py-2">{a.name}<div className="text-xs text-muted">{a.sales} venda(s)</div></td><td className="whitespace-nowrap px-4 py-2 text-right">{formatBRL(a.revenue)}</td><td className={`whitespace-nowrap px-4 py-2 text-right font-medium ${a.result < 0 ? "text-danger" : ""}`}>{formatBRL(a.result)}<div className="text-xs font-normal text-muted">{fmtPct(a.marginBps, 1)}</div></td></tr>)}
        {!list.length && <tr><td className="px-4 py-3 text-xs text-muted">Sem vendas no período.</td></tr>}
      </tbody></table>
    </div>
  );

  return (
    <section id="resultado" aria-labelledby="dash-res" className="mt-10" data-operation-result>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="dash-res" className="label">Resultado da operação</h2>
          <p className="mt-1 text-xs text-muted">Vendas fechadas de {br(r.de)} a {br(r.ate)} (data de fechamento do orçamento). Receita sem frete − custo da mercadoria − custos do markup da venda.</p></div>
        <form className="flex flex-wrap items-end gap-2 text-xs" action="/admin#resultado">
          {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
          <Link href={link(cur.de, cur.ate)} className={`rounded px-3 py-1.5 ${r.de === cur.de && r.ate === cur.ate ? "bg-ink text-canvas" : "hover:bg-ink/5"}`}>Mês atual</Link>
          <Link href={link(prev.de, prev.ate)} className={`rounded px-3 py-1.5 ${r.de === prev.de && r.ate === prev.ate ? "bg-ink text-canvas" : "hover:bg-ink/5"}`}>Mês anterior</Link>
          <label className="text-muted">De<input type="date" name="rde" defaultValue={r.de} className="ml-1 h-8 rounded border border-line px-2" /></label>
          <label className="text-muted">Até<input type="date" name="rate" defaultValue={r.ate} className="ml-1 h-8 rounded border border-line px-2" /></label>
          <button className="h-8 rounded border border-ink/70 px-3">Aplicar</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Faturamento (sem frete)" value={formatBRL(t.revenue)} hint={`${t.sales} venda(s)${t.freight ? ` · frete repassado ${formatBRL(t.freight)}` : ""}`} />
        <Stat label="Custo da mercadoria" value={formatBRL(t.cost)} hint={`${pct(t.cost, t.revenue)} da receita`} />
        <Stat label="Custos do markup" value={formatBRL(t.deductions)} hint={`${pct(t.deductions, t.revenue)} · cartão, comissões, imposto…`} />
        <div data-result-card className={t.result < 0 ? "[&_.card]:border-danger/40 [&_.card_p:nth-child(2)]:text-danger" : ""}><Stat label="Resultado das vendas" value={formatBRL(t.result)}
          hint={`${fmtPct(t.marginBps, 1)} da receita${t.belowMin ? ` · ${t.belowMin} venda(s) abaixo da margem mínima` : ""}`} /></div>
      </div>

      {(r.withoutMarkup.length > 0 || t.costMissing > 0) && (
        <div className="mt-3 rounded border border-warning/40 bg-warning/[0.06] px-4 py-3 text-xs" data-result-warn>
          {r.withoutMarkup.length > 0 && <p><b className="font-medium">{r.withoutMarkup.length} venda(s) sem markup ficaram fora do cálculo</b> ({formatBRL(r.withoutMarkup.reduce((a, s) => a + s.revenue, 0))}): {r.withoutMarkup.map((s, i) => <span key={s.id}>{i ? ", " : ""}<Link className="link" href={`/admin/orcamentos/${s.id}`}>{s.code}</Link></span>)}. Abra o orçamento, escolha o “Markup da venda” e salve.</p>}
          {t.costMissing > 0 && <p className={r.withoutMarkup.length ? "mt-1" : ""}>{t.costMissing} venda(s) têm item sem custo cadastrado — o resultado delas está maior do que o real. Cadastre o custo do produto e salve o orçamento de novo.</p>}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="card overflow-x-auto" data-dre>
          <p className="label px-4 pt-4">Demonstrativo</p>
          <table className="mt-2 w-full text-sm"><tbody>
            <Row label="Receita de produtos (orçamentos)" v={t.revenue} base={t.revenue} strong />
            <Row label="Custo da mercadoria" v={t.cost} base={t.revenue} neg />
            {DEDUCTIONS.filter((d) => t.lines[d.key]).map((d) => <Row key={d.key} label={d.label} v={t.lines[d.key]} base={t.revenue} neg />)}
            <Row label="Resultado das vendas (orçamentos)" v={t.result} base={t.revenue} strong />
            {t.freight > 0 && <Row label="Frete cobrado do cliente (repasse, fora da receita)" v={t.freight} base={0} muted />}
            <tr><td colSpan={3} className="px-4 pt-4 text-[11px] uppercase tracking-label text-muted">Mercado Livre <Link href={`/admin/mercadolivre?aba=lucro&de=${r.de}&ate=${r.ate}`} className="link normal-case tracking-normal">ver detalhes</Link></td></tr>
            <Row label={`Receita (${r.ml.orders} venda(s))`} v={r.ml.revenue} base={r.ml.revenue} />
            <Row label="Tarifas e fretes do Mercado Livre" v={r.ml.fees} base={r.ml.revenue} neg />
            <Row label="Custo da mercadoria" v={r.ml.cost} base={r.ml.revenue} neg />
            {mlOthers !== 0 && <Row label="Embalagem, imposto e outros" v={mlOthers} base={r.ml.revenue} neg />}
            <Row label="Resultado Mercado Livre" v={r.ml.result} base={r.ml.revenue} strong />
            <tr><td colSpan={3} className="pt-3" /></tr>
            <Row label="Resultado total (orçamentos + Mercado Livre)" v={t.result + r.ml.result} base={t.revenue + r.ml.revenue} strong />
          </tbody></table>
          {(r.ml.unlinked > 0 || r.ml.costMissing > 0) && <p className="px-4 pb-3 text-xs text-muted">Mercado Livre: {r.ml.unlinked ? `${r.ml.unlinked} venda(s) de anúncio sem cadastro` : ""}{r.ml.unlinked && r.ml.costMissing ? " · " : ""}{r.ml.costMissing ? `${r.ml.costMissing} sem custo do produto` : ""} — resultado parcial.</p>}
          <p className="px-4 pb-4 text-xs text-muted">Despesas fixas (aluguel, salários…) não entram aqui: este é o resultado das vendas.</p>
        </div>
        <div className="grid content-start gap-4">
          <Summary title="Por markup" list={r.byMarkup} />
          <Summary title="Por vendedor" list={r.bySeller} />
          <Summary title="Por categoria do pedido" list={r.byCategory} />
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <p className="label px-4 pt-4">Vendas do período</p>
        <table className="mt-2 w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Fechado em", "Orçamento", "Cliente", "Markup", "Receita", "Custo", "Custos markup", "Resultado", "Margem"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-2 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {r.sales.map((s) => (
              <tr key={s.id} data-sale={s.code} className={s.belowMin ? "bg-danger/[0.03]" : ""}>
                <td className="whitespace-nowrap px-4 py-2">{day(s.closedAt)}</td>
                <td className="whitespace-nowrap px-4 py-2"><Link className="link" href={`/admin/orcamentos/${s.id}`}>{s.code}</Link></td>
                <td className="max-w-56 truncate px-4 py-2">{s.client}<div className="text-xs text-muted">{s.seller} · {s.category}</div></td>
                <td className="px-4 py-2 text-xs">{s.markup}</td>
                <td className="whitespace-nowrap px-4 py-2">{formatBRL(s.revenue)}</td>
                <td className="whitespace-nowrap px-4 py-2">{formatBRL(s.cost)}{s.costMissing > 0 && <div className="text-xs text-warning">{s.costMissing} item(ns) sem custo</div>}</td>
                <td className="whitespace-nowrap px-4 py-2">{formatBRL(s.deductions)}</td>
                <td className={`whitespace-nowrap px-4 py-2 font-medium ${s.result < 0 ? "text-danger" : ""}`}>{formatBRL(s.result)}</td>
                <td className={`whitespace-nowrap px-4 py-2 ${s.belowMin ? "font-medium text-danger" : ""}`}>{fmtPct(s.marginBps, 1)}{s.belowMin && <div className="text-xs">abaixo da mínima ({fmtPct(s.minMarginBps, 1)})</div>}</td>
              </tr>
            ))}
            {!r.sales.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Nenhuma venda fechada no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
