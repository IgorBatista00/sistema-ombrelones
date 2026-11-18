import Link from "next/link";
import { requireAdmin } from "@/modules/auth/session";
import { formatBRL } from "@/lib/money";
import { PageHead } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { poFilterSchema, purchaseOrdersView, type PoRow } from "@/modules/purchase-orders/service";
import { fmtQty } from "@/modules/purchase-orders/rules";

export const metadata = { title: "Ordens de compra" };
const d = (x: Date | null) => (x ? x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const days = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;
const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

function Prazo({ r }: { r: PoRow }) {
  if (r.state === "CANCELADA") return <span className="text-muted">Cancelada em {d(r.canceledAt)}</span>;
  if (!r.due) return <span className="text-warning">Sem data prometida</span>;
  const due = <>{d(r.due)}{r.dueEstimated && <span className="text-muted"> (estimada pelo cadastro)</span>}{r.rescheduled && <span className="text-muted"> · remarcada (era {d(r.originalPromisedAt)})</span>}</>;
  if (!r.open) return <span>{due}<br /><span className={r.onTime === false ? "text-danger" : "text-success"}>{r.onTime == null ? "" : r.onTime ? "Entregue no prazo" : `Entregue com ${days(r.lateDays)} de atraso`}</span></span>;
  if (r.late) return <span>{due}<br /><strong className="font-medium text-danger">Atrasada há {days(r.lateDays)}</strong></span>;
  return <span>{due}<br /><span className={r.daysLeft === 0 ? "font-medium text-warning" : "text-muted"}>{r.daysLeft === 0 ? "Chega hoje" : `Faltam ${days(r.daysLeft ?? 0)}`}</span></span>;
}

export default async function PurchaseOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("STOCK");
  const f = poFilterSchema.parse(await searchParams);
  const { rows, summary: s, suppliers, performance, situacao: sit } = await purchaseOrdersView(f);
  const aba = f.aba ?? "ordens";
  const qs = (patch: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, ...patch })) if (v) p.set(k, v); return `/admin/ordens-compra?${p}`; };
  const chips: [string, string, number | null][] = [
    ["abertas", "Em aberto", s.open], ["atrasadas", "Atrasadas", s.late], ["semana", "Chegam em 7 dias", s.week], ["parciais", "Entrega parcial", s.partial],
    ["sem_data", "Sem data prometida", s.noDate], ["concluidas", "Concluídas", s.done], ["canceladas", "Canceladas", null], ["todas", "Todas", null],
  ];
  return (
    <>
      <PageHead title="Ordens de compra" subtitle="Pedidos feitos aos fornecedores: prazos, entregas e atrasos." action={<Link href="/admin/ordens-compra/nova" className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink">Nova ordem de compra</Link>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {([["Em aberto", s.open, ""], ["Atrasadas", s.late, s.late ? "text-danger" : ""], ["Chegam em 7 dias", s.week, ""], ["Sem data prometida", s.noDate, s.noDate ? "text-warning" : ""], ["Entregues no prazo (90 dias)", s.onTimePct == null ? "—" : `${s.onTimePct}%`, ""]] as const).map(([l, v, c]) => (
          <div key={l} className="card p-4"><p className="label">{l}</p><p className={`mt-1 text-xl font-medium ${c}`}>{v}</p>{l.startsWith("Entregues") && s.onTimeBase > 0 && <p className="text-xs text-muted">{s.onTimeBase} OC(s) concluída(s)</p>}</div>
        ))}
      </div>
      <nav className="mb-4 flex gap-1 border-b border-line" aria-label="Visão">
        {[["ordens", "Ordens de compra"], ["fornecedores", "Desempenho dos fornecedores"]].map(([k, l]) => (
          <Link key={k} href={qs({ aba: k === "ordens" ? undefined : k })} aria-current={aba === k ? "page" : undefined} className={`-mb-px border-b-2 px-4 py-2 text-sm ${aba === k ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>{l}</Link>
        ))}
      </nav>

      {aba === "fornecedores" ? (
        <>
          <form className="card mb-5 flex flex-wrap items-end gap-3 p-4">
            <input type="hidden" name="aba" value="fornecedores" />
            <fieldset className="text-xs text-muted"><legend>Data do pedido</legend><div className="mt-1 flex items-center gap-1.5"><Input type="date" name="de" defaultValue={f.de} className="h-10 w-[150px]" aria-label="De" /><span>até</span><Input type="date" name="ate" defaultValue={f.ate} className="h-10 w-[150px]" aria-label="Até" /></div></fieldset>
            <Button type="submit" className="h-10">Filtrar</Button>
          </form>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Fornecedor", "Em aberto", "Atrasadas agora", "Concluídas", "No prazo", "Atraso médio", "Prazo real médio", ""].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{performance.map((p) => (
                <tr key={p.supplierId} data-perf={p.supplierName}>
                  <td className="px-4 py-3 font-medium">{p.supplierName}</td><td className="px-4 py-3">{p.open}</td>
                  <td className={`px-4 py-3 ${p.lateOpen ? "font-medium text-danger" : ""}`}>{p.lateOpen}</td><td className="px-4 py-3">{p.done}</td>
                  <td className="px-4 py-3">{p.onTimePct == null ? "—" : `${p.onTimePct}%`}</td>
                  <td className="px-4 py-3">{p.avgLateDays == null ? "—" : `${num(p.avgLateDays)} dias`}</td>
                  <td className="px-4 py-3">{p.avgLeadDays == null ? "—" : `${num(p.avgLeadDays)} dias`}</td>
                  <td className="px-4 py-3"><Link className="link text-xs" href={`/admin/ordens-compra?situacao=todas&fornecedor=${p.supplierId}`}>Ver OCs</Link></td>
                </tr>))}</tbody>
            </table>
            {performance.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhuma ordem de compra no período.</p>}
          </div>
          <p className="mt-3 text-xs text-muted">No prazo: OCs concluídas cuja última entrega chegou até a data prometida (ou a estimada pelo cadastro). Atraso médio: só das que atrasaram. Prazo real: do pedido até a última entrega.</p>
        </>
      ) : (
        <>
          <nav className="mb-4 flex flex-wrap gap-2" aria-label="Situação">
            {chips.map(([k, l, n]) => <Link key={k} href={qs({ situacao: k })} aria-current={sit === k ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${sit === k ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"} ${k === "atrasadas" && n && sit !== k ? "text-danger" : ""}`}>{l}{n != null ? ` · ${n}` : ""}</Link>)}
          </nav>
          <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" role="search">
            <input type="hidden" name="situacao" value={sit} />
            <label className="block min-w-[220px] max-w-md flex-1 text-xs text-muted">Buscar<Input name="q" defaultValue={f.q} placeholder="Nº da OC, item, responsável ou nº no fornecedor" className="mt-1 h-10" /></label>
            <label className="block text-xs text-muted">Fornecedor<Select name="fornecedor" defaultValue={f.fornecedor ?? ""} className="mt-1 h-10"><option value="">Todos</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
            <fieldset className="text-xs text-muted"><legend>Data do pedido</legend><div className="mt-1 flex items-center gap-1.5"><Input type="date" name="de" defaultValue={f.de} className="h-10 w-[150px]" aria-label="De" /><span>até</span><Input type="date" name="ate" defaultValue={f.ate} className="h-10 w-[150px]" aria-label="Até" /></div></fieldset>
            <div className="flex gap-2"><Button type="submit" className="h-10">Filtrar</Button>{(f.q || f.de || f.ate || f.fornecedor) && <Link href={qs({ q: undefined, de: undefined, ate: undefined, fornecedor: undefined })} className="inline-flex h-10 items-center rounded px-3 text-sm hover:bg-ink/5">Limpar</Link>}</div>
          </form>
          {rows.length === 0 && <p className="card p-8 text-center text-sm text-muted">{s.open + s.done === 0 && sit === "abertas" ? "Nenhuma ordem de compra ainda. Clique em “Nova ordem de compra” para registrar o primeiro pedido a um fornecedor." : "Nenhuma ordem de compra nesta situação."}</p>}
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className={`card grid gap-4 p-4 lg:grid-cols-[1.1fr_1.4fr_1fr_auto] ${r.late ? "border-l-4 border-l-[#a24a3a]" : ""}`} data-po={r.code}>
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Link href={`/admin/ordens-compra/${r.id}`} className="text-base font-semibold hover:underline">{r.code}</Link><Badge tone={r.stateTone}>{r.stateLabel}</Badge>{r.late && <Badge tone="danger">Atrasada</Badge>}</div>
                  <p className="mt-1 font-medium">{r.supplierName}</p>
                  <p className="text-xs text-muted">Pedido em {d(r.orderedAt)}{r.buyer ? ` · por ${r.buyer}` : ""}{r.supplierRef ? ` · nº fornecedor ${r.supplierRef}` : ""}</p>
                </div>
                <div className="min-w-0 text-xs">
                  <ul className="space-y-1">{r.items.slice(0, 4).map((i, k) => (
                    <li key={k} className="flex justify-between gap-3"><span className="truncate">{i.description}</span><span className={`whitespace-nowrap ${i.pending > 0 && i.received > 0 ? "text-warning" : i.pending <= 0 ? "text-success" : "text-muted"}`}>{fmtQty(i.received)} de {fmtQty(i.quantity)} {i.unit}</span></li>))}
                    {r.items.length > 4 && <li className="text-muted">+ {r.items.length - 4} item(ns)</li>}</ul>
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-ink/10" aria-label={`${r.receivedPct}% recebido`}><div className="h-full bg-[#4a6b4f]" style={{ width: `${r.receivedPct}%` }} /></div>
                  <p className="mt-1 text-muted">{r.receivedPct}% recebido{r.totalCents != null ? ` · ${formatBRL(r.totalCents)}${r.partialValue ? " (itens com valor)" : ""}` : ""}</p>
                </div>
                <div className="text-xs"><p className="label">Entrega</p><p className="mt-1"><Prazo r={r} /></p>{r.lastReceiptAt && <p className="mt-1 text-muted">Última entrega: {d(r.lastReceiptAt)}</p>}</div>
                <div className="flex items-start justify-end"><Link href={`/admin/ordens-compra/${r.id}`} className="inline-flex h-9 items-center rounded border border-line px-3 text-sm hover:bg-ink/5">Abrir</Link></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
