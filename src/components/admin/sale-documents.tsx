"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addNoteAction, removeDocumentAction, removeNoteAction } from "@/modules/admin/finance-actions";
import { ACCEPT, DOC_TYPES, type DocTypeKey } from "@/modules/finance/document-rules";

/** Envio de documentos: tipo, parcela (opcional), descrição e arquivos (clique ou arraste). */
export function DocumentUploader({ saleId, receivables, presetType, presetReceivable, compact }: { saleId: string; receivables: { id: string; label: string }[]; presetType?: DocTypeKey; presetReceivable?: string; compact?: boolean }) {
  const [type, setType] = useState<DocTypeKey>(presetType ?? "NOTA_FISCAL");
  const [rec, setRec] = useState(presetReceivable ?? "");
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  async function send() {
    if (!files.length) return setMsg({ ok: false, text: "Selecione o arquivo." });
    setBusy(true); setMsg(null);
    const fd = new FormData(); fd.set("saleId", saleId); fd.set("type", type); if (rec) fd.set("receivableId", rec); if (desc) fd.set("description", desc);
    files.forEach((f) => fd.append("files", f));
    try {
      const res = await fetch("/api/admin/financeiro/documentos", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) setMsg({ ok: false, text: j.error?.message ?? "Erro no envio." });
      else { setMsg({ ok: true, text: `${j.data.length} arquivo(s) anexado(s).` }); setFiles([]); setDesc(""); router.refresh(); }
    } catch { setMsg({ ok: false, text: "Falha de conexão." }); }
    setBusy(false);
  }
  const showRec = type === "BOLETO" || type === "COMPROVANTE" || !!rec;
  return (
    <div className={compact ? "" : "card p-4"}>
      {!compact && <p className="label mb-3">Anexar documento</p>}
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label>Tipo<select className="mt-1 h-10 w-full rounded border border-line px-2" value={type} onChange={(e) => setType(e.target.value as DocTypeKey)} aria-label="Tipo do documento">{Object.entries(DOC_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {showRec ? <label>Parcela<select className="mt-1 h-10 w-full rounded border border-line px-2" value={rec} onChange={(e) => setRec(e.target.value)} aria-label="Parcela"><option value="">Venda inteira</option>{receivables.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label> : <div />}
        <label className="sm:col-span-2">Descrição<input className="mt-1 h-10 w-full rounded border border-line px-2" placeholder={type === "NOTA_FISCAL" ? "Ex.: NF-e 1234 série 1" : "Opcional"} value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Descrição do documento" /></label>
      </div>
      <div role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); setFiles([...e.dataTransfer.files].slice(0, 10)); }}
        className={`mt-3 cursor-pointer rounded border border-dashed p-4 text-center text-sm ${over ? "border-ink bg-ink/5" : "border-line"}`}>
        {files.length ? files.map((f) => f.name).join(", ") : <>Clique ou arraste o arquivo aqui<br /><span className="text-xs text-muted">PDF, XML da NF-e, JPG, PNG ou WebP · até 15 MB</span></>}
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 10))} data-doc-input />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`text-sm ${msg ? (msg.ok ? "text-success" : "text-danger") : ""}`} role={msg ? "status" : undefined}>{msg?.text}</span>
        <button className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink disabled:opacity-50" disabled={busy || !files.length} onClick={send}>{busy ? "Enviando…" : "Anexar"}</button>
      </div>
    </div>
  );
}

export function RemoveDocumentButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition(); const router = useRouter();
  return <button className="text-xs text-danger underline-offset-2 hover:underline" disabled={pending} onClick={() => { if (confirm(`Remover “${name}” da venda? (fica registrado no histórico)`)) start(async () => { const r = await removeDocumentAction(id); if (!r.ok) alert(r.error); router.refresh(); }); }}>Remover</button>;
}

export function NotesPanel({ saleId, notes, me }: { saleId: string; notes: { id: string; text: string; authorId: string; authorName: string; createdAt: string }[]; me: string }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition(); const router = useRouter();
  return (
    <div className="card p-4">
      <p className="label mb-3">Observações</p>
      <textarea className="w-full rounded border border-line p-2 text-sm" rows={3} maxLength={2000} placeholder="Ex.: cliente pediu para enviar boleto por e-mail ao financeiro dele; NF emitida com CFOP 5102…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Nova observação" />
      <div className="mt-2 flex items-center justify-between gap-3"><span className="text-sm text-danger" role={err ? "alert" : undefined}>{err}</span>
        <button className="inline-flex h-9 items-center rounded bg-accent px-4 text-sm text-accent-ink disabled:opacity-50" disabled={pending || !text.trim()} onClick={() => start(async () => { const r = await addNoteAction(saleId, text); if (!r.ok) return setErr(r.error); setErr(null); setText(""); router.refresh(); })}>Adicionar observação</button></div>
      <ul className="mt-4 space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="border-t border-line pt-3 text-sm" data-note>
            <p className="whitespace-pre-line">{n.text}</p>
            <p className="mt-1 flex justify-between gap-2 text-xs text-muted"><span>{n.authorName} · {new Date(n.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</span>
              {n.authorId === me && <button className="text-danger hover:underline" onClick={() => { if (confirm("Excluir esta observação?")) start(async () => { await removeNoteAction(n.id); router.refresh(); }); }}>Excluir</button>}</p>
          </li>
        ))}
        {notes.length === 0 && <li className="text-sm text-muted">Nenhuma observação.</li>}
      </ul>
    </div>
  );
}
