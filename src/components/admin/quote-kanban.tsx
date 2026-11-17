"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { moveQuoteAction } from "@/modules/admin/quote-actions";
import type { FunnelCard } from "@/modules/quotes/service";
import { LOST_REASONS, STAGES, funnelSummary, stageOf, type Stage } from "@/modules/quotes/funnel";
import { STATUS_LABEL } from "@/modules/quotes/totals";
import { formatBRL } from "@/lib/money";
import { Notice } from "@/components/ui/misc";

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const TONE: Record<Stage, string> = { salvos: "border-t-[#8a8f87]", fechados: "border-t-[#2f6b45]", perdidos: "border-t-[#a24a3a]" };
const CHIP: Record<string, string> = { RASCUNHO: "bg-[#ecebe7] text-[#55594f]", EMITIDO: "bg-[#f3ead6] text-[#7a5a17]", ENVIADO: "bg-[#e6eef4] text-[#2d5872]", APROVADO: "bg-[#e3efe6] text-[#2f6b45]", RECUSADO: "bg-[#f5e4e0] text-[#a24a3a]", EXPIRADO: "bg-[#f1e8e6] text-[#8c5b51]" };

export function QuoteKanban({ initial, closedFilter }: { initial: FunnelCard[]; closedFilter: boolean }) {
  const [cards, setCards] = useState(initial);
  useEffect(() => setCards(initial), [initial]);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [lost, setLost] = useState<{ id: string; reason: string; other: string } | null>(null);
  const [msg, setMsg] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const sum = useMemo(() => funnelSummary(cards), [cards]);

  const move = (id: string, to: Stage, reason: string | null = null) => {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === to) return;
    if (to === "perdidos" && reason === null) { setLost({ id, reason: LOST_REASONS[0], other: "" }); return; }
    const before = cards;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage: to } : c))); // otimista
    start(async () => {
      const r = await moveQuoteAction(id, to, reason);
      if (!r.ok) { setCards(before); setMsg({ tone: "danger", text: r.error }); return; }
      setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage: stageOf(r.data.status), status: r.data.status, closedAt: r.data.closedAt, lostReason: r.data.lostReason } : c)));
      setMsg({ tone: "success", text: `${card.code} movido para ${STAGES.find((s) => s.key === to)!.label}.` });
      router.refresh();
    });
  };

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Em aberto" value={formatBRL(sum.total.salvos)} hint={`${sum.count.salvos} orçamento(s) salvos`} />
        <Kpi label="Fechados" value={formatBRL(sum.total.fechados)} hint={sum.avgTicket ? `${sum.count.fechados} · ticket médio ${formatBRL(sum.avgTicket)}` : `${sum.count.fechados} orçamento(s)`} />
        <Kpi label="Perdidos" value={formatBRL(sum.total.perdidos)} hint={`${sum.count.perdidos} orçamento(s)`} />
        <Kpi label="Taxa de fechamento" value={sum.conversion == null ? "—" : `${sum.conversion.toLocaleString("pt-BR")}%`} hint={sum.conversionValue == null ? "Fechados ÷ (fechados + perdidos)" : `Em valor: ${sum.conversionValue.toLocaleString("pt-BR")}%`} />
      </div>
      {msg && <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      <div className="grid gap-4 lg:grid-cols-3" aria-busy={pending}>
        {STAGES.map((s) => {
          const list = cards.filter((c) => c.stage === s.key).sort((a, b) => (s.key === "salvos" ? b.createdAt.localeCompare(a.createdAt) : (b.closedAt ?? "").localeCompare(a.closedAt ?? "")));
          const reasons = s.key === "perdidos" ? Object.entries(list.reduce<Record<string, number>>((a, c) => { const k = c.lostReason || "Sem motivo"; a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
          return (
            <section key={s.key} data-stage={s.key} aria-label={`Coluna ${s.label}`}
              onDragOver={(e) => { e.preventDefault(); setOver(s.key); }} onDragLeave={() => setOver((o) => (o === s.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain") || drag; if (id) move(id, s.key); setDrag(null); }}
              className={`flex min-h-[420px] flex-col rounded-lg border border-line border-t-4 bg-[#faf9f6] ${TONE[s.key]} ${over === s.key ? "ring-2 ring-ink/30" : ""}`}>
              <header className="border-b border-line px-4 py-3">
                <div className="flex items-baseline justify-between gap-2"><h2 className="font-sans text-base font-medium">{s.label} <span className="text-sm font-normal text-muted">· {list.length}</span></h2><span className="text-sm font-medium">{formatBRL(list.reduce((a, c) => a + c.totalCents, 0))}</span></div>
                <p className="mt-0.5 text-xs text-muted">{s.hint}</p>
                {reasons.length > 0 && <p className="mt-1 text-[11px] text-muted">Motivos: {reasons.map(([k, n]) => `${k} (${n})`).join(" · ")}</p>}
              </header>
              <ul className="flex flex-1 flex-col gap-2.5 p-3">
                {s.key === "salvos" && closedFilter && <li className="rounded border border-dashed border-line p-3 text-xs text-muted">Com filtro de data de fechamento, só aparecem orçamentos já decididos.</li>}
                {list.map((c) => (
                  <li key={c.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; setDrag(c.id); }} onDragEnd={() => { setDrag(null); setOver(null); }}
                    className={`group cursor-grab rounded-md border border-line bg-white p-3 shadow-sm transition active:cursor-grabbing ${drag === c.id ? "opacity-40" : ""}`} data-card={c.code}>
                    <div className="flex gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-[#ece8e1]">{c.imageUrl && <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2"><Link href={`/admin/orcamentos/${c.id}`} className="text-sm font-semibold hover:underline">{c.code}</Link><span className={`rounded-full px-2 py-0.5 text-[10.5px] ${CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span></div>
                        <p className="truncate text-sm" title={c.clientName}>{c.clientName}</p>
                        {c.category && <p className="mt-0.5"><span className="inline-block max-w-full truncate rounded bg-ink/[0.06] px-1.5 py-0.5 text-[11px]" data-card-cat>{c.category}</span></p>}
                        <p className="truncate text-xs text-muted">{[c.contact, c.city].filter(Boolean).join(" · ") || " "}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2 border-t border-line pt-2 text-xs">
                      <div className="text-muted">
                        <div>Criado {d(c.createdAt)}</div>
                        {c.stage === "salvos" ? <div className={c.validityOver ? "text-danger" : ""}>Válido até {d(c.validUntil)}{c.validityOver && " · validade vencida"}</div> : <div>{c.stage === "fechados" ? "Fechado" : "Perdido"} {d(c.closedAt)}</div>}
                        {c.stage === "perdidos" && c.lostReason && <div className="text-[#a24a3a]">{c.lostReason}</div>}
                      </div>
                      <div className="text-right"><div className="text-sm font-semibold">{formatBRL(c.totalCents)}</div><div className="text-muted">{c.items} {c.items === 1 ? "item" : "itens"}{c.freightTerm === "COTAR" ? " + frete" : ""}</div></div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="flex gap-3">{c.status !== "RASCUNHO" && <Link className="link" href={`/orcamento/${c.id}`}>Ver</Link>}<Link className="link" href={`/admin/orcamentos/${c.id}`}>Editar</Link></span>
                      <select aria-label={`Mover ${c.code}`} className="rounded border border-line bg-white px-1.5 py-1 text-xs" value="" disabled={pending} onChange={(e) => e.target.value && move(c.id, e.target.value as Stage)}>
                        <option value="">Mover para…</option>{STAGES.filter((x) => x.key !== c.stage).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                    </div>
                  </li>
                ))}
                {list.length === 0 && !(s.key === "salvos" && closedFilter) && <li className="rounded border border-dashed border-line p-6 text-center text-xs text-muted">Nenhum orçamento{s.key === "salvos" ? "" : " nesta coluna"}.</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {lost && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="lost-t">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 id="lost-t" className="font-sans text-lg font-medium">Marcar como perdido</h2>
            <p className="mt-1 text-sm text-muted">{cards.find((c) => c.id === lost.id)?.code} · {cards.find((c) => c.id === lost.id)?.clientName}</p>
            <label className="mt-4 block text-sm">Motivo da perda
              <select className="mt-1 h-10 w-full rounded border border-line px-2" value={lost.reason} onChange={(e) => setLost({ ...lost, reason: e.target.value })} autoFocus>
                {LOST_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            {lost.reason === "Outro" && <input className="mt-2 h-10 w-full rounded border border-line px-2 text-sm" placeholder="Descreva o motivo" value={lost.other} onChange={(e) => setLost({ ...lost, other: e.target.value })} aria-label="Outro motivo" />}
            <div className="mt-5 flex justify-end gap-2">
              <button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={() => setLost(null)}>Cancelar</button>
              <button className="h-10 rounded bg-[#a24a3a] px-4 text-sm text-white" onClick={() => { const r = lost.reason === "Outro" ? lost.other.trim() || "Outro" : lost.reason; const id = lost.id; setLost(null); move(id, "perdidos", r); }}>Confirmar perda</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="card p-4"><p className="label">{label}</p><p className="mt-1 text-xl font-medium">{value}</p><p className="mt-0.5 text-xs text-muted">{hint}</p></div>;
}
