"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateDeliveryAction } from "@/modules/admin/delivery-actions";
import { DELIVERY_STATUS, type DeliveryStatusKey } from "@/modules/deliveries/rules";

const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "");
const input = "mt-1 h-10 w-full rounded border border-line px-2";
type D = { id: string; code: string; status: DeliveryStatusKey; scheduledAt: string | null; shippedAt: string | null; deliveredAt: string | null; carrier: string | null; trackingCode: string | null; receivedBy: string | null; notes: string | null; address: string; contact: string | null; phone: string | null };

/** Botões rápidos (próximo passo) + "Atualizar" com todos os campos. */
export function DeliveryUpdate({ d }: { d: D }) {
  const [open, setOpen] = useState<null | DeliveryStatusKey>(null);
  const next: [DeliveryStatusKey, string] | null = d.status === "A_AGENDAR" ? ["AGENDADA", "Agendar"] : d.status === "AGENDADA" ? ["EM_ROTA", "Saiu para entrega"] : d.status === "EM_ROTA" ? ["ENTREGUE", "Confirmar entrega"] : null;
  if (d.status === "CANCELADA") return <span className="text-xs text-muted">Pedido reaberto/perdido no funil</span>;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {next && <button className="inline-flex h-9 items-center whitespace-nowrap rounded bg-accent px-4 text-sm text-accent-ink" onClick={() => setOpen(next[0])} data-next={d.code}>{next[1]}</button>}
      <button className="inline-flex h-9 items-center rounded border border-line px-3 text-sm hover:bg-ink/5" onClick={() => setOpen(d.status)} data-edit={d.code}>{d.status === "ENTREGUE" ? "Editar" : "Atualizar"}</button>
      {open && <Form d={d} initialStatus={open} onClose={() => setOpen(null)} />}
    </span>
  );
}

function Form({ d, initialStatus, onClose }: { d: D; initialStatus: DeliveryStatusKey; onClose: () => void }) {
  const [f, setF] = useState({
    status: initialStatus, scheduledAt: day(d.scheduledAt) || (initialStatus === "AGENDADA" ? "" : ""), shippedAt: day(d.shippedAt) || todayBR(), deliveredAt: day(d.deliveredAt) || todayBR(),
    carrier: d.carrier ?? "", trackingCode: d.trackingCode ?? "", receivedBy: d.receivedBy ?? "", notes: d.notes ?? "", address: d.address, contact: d.contact ?? "", phone: d.phone ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const s = f.status;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 text-left" role="dialog" aria-modal="true" aria-label={`Entrega do pedido ${d.code}`} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h2 className="font-sans text-lg font-medium">Entrega do pedido {d.code}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2">Situação<select className={input} value={s} onChange={(e) => set("status", e.target.value)} aria-label="Situação da entrega">
            {(["A_AGENDAR", "AGENDADA", "EM_ROTA", "ENTREGUE"] as DeliveryStatusKey[]).map((k) => <option key={k} value={k}>{DELIVERY_STATUS[k].label}</option>)}</select></label>
          {s !== "A_AGENDAR" && <label>Data agendada{s === "AGENDADA" && " *"}<input type="date" className={input} value={f.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} aria-label="Data agendada" /></label>}
          {(s === "EM_ROTA") && <label>Saiu em<input type="date" className={input} value={f.shippedAt} max={todayBR()} onChange={(e) => set("shippedAt", e.target.value)} aria-label="Data de saída" /></label>}
          {s === "ENTREGUE" && <label>Entregue em *<input type="date" className={input} value={f.deliveredAt} max={todayBR()} onChange={(e) => set("deliveredAt", e.target.value)} aria-label="Data da entrega" /></label>}
          {s === "ENTREGUE" && <label className="col-span-2">Recebido por<input className={input} value={f.receivedBy} onChange={(e) => set("receivedBy", e.target.value)} placeholder="Nome de quem recebeu" aria-label="Recebido por" /></label>}
          {s !== "A_AGENDAR" && <label>Transportadora / responsável<input className={input} value={f.carrier} onChange={(e) => set("carrier", e.target.value)} placeholder="Ex.: frota própria — Carlos" aria-label="Transportadora ou responsável" /></label>}
          {s !== "A_AGENDAR" && <label>Rastreio / nº da coleta<input className={input} value={f.trackingCode} onChange={(e) => set("trackingCode", e.target.value)} aria-label="Código de rastreio" /></label>}
          <label className="col-span-2">Endereço de entrega<textarea className="mt-1 w-full rounded border border-line p-2" rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} aria-label="Endereço de entrega" /></label>
          <label>Contato no local<input className={input} value={f.contact} onChange={(e) => set("contact", e.target.value)} aria-label="Contato no local" /></label>
          <label>Telefone<input className={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} aria-label="Telefone" /></label>
          <label className="col-span-2">Observações da entrega<textarea className="mt-1 w-full rounded border border-line p-2" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ex.: portaria só até 17h; usar elevador de serviço" aria-label="Observações da entrega" /></label>
        </div>
        {err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={onClose}>Cancelar</button>
          <button className="h-10 rounded bg-accent px-4 text-sm text-accent-ink" disabled={pending} onClick={() => start(async () => { const r = await updateDeliveryAction(d.id, f); if (!r.ok) return setErr(r.error); onClose(); router.refresh(); })}>{pending ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}
