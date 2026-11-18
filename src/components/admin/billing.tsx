"use client";
import { useRouter } from "next/navigation";
import { appendFiles } from "@/lib/upload-client";
import { useRef, useState, useTransition } from "react";
import { clearBoletoAction, clearInvoiceAction, setPlannedMethodAction } from "@/modules/admin/finance-actions";
import { RECEIPT_METHODS } from "@/modules/finance/receivables";
import { ACCEPT } from "@/modules/finance/document-rules";

const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function Dialog({ title, sub, children, onClose }: { title: string; sub?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 text-left" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"><h2 className="font-sans text-lg font-medium">{title}</h2>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}{children}</div>
    </div>
  );
}
function FilePick({ files, setFiles, hint }: { files: File[]; setFiles: (f: File[]) => void; hint: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div role="button" tabIndex={0} onClick={() => ref.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFiles([...e.dataTransfer.files].slice(0, 5)); }}
      className="mt-1 cursor-pointer rounded border border-dashed border-line p-3 text-center text-sm">
      {files.length ? files.map((f) => f.name).join(", ") : <>Clique ou arraste <span className="text-muted">(opcional)</span><br /><span className="text-xs text-muted">{hint}</span></>}
      <input ref={ref} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 5))} data-billing-file />
    </div>
  );
}
async function post(fd: FormData) {
  const r = await fetch("/api/admin/financeiro/faturamento", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  return r.ok ? null : (j.error?.message as string) ?? "Erro ao salvar.";
}

/** Informar (ou corrigir) a NF da venda. */
export function InvoiceButton({ saleId, code, client, current, compact }: { saleId: string; code: string; client: string; current?: { number: string; date: string } | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ number: current?.number ?? "", date: current?.date ?? todayBR() });
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const save = async () => {
    setBusy(true); setErr(null);
    const fd = new FormData(); fd.set("kind", "nf"); fd.set("saleId", saleId); fd.set("number", f.number); fd.set("date", f.date);
    try { await appendFiles(fd, files, "doc"); } catch (x) { setBusy(false); return setErr(x instanceof Error ? x.message : "Falha no envio."); }
    const e = await post(fd); setBusy(false);
    if (e) return setErr(e);
    setOpen(false); setFiles([]); router.refresh();
  };
  return (
    <>
      <button className={current ? "link text-xs" : compact ? "inline-flex h-8 items-center whitespace-nowrap rounded bg-accent px-3 text-xs text-accent-ink" : "inline-flex h-9 items-center rounded bg-accent px-4 text-sm text-accent-ink"} onClick={() => setOpen(true)} data-invoice={code}>{current ? "Corrigir NF" : "Informar NF"}</button>
      {open && (
        <Dialog title={current ? "Corrigir a NF" : "Informar a NF"} sub={`${code} · ${client}`} onClose={() => setOpen(false)}>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <label>Número da NF<input className="mt-1 h-10 w-full rounded border border-line px-2" inputMode="numeric" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} autoFocus placeholder="Ex.: 1234" /></label>
            <label>Data de emissão<input type="date" className="mt-1 h-10 w-full rounded border border-line px-2" max={todayBR()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
            <div className="col-span-2">PDF (DANFE) e/ou XML da NF<FilePick files={files} setFiles={setFiles} hint="PDF ou XML · até 15 MB" /></div>
          </div>
          {err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
          <div className="mt-5 flex justify-end gap-2"><button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="h-10 rounded bg-accent px-4 text-sm text-accent-ink disabled:opacity-50" disabled={busy || !f.number.trim()} onClick={save}>{busy ? "Salvando…" : "Salvar NF"}</button></div>
        </Dialog>
      )}
    </>
  );
}

/** Registrar o boleto da parcela (número e/ou PDF). */
export function BoletoButton({ receivableId, code, client, label, amount, due, current, compact }: { receivableId: string; code: string; client: string; label: string; amount: string; due: string; current?: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState(current ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const save = async () => {
    setBusy(true); setErr(null);
    const fd = new FormData(); fd.set("kind", "boleto"); fd.set("receivableId", receivableId); fd.set("number", num);
    try { await appendFiles(fd, files, "doc"); } catch (x) { setBusy(false); return setErr(x instanceof Error ? x.message : "Falha no envio."); }
    const e = await post(fd); setBusy(false);
    if (e) return setErr(e);
    setOpen(false); setFiles([]); router.refresh();
  };
  return (
    <>
      <button className={compact ? "inline-flex h-8 items-center whitespace-nowrap rounded bg-accent px-3 text-xs text-accent-ink" : "link text-xs"} onClick={() => setOpen(true)} data-boleto={`${code} ${label}`}>{current ? "Editar boleto" : "Registrar boleto"}</button>
      {open && (
        <Dialog title="Registrar boleto" sub={`${code} · ${client} · ${label} · ${amount} · vence ${due}`} onClose={() => setOpen(false)}>
          <div className="mt-4 grid gap-3 text-sm">
            <label>Nosso número ou linha digitável<input className="mt-1 h-10 w-full rounded border border-line px-2" value={num} onChange={(e) => setNum(e.target.value)} placeholder="Opcional se anexar o PDF" autoFocus /></label>
            <div>PDF do boleto<FilePick files={files} setFiles={setFiles} hint="PDF ou imagem · até 15 MB" /></div>
            <p className="text-xs text-muted">Informe o número, anexe o PDF, ou os dois.</p>
          </div>
          {err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
          <div className="mt-5 flex justify-end gap-2"><button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="h-10 rounded bg-accent px-4 text-sm text-accent-ink disabled:opacity-50" disabled={busy || (!num.trim() && !files.length)} onClick={save}>{busy ? "Salvando…" : "Salvar boleto"}</button></div>
        </Dialog>
      )}
    </>
  );
}

/** Forma prevista da parcela (padrão vem da condição de pagamento). */
export function PlannedMethodSelect({ receivableId, value, fallback }: { receivableId: string; value: string | null; fallback: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select aria-label="Forma prevista" className="h-8 max-w-36 rounded border border-line bg-white px-1 text-xs disabled:opacity-50" disabled={pending} value={value ?? ""}
      onChange={(e) => start(async () => { const r = await setPlannedMethodAction(receivableId, e.target.value); if (!r.ok) alert(r.error); router.refresh(); })} data-planned={receivableId}>
      <option value="">{fallback ? `${fallback} (padrão)` : "A definir"}</option>
      {RECEIPT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  );
}

export function UndoButton({ kind, id, label }: { kind: "nf" | "boleto"; id: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button className="text-xs text-muted hover:text-danger hover:underline disabled:opacity-50" disabled={pending}
    onClick={() => { if (confirm(kind === "nf" ? "Desfazer o registro da NF desta venda? O arquivo anexado continua nos documentos." : "Desfazer o registro do boleto desta parcela? O PDF do boleto anexado a ela também será removido.")) start(async () => { const r = kind === "nf" ? await clearInvoiceAction(id) : await clearBoletoAction(id); if (!r.ok) alert(r.error); router.refresh(); }); }}>{label}</button>;
}
