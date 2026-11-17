/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { requireAdmin } from "@/modules/auth/session";
import { formatBRL } from "@/lib/money";
import { formatCnpj } from "@/modules/companies/cnpj";
import { PageHead } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { orderCategoryOptions } from "@/modules/quotes/categories";
import { backfillDeliveries, deliveriesView, deliveryFilterSchema } from "@/modules/deliveries/service";
import { DELIVERY_STATUS } from "@/modules/deliveries/rules";
import { DeliveryUpdate } from "@/components/admin/delivery-update";

export const metadata = { title: "Entregas" };
const d = (x: Date | null) => (x ? x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
type Item = { name: string; quantity: number; measures?: string | null; finish?: string | null; imageUrl?: string | null };

export default async function Deliveries({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("LOGISTICS");
  await backfillDeliveries();
  const f = deliveryFilterSchema.parse(await searchParams);
  const [{ rows, summary: s }, cats] = await Promise.all([deliveriesView(f), orderCategoryOptions()]);
  const sit = f.situacao || "pendentes";
  const chips: [string, string, number | null][] = [
    ["pendentes", "A entregar", s.aAgendar + s.agendadas + s.emRota], ["atrasadas", "Atrasadas", s.late], ["A_AGENDAR", "A agendar", s.aAgendar], ["AGENDADA", "Agendadas", s.agendadas],
    ["EM_ROTA", "Em rota", s.emRota], ["ENTREGUE", "Entregues", s.entregues], ["CANCELADA", "Canceladas", null], ["todas", "Todas", null],
  ];
  const qs = (patch: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, ...patch })) if (v) p.set(k, v); return `/admin/entregas?${p}`; };
  return (
    <>
      <PageHead title="Entregas" subtitle="Todo pedido fechado no funil entra aqui. Acompanhe o que vai ser entregue e o que já foi entregue." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[["A agendar", s.aAgendar], ["Agendadas", s.agendadas], ["Em rota", s.emRota], ["Atrasadas", s.late], ["Entregues no mês", s.deliveredThisMonth], ["Entregues no prazo", s.onTimePct == null ? "—" : `${s.onTimePct.toLocaleString("pt-BR")}%`]].map(([l, v]) => (
          <div key={l} className="card p-4"><p className="label">{l}</p><p className={`mt-1 text-xl font-medium ${l === "Atrasadas" && Number(v) > 0 ? "text-danger" : ""}`}>{v}</p></div>
        ))}
      </div>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Situação">
        {chips.map(([k, l, n]) => <Link key={k} href={qs({ situacao: k })} aria-current={sit === k ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${sit === k ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"} ${k === "atrasadas" && n ? "text-danger" : ""}`}>{l}{n != null ? ` · ${n}` : ""}</Link>)}
      </nav>
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" role="search">
        <input type="hidden" name="situacao" value={sit} />
        <label className="block min-w-[220px] max-w-md flex-1 text-xs text-muted">Buscar<Input name="q" defaultValue={f.q} placeholder="Cliente, nº do pedido, cidade ou endereço" className="mt-1 h-10" /></label>
        <label className="block text-xs text-muted">Categoria do pedido<Select name="categoria" defaultValue={f.categoria ?? ""} className="mt-1 h-10"><option value="">Todas</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}<option value="sem">Sem categoria</option></Select></label>
        <fieldset className="text-xs text-muted"><legend>{sit === "ENTREGUE" ? "Data da entrega" : "Data prevista / agendada"}</legend>
          <div className="mt-1 flex items-center gap-1.5"><Input type="date" name="de" defaultValue={f.de} className="h-10 w-[150px]" aria-label="De" /><span>até</span><Input type="date" name="ate" defaultValue={f.ate} className="h-10 w-[150px]" aria-label="Até" /></div></fieldset>
        <div className="flex gap-2"><Button type="submit" className="h-10">Filtrar</Button>{(f.q || f.de || f.ate || f.categoria) && <Link href={qs({ q: undefined, de: undefined, ate: undefined, categoria: undefined })} className="inline-flex h-10 items-center rounded px-3 text-sm hover:bg-ink/5">Limpar</Link>}</div>
      </form>

      {rows.length === 0 && <p className="card p-8 text-center text-sm text-muted">Nenhuma entrega nesta situação.</p>}
      <ul className="space-y-3">
        {rows.map((r) => {
          const items = r.items as Item[];
          const st = DELIVERY_STATUS[r.status];
          return (
            <li key={r.id} className={`card grid gap-4 p-4 lg:grid-cols-[1.1fr_1.3fr_1fr_auto] ${r.late ? "border-l-4 border-l-[#a24a3a]" : ""}`} data-delivery={r.code}>
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold">{r.code}</span>{r.category && <span className="rounded bg-ink/[0.06] px-2 py-0.5 text-xs">{r.category}</span>}<Badge tone={st.tone}>{st.label}</Badge>{r.late && <Badge tone="danger">Atrasada</Badge>}</div>
                <p className="mt-1 font-medium">{r.clientName}</p>
                <p className="text-xs text-muted">{r.clientDoc ? (r.clientDoc.replace(/\D/g, "").length === 14 ? formatCnpj(r.clientDoc) : r.clientDoc) : ""}</p>
                <p className="mt-1 text-xs">{[r.contact, r.phone].filter(Boolean).join(" · ") || <span className="text-muted">Sem contato</span>}</p>
              </div>
              <div className="min-w-0 text-sm">
                <p className="label">Endereço de entrega</p>
                <p className="mt-1 whitespace-pre-line">{r.address}</p>
                <a className="link mt-1 inline-block text-xs" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([r.address, r.cep].filter(Boolean).join(" "))}`} target="_blank" rel="noopener noreferrer">Abrir no mapa</a>
                <ul className="mt-2 space-y-1 text-xs">{items.slice(0, 4).map((i, k) => (
                  <li key={k} className="flex items-center gap-2"><span className="h-7 w-7 shrink-0 overflow-hidden rounded bg-[#ece8e1]">{i.imageUrl && <img src={i.imageUrl} alt="" className="h-full w-full object-cover" />}</span><span className="truncate">{i.quantity}× {i.name}{i.measures ? ` · ${i.measures}` : ""}</span></li>))}
                  {items.length > 4 && <li className="text-muted">+ {items.length - 4} item(ns)</li>}</ul>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-muted">Fechado</dt><dd>{d(r.closedAt)}</dd>
                <dt className="text-muted">Prazo</dt><dd className={r.late && !r.scheduledAt ? "font-medium text-danger" : ""}>{r.promisedAt ? d(r.promisedAt) : "Sem prazo no orçamento"}</dd>
                {r.scheduledAt && <><dt className="text-muted">Agendada</dt><dd className={r.late ? "font-medium text-danger" : ""}>{d(r.scheduledAt)}</dd></>}
                {r.shippedAt && <><dt className="text-muted">Saiu</dt><dd>{d(r.shippedAt)}</dd></>}
                {r.deliveredAt && <><dt className="text-muted">Entregue</dt><dd className="font-medium text-success">{d(r.deliveredAt)}{r.receivedBy ? ` · ${r.receivedBy}` : ""}</dd></>}
                {r.carrier && <><dt className="text-muted">Responsável</dt><dd>{r.carrier}{r.trackingCode ? ` · ${r.trackingCode}` : ""}</dd></>}
                <dt className="text-muted">Carga</dt><dd>{[r.weightKg && `${r.weightKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`, r.cubageM3 && `${r.cubageM3.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³`].filter(Boolean).join(" · ") || "—"}</dd>
                <dt className="text-muted">Valor</dt><dd>{formatBRL(r.totalCents)}</dd>
                {r.notes && <><dt className="text-muted">Obs.</dt><dd className="whitespace-pre-line">{r.notes}</dd></>}
              </dl>
              <div className="flex flex-col items-end justify-between gap-2">
                <DeliveryUpdate d={{ id: r.id, code: r.code, status: r.status, scheduledAt: r.scheduledAt?.toISOString() ?? null, shippedAt: r.shippedAt?.toISOString() ?? null, deliveredAt: r.deliveredAt?.toISOString() ?? null, carrier: r.carrier, trackingCode: r.trackingCode, receivedBy: r.receivedBy, notes: r.notes, address: r.address, contact: r.contact, phone: r.phone }} />
                <Link className="link text-xs" href={`/orcamento/${r.quoteId}`}>Ver pedido</Link>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
