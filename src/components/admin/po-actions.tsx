"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { changePoDateAction, deletePoReceiptAction, registerPoReceiptAction, setPoStatusAction } from "@/modules/admin/purchase-order-actions";

const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const inp = "mt-1 h-10 w-full rounded border border-line px-2";
const btn = "inline-flex h-9 items-center whitespace-nowrap rounded px-4 text-sm";

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 text-left" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"><h2 className="font-sans text-lg font-medium">{title}</h2>{children}</div>
    </div>
  );
}
function useAct() {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, done: () => void) => { setErr(null); start(async () => { const r = await fn(); if (!r.ok) return setErr(r.error ?? "Erro."); done(); router.refresh(); }); };
  return { err, pending, go };
}
const Err = ({ e }: { e: string | null }) => (e ? <p className="mt-3 rounded border border-danger/40 bg-danger/5 p-2 text-sm text-danger" role="alert">{e}</p> : null);

type Item = { id: string; description: string; unit: string; quantity: number; received: number; pending: number };

export function ReceiptButton({ id, code, items, orderedAt }: { id: string; code: string; items: Item[]; orderedAt: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ receivedAt: todayBR(), invoiceNumber: "", receivedBy: "", notes: "" });
  const [q, setQ] = useState<Record<string, string>>({});
  const { err, pending, go } = useAct();
  const openIt = () => { setQ(Object.fromEntries(items.filter((i) => i.pending > 0).map((i) => [i.id, fmt(i.pending)]))); setF({ receivedAt: todayBR(), invoiceNumber: "", receivedBy: "", notes: "" }); setOpen(true); };
  return (
    <>
      <button className={`${btn} bg-accent text-accent-ink`} onClick={openIt} data-po-receive>Registrar entrega</button>
      {open && (
        <Dialog title={`Entrega da ${code}`} onClose={() => setOpen(false)}>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <label className="text-xs text-muted">Data em que chegou *<input type="date" className={inp} value={f.receivedAt} min={orderedAt} max={todayBR()} onChange={(e) => setF({ ...f, receivedAt: e.target.value })} /></label>
            <label className="text-xs text-muted">Nota fiscal do fornecedor<input className={inp} value={f.invoiceNumber} maxLength={40} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} /></label>
            <label className="col-span-2 text-xs text-muted">Conferido por<input className={inp} value={f.receivedBy} maxLength={80} onChange={(e) => setF({ ...f, receivedBy: e.target.value })} /></label>
          </div>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-label text-muted"><tr><th className="py-2 font-normal">Item</th><th className="py-2 font-normal">Saldo</th><th className="py-2 font-normal">Chegou agora</th></tr></thead>
            <tbody className="divide-y divide-line">{items.filter((i) => i.pending > 0).map((i) => (
              <tr key={i.id}><td className="py-2 pr-2">{i.description}</td><td className="whitespace-nowrap py-2 pr-2">{fmt(i.pending)} {i.unit}</td>
                <td className="py-2"><input className="h-9 w-24 rounded border border-line px-2" inputMode="decimal" aria-label={`Quantidade recebida de ${i.description}`} value={q[i.id] ?? ""} onChange={(e) => setQ({ ...q, [i.id]: e.target.value })} /></td></tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Veio faltando? Ajuste a quantidade; o restante continua como saldo pendente. Deixe 0 no que não chegou.</p>
          <label className="mt-3 block text-xs text-muted">Observações<textarea className="mt-1 w-full rounded border border-line p-2" rows={2} maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Avarias, divergências…" /></label>
          <Err e={err} />
          <div className="mt-4 flex justify-end gap-2"><button className={`${btn} hover:bg-ink/5`} onClick={() => setOpen(false)}>Cancelar</button>
            <button className={`${btn} bg-accent text-accent-ink`} disabled={pending} onClick={() => go(() => registerPoReceiptAction(id, { ...f, lines: Object.entries(q).map(([itemId, quantity]) => ({ itemId, quantity: quantity || "0" })) }), () => setOpen(false))}>{pending ? "Salvando…" : "Confirmar entrega"}</button></div>
        </Dialog>
      )}
    </>
  );
}

export function DateButton({ id, code, current, orderedAt }: { id: string; code: string; current: string; orderedAt: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ promisedAt: current, reason: "" });
  const { err, pending, go } = useAct();
  return (
    <>
      <button className={`${btn} border border-line hover:bg-ink/5`} onClick={() => { setF({ promisedAt: current, reason: "" }); setOpen(true); }} data-po-date>{current ? "Alterar data prometida" : "Informar data prometida"}</button>
      {open && (
        <Dialog title={`Data prometida · ${code}`} onClose={() => setOpen(false)}>
          <label className="mt-4 block text-xs text-muted">Nova data de entrega *<input type="date" className={inp} min={orderedAt} value={f.promisedAt} onChange={(e) => setF({ ...f, promisedAt: e.target.value })} /></label>
          <label className="mt-3 block text-xs text-muted">Motivo *<input className={inp} maxLength={300} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={current ? "Ex.: fornecedor atrasou a produção" : "Ex.: confirmado por telefone com o fornecedor"} /></label>
          <p className="mt-2 text-xs text-muted">A data original fica guardada no histórico para medir a pontualidade do fornecedor.</p>
          <Err e={err} />
          <div className="mt-4 flex justify-end gap-2"><button className={`${btn} hover:bg-ink/5`} onClick={() => setOpen(false)}>Cancelar</button>
            <button className={`${btn} bg-accent text-accent-ink`} disabled={pending} onClick={() => go(() => changePoDateAction(id, f), () => setOpen(false))}>{pending ? "Salvando…" : "Salvar data"}</button></div>
        </Dialog>
      )}
    </>
  );
}

