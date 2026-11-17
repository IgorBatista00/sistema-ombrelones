"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { registerMovementAction, saveStockDisplayAction, setMinQtyAction } from "@/modules/admin/stock-actions";
import { MOVEMENT_LABEL, MOVEMENT_REASONS, planMovement, stockText, type ManualMovementType, type StockDisplay } from "@/modules/inventory/movements-rules";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";

/** Mínimo editável direto na tabela (salva ao sair do campo). */
export function MinQtyInput({ variantId, value, label }: { variantId: string; value: number; label: string }) {
  const [v, setV] = useState(String(value));
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const router = useRouter();
  return (
    <input className={`h-8 w-16 rounded border px-2 text-sm ${state === "error" ? "border-danger" : state === "saved" ? "border-success" : "border-line"}`} type="number" min={0} value={v} aria-label={`Estoque mínimo de ${label}`}
      onChange={(e) => { setV(e.target.value); setState("idle"); }}
      onBlur={async () => { const n = parseInt(v, 10); if (Number.isNaN(n) || n === value) return; const r = await setMinQtyAction(variantId, n); setState(r.ok ? "saved" : "error"); router.refresh(); }} />
  );
}

type Row = { variantId: string; sku: string; name: string; onHand: number; reserved: number };

export function MoveButton({ row, display, button }: { row: Row; display: StockDisplay; button?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {button ? <Button className="h-10 px-5" onClick={() => setOpen(true)}>Movimentar</Button> : <button className="link" onClick={() => setOpen(true)}>Movimentar</button>}
      {open && <MoveDialog row={row} display={display} onClose={() => setOpen(false)} />}
    </>
  );
}

function MoveDialog({ row, display, onClose }: { row: Row; display: StockDisplay; onClose: () => void }) {
  const [type, setType] = useState<ManualMovementType>("ENTRADA");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const n = qty === "" ? null : Number(qty);
  const plan = n == null ? null : planMovement({ onHand: row.onHand, reserved: row.reserved }, type, n);
  const free = Math.max(0, row.onHand - row.reserved);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="Movimentar estoque" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card w-full max-w-lg p-6 text-left" onSubmit={(e) => {
        e.preventDefault(); setError(null);
        start(async () => {
          const r = await registerMovementAction({ variantId: row.variantId, type, quantity: qty, reason, notes, reference });
          if (!r.ok) return setError(r.error);
          onClose(); router.refresh();
        });
      }}>
        <h2 className="font-sans text-lg font-medium">Movimentar estoque</h2>
        <p className="mt-1 text-sm text-muted">{row.sku} · {row.name}</p>
        <div className="mt-4 grid grid-cols-3 gap-3 rounded bg-canvas p-3 text-sm">
          <div><p className="label">Físico</p>{row.onHand}</div><div><p className="label">Reservado</p>{row.reserved}</div><div><p className="label">Disponível</p><strong className="font-medium">{free}</strong></div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Tipo">
          {(["ENTRADA", "SAIDA", "AJUSTE"] as const).map((t) => <button key={t} type="button" aria-pressed={type === t} onClick={() => { setType(t); setReason(""); }} className={`rounded border px-3 py-2 text-sm ${type === t ? "border-ink" : "border-line hover:border-ink/40"}`}>{MOVEMENT_LABEL[t]}</button>)}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={type === "AJUSTE" ? "Saldo contado (un.)" : "Quantidade (un.)"} htmlFor="mv-q"><Input id="mv-q" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className="h-10" required autoFocus /></Field>
          <Field label="Motivo" htmlFor="mv-r"><Select id="mv-r" value={reason} onChange={(e) => setReason(e.target.value)} className="h-10" required><option value="">Selecione</option>{MOVEMENT_REASONS[type].map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Documento (NF, pedido…)" htmlFor="mv-ref"><Input id="mv-ref" value={reference} onChange={(e) => setReference(e.target.value)} className="h-10" /></Field>
          <Field label="Observação" htmlFor="mv-n"><Input id="mv-n" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10" /></Field>
        </div>
        <p className="mt-4 min-h-5 text-sm">
          {plan?.ok && <>Físico: {row.onHand} → <strong className="font-medium">{plan.after}</strong> · cliente verá: <span className="text-success">{stockText(Math.max(0, plan.after - row.reserved), display)}</span></>}
          {plan && !plan.ok && <span className="text-danger">{plan.error}</span>}
        </p>
        {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" className="h-10" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="h-10 px-5" disabled={pending || !plan?.ok || !reason}>{pending ? "Registrando…" : "Registrar"}</Button>
        </div>
      </form>
    </div>
  );
}

export function StockDisplayForm({ initial }: { initial: StockDisplay }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = v.mode !== initial.mode || v.lowThreshold !== initial.lowThreshold;
  return (
    <div className="card mt-4 flex flex-wrap items-end gap-5 p-5">
      <div className="min-w-60 flex-1"><p className="label mb-1">Exibição na loja</p><p className="text-sm text-muted">Como a quantidade disponível aparece para os clientes no catálogo e na página do produto. Disponível = físico − reservado em pedidos.</p></div>
      <Field label="Modo" htmlFor="sd-mode"><Select id="sd-mode" className="h-10 w-72" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value as StockDisplay["mode"] })}>
        <option value="exata">Quantidade exata (24 unidades disponíveis)</option><option value="faixa">Faixa (Mais de 10 unidades)</option><option value="simples">Apenas “Em estoque” / “Sem estoque”</option></Select></Field>
      <Field label="“Últimas unidades” até" htmlFor="sd-low"><Input id="sd-low" type="number" min={0} className="h-10 w-28" value={v.lowThreshold} onChange={(e) => setV({ ...v, lowThreshold: Math.max(0, parseInt(e.target.value, 10) || 0) })} /></Field>
      <div className="text-sm"><p className="label mb-1">Exemplo (24 un.)</p><p className="text-success">{stockText(24, v)}</p><p className="text-xs text-success">{stockText(3, v)}</p></div>
      <Button className="h-10 px-5" disabled={!dirty || pending} onClick={() => start(async () => { const r = await saveStockDisplayAction(v); setMsg(r.ok ? "Salvo" : r.error); router.refresh(); })}>Salvar</Button>
      {msg && <span className="text-sm text-success">{msg}</span>}
    </div>
  );
}
