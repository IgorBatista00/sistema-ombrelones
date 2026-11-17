"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dueDateAction, receiveAction, reverseAction } from "@/modules/admin/finance-actions";
import { RECEIPT_METHODS } from "@/modules/finance/receivables";
import { formatBRL } from "@/lib/money";

const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const inBR = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** Ações da parcela: dar baixa (modal), estornar, definir vencimento. */
export function ReceivableActions({ id, label, code, client, amountCents, state, suggestedMethod }: { id: string; label: string; code: string; client: string; amountCents: number; state: string; suggestedMethod: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ receivedAt: todayBR(), amount: inBR(amountCents), method: suggestedMethod, note: "" });
  const [due, setDue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (p: Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => { const r = await p; if (!r.ok) setErr(r.error ?? "Erro"); else { setErr(null); after?.(); router.refresh(); } });

  if (state === "recebido") return <button className="link text-xs" disabled={pending} onClick={() => { if (confirm(`Estornar o recebimento da parcela ${label} (${code})?`)) go(reverseAction(id)); }}>Estornar</button>;
  if (state === "cancelado") return null;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {state === "a_definir" && (
        <span className="inline-flex items-center gap-1"><input type="date" className="h-8 rounded border border-line px-1 text-xs" value={due} onChange={(e) => setDue(e.target.value)} aria-label={`Vencimento da parcela ${label}`} />
          <button className="link text-xs" disabled={!due || pending} onClick={() => go(dueDateAction(id, due))}>Definir</button></span>
      )}
      <button className="inline-flex h-8 items-center whitespace-nowrap rounded bg-accent px-3 text-xs text-accent-ink" onClick={() => setOpen(true)} data-receive={code + " " + label}>Dar baixa</button>
      {err && !open && <span className="text-xs text-danger">{err}</span>}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 text-left" role="dialog" aria-modal="true" aria-labelledby={`rb-${id}`}>
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 id={`rb-${id}`} className="font-sans text-lg font-medium">Registrar recebimento</h2>
            <p className="mt-1 text-sm text-muted">{code} · parcela {label} · {client}<br />Valor da parcela: {formatBRL(amountCents)}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <label>Data do recebimento<input type="date" className="mt-1 h-10 w-full rounded border border-line px-2" value={f.receivedAt} max={todayBR()} onChange={(e) => setF({ ...f, receivedAt: e.target.value })} /></label>
              <label>Valor recebido (R$)<input className="mt-1 h-10 w-full rounded border border-line px-2" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
              <label className="col-span-2">Forma<select className="mt-1 h-10 w-full rounded border border-line px-2" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{RECEIPT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
              <label className="col-span-2">Observação<input className="mt-1 h-10 w-full rounded border border-line px-2" placeholder="Opcional (ex.: nº do comprovante)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
            </div>
            {err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={() => { setOpen(false); setErr(null); }}>Cancelar</button>
              <button className="h-10 rounded bg-accent px-4 text-sm text-accent-ink" disabled={pending} onClick={() => go(receiveAction(id, f), () => setOpen(false))}>{pending ? "Salvando…" : "Confirmar recebimento"}</button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