export function StatusButton({ id, code, action }: { id: string; code: string; action: "encerrar" | "cancelar" | "reabrir" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { err, pending, go } = useAct();
  const label = { encerrar: "Encerrar com saldo", cancelar: "Cancelar OC", reabrir: "Reabrir OC" }[action];
  const help = {
    encerrar: "Use quando o fornecedor não vai entregar o restante. O saldo pendente deixa de contar como atraso; o que já chegou continua registrado.",
    cancelar: "A OC deixa de ser acompanhada. Só é possível cancelar se nada foi entregue.",
    reabrir: "A OC volta para “em aberto” e o saldo pendente volta a ser acompanhado.",
  }[action];
  return (
    <>
      <button className={`${btn} ${action === "cancelar" ? "text-danger hover:bg-danger/5" : "border border-line hover:bg-ink/5"}`} onClick={() => { setReason(""); setOpen(true); }} data-po-status={action}>{label}</button>
      {open && (
        <Dialog title={`${label} · ${code}`} onClose={() => setOpen(false)}>
          <p className="mt-3 text-sm text-muted">{help}</p>
          {action !== "reabrir" && <label className="mt-3 block text-xs text-muted">Motivo *<input className={inp} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
          <Err e={err} />
          <div className="mt-4 flex justify-end gap-2"><button className={`${btn} hover:bg-ink/5`} onClick={() => setOpen(false)}>Voltar</button>
            <button className={`${btn} ${action === "cancelar" ? "bg-danger text-white" : "bg-accent text-accent-ink"}`} disabled={pending} onClick={() => go(() => setPoStatusAction(id, action, reason), () => setOpen(false))}>{pending ? "Salvando…" : label}</button></div>
        </Dialog>
      )}
    </>
  );
}

export function DeleteReceiptButton({ orderId, receiptId, label }: { orderId: string; receiptId: string; label: string }) {
  const [confirm, setConfirm] = useState(false);
  const { err, pending, go } = useAct();
  if (!confirm) return <button className="text-xs text-danger hover:underline" onClick={() => setConfirm(true)}>Excluir entrega</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <span>Excluir a entrega de {label}?</span>
      <button className="rounded bg-danger px-2 py-1 text-white" disabled={pending} onClick={() => go(() => deletePoReceiptAction(orderId, receiptId), () => setConfirm(false))}>{pending ? "…" : "Excluir"}</button>
      <button className="px-1 hover:underline" onClick={() => setConfirm(false)}>Não</button>
      {err && <span className="text-danger">{err}</span>}
    </span>
  );
}
