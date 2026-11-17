"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createExpensesAction, deleteExpenseAction, payExpenseAction, removeExpenseDocumentAction, reverseExpenseAction, saveExpenseCategoriesAction, updateExpenseAction } from "@/modules/admin/finance-actions";
import { RECEIPT_METHODS } from "@/modules/finance/receivables";
import { ACCEPT, DOC_TYPES, type DocTypeKey } from "@/modules/finance/document-rules";
import { buildExpenseSeries } from "@/modules/finance/expense-rules";
import { formatBRL } from "@/lib/money";

const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const inBR = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const toCents = (v: string) => { const t = v.trim().replace(/[R$\s]/g, ""); const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const dBR = (iso: string) => iso.split("-").reverse().join("/");
const input = "mt-1 h-10 w-full rounded border border-line px-2";

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 text-left" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className={`max-h-[92dvh] w-full overflow-y-auto rounded-lg bg-white p-5 shadow-xl ${wide ? "max-w-xl" : "max-w-md"}`}><h2 className="font-sans text-lg font-medium">{title}</h2>{children}</div>
    </div>
  );
}
function Footer({ err, pending, onClose, onOk, ok }: { err: string | null; pending: boolean; onClose: () => void; onOk: () => void; ok: string }) {
  return (<>{err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
    <div className="mt-5 flex justify-end gap-2"><button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={onClose}>Cancelar</button>
      <button className="h-10 rounded bg-accent px-4 text-sm text-accent-ink disabled:opacity-50" disabled={pending} onClick={onOk}>{pending ? "Salvando…" : ok}</button></div></>);
}
function useAct() {
  const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition(); const router = useRouter();
  const go = (p: () => Promise<{ ok: boolean; error?: string }>, after: () => void) => start(async () => { const r = await p(); if (!r.ok) return setErr(r.error ?? "Erro"); setErr(null); after(); router.refresh(); });
  return { err, pending, go, setErr };
}

export function ExpenseToolbar({ categories, payees }: { categories: string[]; payees: string[] }) {
  const [open, setOpen] = useState<null | "new" | "cats">(null);
  return (
    <div className="flex gap-2">
      <button className="inline-flex h-10 items-center rounded border border-ink/70 px-4 text-sm hover:bg-ink hover:text-canvas" onClick={() => setOpen("cats")}>Categorias</button>
      <button className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink" onClick={() => setOpen("new")} data-new-expense>Nova saída</button>
      {open === "new" && <NewExpense categories={categories} payees={payees} onClose={() => setOpen(null)} />}
      {open === "cats" && <Categories categories={categories} onClose={() => setOpen(null)} />}
    </div>
  );
}

function NewExpense({ categories, payees, onClose }: { categories: string[]; payees: string[]; onClose: () => void }) {
  const [f, setF] = useState({ description: "", category: categories[0], payee: "", amount: "", dueDate: todayBR(), repeat: "none", times: "2", paidNow: false, paidAt: todayBR(), method: "Pix", note: "" });
  const a = useAct();
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const cents = toCents(f.amount);
  const preview = f.repeat !== "none" && cents > 0 ? buildExpenseSeries(cents, f.dueDate, f.repeat as "installments" | "monthly", Number(f.times) || 1) : [];
  return (
    <Modal title="Nova saída" onClose={onClose} wide>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2">Descrição<input className={input} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Ex.: Frete da coleta de 14/11, Aluguel do galpão" autoFocus /></label>
        <label>Categoria<select className={input} value={f.category} onChange={(e) => set("category", e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Fornecedor / favorecido<input className={input} list="exp-payees" value={f.payee} onChange={(e) => set("payee", e.target.value)} placeholder="Opcional" /><datalist id="exp-payees">{payees.map((p) => <option key={p} value={p} />)}</datalist></label>
        <label>{f.repeat === "installments" ? "Valor total (R$)" : "Valor (R$)"}<input className={input} inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" /></label>
        <label>{f.repeat === "none" ? "Vencimento" : "1º vencimento"}<input type="date" className={input} value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></label>
        <label>Repetição<select className={input} value={f.repeat} onChange={(e) => set("repeat", e.target.value)}><option value="none">Não repetir</option><option value="installments">Parcelar o valor (mensal)</option><option value="monthly">Repetir todo mês (mesmo valor)</option></select></label>
        {f.repeat !== "none" ? <label>{f.repeat === "installments" ? "Nº de parcelas" : "Por quantos meses"}<input className={input} inputMode="numeric" value={f.times} onChange={(e) => set("times", e.target.value.replace(/\D/g, "").slice(0, 2))} /></label> : <div />}
        {preview.length > 1 && <p className="col-span-2 rounded bg-ink/[0.04] p-2 text-xs">Serão lançadas {preview.length} saídas: {preview.slice(0, 3).map((p) => `${p.label} ${dBR(p.dueDate)} ${formatBRL(p.amountCents)}`).join(" · ")}{preview.length > 3 ? ` … até ${dBR(preview[preview.length - 1].dueDate)}` : ""}</p>}
        <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={f.paidNow} onChange={(e) => set("paidNow", e.target.checked)} />{preview.length > 1 ? "A primeira já foi paga" : "Já foi paga"}</label>
        {f.paidNow && <><label>Pago em<input type="date" className={input} value={f.paidAt} max={todayBR()} onChange={(e) => set("paidAt", e.target.value)} /></label>
          <label>Forma<select className={input} value={f.method} onChange={(e) => set("method", e.target.value)}>{RECEIPT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label></>}
        <label className="col-span-2">Observação<input className={input} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Opcional (ex.: nº do boleto, NF)" /></label>
      </div>
      <Footer err={a.err} pending={a.pending} onClose={onClose} ok="Salvar" onOk={() => a.go(() => createExpensesAction({ ...f, times: Number(f.times) || 1 }), onClose)} />
    </Modal>
  );
}

function Categories({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const [list, setList] = useState(categories); const [novo, setNovo] = useState(""); const a = useAct();
  return (
    <Modal title="Categorias de saídas" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">Renomear ou excluir não altera saídas já lançadas.</p>
      <ul className="mt-3 space-y-2">{list.map((c, i) => <li key={i} className="flex gap-2"><input className="h-9 flex-1 rounded border border-line px-2 text-sm" value={c} onChange={(e) => setList(list.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Categoria ${i + 1}`} /><button className="text-xs text-danger" onClick={() => setList(list.filter((_, j) => j !== i))}>Excluir</button></li>)}</ul>
      <div className="mt-3 flex gap-2"><input className="h-9 flex-1 rounded border border-line px-2 text-sm" placeholder="Nova categoria" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && novo.trim()) { setList([...list, novo]); setNovo(""); } }} /><button className="link text-sm" disabled={!novo.trim()} onClick={() => { setList([...list, novo]); setNovo(""); }}>Adicionar</button></div>
      <Footer err={a.err} pending={a.pending} onClose={onClose} ok="Salvar categorias" onOk={() => a.go(() => saveExpenseCategoriesAction(list), onClose)} />
    </Modal>
  );
}

export type ExpenseRow = { id: string; description: string; category: string; payee: string | null; amountCents: number; dueDay: string; status: "A_PAGAR" | "PAGA"; paidDay: string | null; paidCents: number | null; method: string | null; note: string | null; seriesId: string | null; seriesLabel: string | null; documents: { id: string; type: DocTypeKey; fileName: string }[] };

export function ExpenseActions({ e, categories }: { e: ExpenseRow; categories: string[] }) {
  const [mode, setMode] = useState<null | "pay" | "edit" | "attach">(null);
  const a = useAct();
  const del = () => {
    if (!confirm(`Excluir a saída “${e.description}${e.seriesLabel ? ` ${e.seriesLabel}` : ""}”?`)) return;
    const future = !!e.seriesId && confirm("Esta saída faz parte de uma série. Excluir também as PRÓXIMAS ainda em aberto? (OK = sim · Cancelar = só esta)");
    a.go(() => deleteExpenseAction(e.id, future), () => {});
  };
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
      {e.status === "A_PAGAR" ? <button className="inline-flex h-8 items-center whitespace-nowrap rounded bg-accent px-3 text-accent-ink" onClick={() => setMode("pay")} data-pay={e.description}>Pagar</button>
        : <button className="link" onClick={() => { if (confirm("Estornar o pagamento desta saída?")) a.go(() => reverseExpenseAction(e.id), () => {}); }}>Estornar</button>}
      <button className="link" onClick={() => setMode("attach")}>Anexar</button>
      <button className="link" onClick={() => setMode("edit")}>Editar</button>
      <button className="link text-danger" onClick={del}>Excluir</button>
      {a.err && !mode && <span className="text-danger">{a.err}</span>}
      {mode === "pay" && <PayForm e={e} onClose={() => setMode(null)} />}
      {mode === "edit" && <EditForm e={e} categories={categories} onClose={() => setMode(null)} />}
      {mode === "attach" && <AttachForm e={e} onClose={() => setMode(null)} />}
    </span>
  );
}

function PayForm({ e, onClose }: { e: ExpenseRow; onClose: () => void }) {
  const [f, setF] = useState({ paidAt: todayBR(), amount: inBR(e.amountCents), method: "Pix", note: "" }); const a = useAct();
  return (
    <Modal title="Registrar pagamento" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">{e.description}{e.seriesLabel ? ` · ${e.seriesLabel}` : ""} · vence {dBR(e.dueDay)} · {formatBRL(e.amountCents)}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <label>Pago em<input type="date" className={input} value={f.paidAt} max={todayBR()} onChange={(x) => setF({ ...f, paidAt: x.target.value })} /></label>
        <label>Valor pago (R$)<input className={input} inputMode="decimal" value={f.amount} onChange={(x) => setF({ ...f, amount: x.target.value })} /></label>
        <label className="col-span-2">Forma<select className={input} value={f.method} onChange={(x) => setF({ ...f, method: x.target.value })}>{RECEIPT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="col-span-2">Observação<input className={input} value={f.note} onChange={(x) => setF({ ...f, note: x.target.value })} placeholder="Opcional (ex.: juros de atraso)" /></label>
      </div>
      <Footer err={a.err} pending={a.pending} onClose={onClose} ok="Confirmar pagamento" onOk={() => a.go(() => payExpenseAction(e.id, f), onClose)} />
    </Modal>
  );
}
function EditForm({ e, categories, onClose }: { e: ExpenseRow; categories: string[]; onClose: () => void }) {
  const cats = categories.includes(e.category) ? categories : [e.category, ...categories];
  const [f, setF] = useState({ description: e.description, category: e.category, payee: e.payee ?? "", amount: inBR(e.amountCents), dueDate: e.dueDay, note: e.note ?? "" }); const a = useAct();
  return (
    <Modal title={`Editar saída${e.seriesLabel ? ` ${e.seriesLabel}` : ""}`} onClose={onClose} wide>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2">Descrição<input className={input} value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} /></label>
        <label>Categoria<select className={input} value={f.category} onChange={(x) => setF({ ...f, category: x.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Fornecedor / favorecido<input className={input} value={f.payee} onChange={(x) => setF({ ...f, payee: x.target.value })} /></label>
        <label>Valor (R$)<input className={input} inputMode="decimal" value={f.amount} onChange={(x) => setF({ ...f, amount: x.target.value })} /></label>
        <label>Vencimento<input type="date" className={input} value={f.dueDate} onChange={(x) => setF({ ...f, dueDate: x.target.value })} /></label>
        <label className="col-span-2">Observação<input className={input} value={f.note} onChange={(x) => setF({ ...f, note: x.target.value })} /></label>
      </div>
      {e.seriesId && <p className="mt-2 text-xs text-muted">A alteração vale só para esta saída da série.</p>}
      <Footer err={a.err} pending={a.pending} onClose={onClose} ok="Salvar" onOk={() => a.go(() => updateExpenseAction(e.id, f), onClose)} />
    </Modal>
  );
}
function AttachForm({ e, onClose }: { e: ExpenseRow; onClose: () => void }) {
  const [type, setType] = useState<DocTypeKey>(e.status === "PAGA" ? "COMPROVANTE" : "BOLETO");
  const [files, setFiles] = useState<File[]>([]); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null); const router = useRouter();
  const [pending, start] = useTransition();
  const send = async () => {
    if (!files.length) return setErr("Selecione o arquivo.");
    setBusy(true); setErr(null);
    const fd = new FormData(); fd.set("expenseId", e.id); fd.set("type", type); files.forEach((f) => fd.append("files", f));
    try { const r = await fetch("/api/admin/financeiro/saidas/documentos", { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) setErr(j.error?.message ?? "Erro no envio."); else { setFiles([]); router.refresh(); } } catch { setErr("Falha de conexão."); }
    setBusy(false);
  };
  return (
    <Modal title="Anexos da saída" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">{e.description}{e.seriesLabel ? ` · ${e.seriesLabel}` : ""}</p>
      <ul className="mt-3 space-y-1 text-sm">{e.documents.map((d) => <li key={d.id} className="flex justify-between gap-2"><a className="link truncate" href={`/api/admin/financeiro/saidas/documentos/${d.id}`} target="_blank" rel="noopener">{DOC_TYPES[d.type].split(" ")[0]}: {d.fileName}</a>
        <button className="text-xs text-danger" disabled={pending} onClick={() => { if (confirm(`Remover “${d.fileName}”?`)) start(async () => { await removeExpenseDocumentAction(d.id); router.refresh(); }); }}>Remover</button></li>)}
        {e.documents.length === 0 && <li className="text-muted">Nenhum anexo.</li>}</ul>
      <div className="mt-4 grid gap-3 text-sm">
        <label>Tipo<select className={input} value={type} onChange={(x) => setType(x.target.value as DocTypeKey)}>{Object.entries(DOC_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <div role="button" tabIndex={0} onClick={() => ref.current?.click()} onKeyDown={(x) => (x.key === "Enter" || x.key === " ") && ref.current?.click()} onDragOver={(x) => x.preventDefault()} onDrop={(x) => { x.preventDefault(); setFiles([...x.dataTransfer.files].slice(0, 10)); }}
          className="cursor-pointer rounded border border-dashed border-line p-4 text-center">{files.length ? files.map((f) => f.name).join(", ") : <>Clique ou arraste o arquivo<br /><span className="text-xs text-muted">PDF, XML, JPG, PNG ou WebP · até 15 MB</span></>}
          <input ref={ref} type="file" multiple accept={ACCEPT} className="hidden" onChange={(x) => setFiles([...(x.target.files ?? [])].slice(0, 10))} data-exp-file /></div>
      </div>
      {err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
      <div className="mt-5 flex justify-end gap-2"><button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={onClose}>Fechar</button><button className="h-10 rounded bg-accent px-4 text-sm text-accent-ink disabled:opacity-50" disabled={busy || !files.length} onClick={send}>{busy ? "Enviando…" : "Anexar"}</button></div>
    </Modal>
  );
}
