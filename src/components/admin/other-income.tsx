"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteOtherIncomeAction, receiveOtherIncomeAction, saveCategoriesAction, saveOtherIncomeAction } from "@/modules/admin/finance-actions";
import { RECEIPT_METHODS } from "@/modules/finance/receivables";

const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const inBR = (c: number) => (c / 100).toFixed(2).replace(".", ",");
type Row = { id: string; description: string; category: string; amountCents: number; status: "PREVISTA" | "RECEBIDA"; date: string; method: string | null; note: string | null };
const empty = (cat: string) => ({ description: "", category: cat, amount: "", status: "RECEBIDA", date: todayBR(), method: "Transferência", note: "" });

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 text-left" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"><h2 className="font-sans text-lg font-medium">{title}</h2>{children}</div>
    </div>
  );
}
const input = "mt-1 h-10 w-full rounded border border-line px-2";

/** Botão "Nova receita" + "Categorias" (topo da aba). */
export function OtherIncomeToolbar({ categories }: { categories: string[] }) {
  const [open, setOpen] = useState<null | "new" | "cats">(null);
  return (
    <div className="flex gap-2">
      <button className="inline-flex h-10 items-center rounded border border-ink/70 px-4 text-sm hover:bg-ink hover:text-canvas" onClick={() => setOpen("cats")}>Categorias</button>
      <button className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink" onClick={() => setOpen("new")}>Nova receita</button>
      {open === "new" && <IncomeForm categories={categories} initial={empty(categories[0])} id={null} onClose={() => setOpen(null)} />}
      {open === "cats" && <CategoryEditor categories={categories} onClose={() => setOpen(null)} />}
    </div>
  );
}

function IncomeForm({ categories, initial, id, onClose }: { categories: string[]; initial: ReturnType<typeof empty>; id: string | null; onClose: () => void }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const save = () => start(async () => {
    const r = await saveOtherIncomeAction(id, { ...f, method: f.status === "RECEBIDA" ? f.method : "" });
    if (!r.ok) return setErr(r.error);
    onClose(); router.refresh();
  });
  return (
    <Modal title={id ? "Editar receita" : "Nova receita"} onClose={onClose}>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2">Descrição<input className={input} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Ex.: Rendimento CDB banco X — novembro" autoFocus /></label>
        <label>Categoria<select className={input} value={f.category} onChange={(e) => set("category", e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Valor (R$)<input className={input} inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" /></label>
        <fieldset className="col-span-2"><legend>Situação</legend>
          <div className="mt-1 flex gap-4">{[["RECEBIDA", "Já recebida"], ["PREVISTA", "Prevista (a receber)"]].map(([v, l]) => <label key={v} className="flex items-center gap-1.5"><input type="radio" name="st" checked={f.status === v} onChange={() => set("status", v)} />{l}</label>)}</div>
        </fieldset>
        <label>{f.status === "RECEBIDA" ? "Data do recebimento" : "Data prevista"}<input type="date" className={input} value={f.date} max={f.status === "RECEBIDA" ? todayBR() : undefined} onChange={(e) => set("date", e.target.value)} /></label>
        {f.status === "RECEBIDA" ? <label>Forma<select className={input} value={f.method} onChange={(e) => set("method", e.target.value)}>{RECEIPT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label> : <div />}
        <label className="col-span-2">Observação<input className={input} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Opcional" /></label>
      </div>
      {err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={onClose}>Cancelar</button>
        <button className="h-10 rounded bg-accent px-4 text-sm text-accent-ink" disabled={pending} onClick={save}>{pending ? "Salvando…" : "Salvar"}</button>
      </div>
    </Modal>
  );
}

function CategoryEditor({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const [list, setList] = useState(categories);
  const [novo, setNovo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Modal title="Categorias de outras receitas" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">Renomear ou excluir uma categoria não altera lançamentos antigos.</p>
      <ul className="mt-3 space-y-2">{list.map((c, i) => (
        <li key={i} className="flex gap-2"><input className="h-9 flex-1 rounded border border-line px-2 text-sm" value={c} onChange={(e) => setList(list.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Categoria ${i + 1}`} />
          <button className="text-xs text-danger" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label={`Excluir ${c}`}>Excluir</button></li>
      ))}</ul>
      <div className="mt-3 flex gap-2"><input className="h-9 flex-1 rounded border border-line px-2 text-sm" placeholder="Nova categoria" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && novo.trim()) { setList([...list, novo]); setNovo(""); } }} />
        <button className="link text-sm" disabled={!novo.trim()} onClick={() => { setList([...list, novo]); setNovo(""); }}>Adicionar</button></div>
      {err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={onClose}>Cancelar</button>
        <button className="h-10 rounded bg-accent px-4 text-sm text-accent-ink" disabled={pending} onClick={() => start(async () => { const r = await saveCategoriesAction(list); if (!r.ok) return setErr(r.error); onClose(); router.refresh(); })}>Salvar categorias</button>
      </div>
    </Modal>
  );
}

/** Ações da linha: receber (prevista), editar, excluir. */
export function OtherIncomeRowActions({ row, categories }: { row: Row; categories: string[] }) {
  const [mode, setMode] = useState<null | "edit" | "receive">(null);
  const [rec, setRec] = useState({ date: todayBR(), method: "Transferência" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const cats = categories.includes(row.category) ? categories : [row.category, ...categories];
  return (
    <span className="inline-flex items-center justify-end gap-3 text-xs">
      {row.status === "PREVISTA" && <button className="inline-flex h-8 items-center rounded bg-accent px-3 text-accent-ink" onClick={() => setMode("receive")}>Receber</button>}
      <button className="link" onClick={() => setMode("edit")}>Editar</button>
      <button className="link text-danger" disabled={pending} onClick={() => { if (confirm(`Excluir o lançamento “${row.description}”?`)) start(async () => { const r = await deleteOtherIncomeAction(row.id); if (!r.ok) alert(r.error); router.refresh(); }); }}>Excluir</button>
      {mode === "edit" && <IncomeForm categories={cats} id={row.id} onClose={() => setMode(null)} initial={{ description: row.description, category: row.category, amount: inBR(row.amountCents), status: row.status, date: row.date.slice(0, 10), method: row.method ?? "Transferência", note: row.note ?? "" }} />}
      {mode === "receive" && (
        <Modal title="Registrar recebimento" onClose={() => setMode(null)}>
          <p className="mt-1 text-sm text-muted">{row.description} · {(row.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <label>Data do recebimento<input type="date" className={input} value={rec.date} max={todayBR()} onChange={(e) => setRec({ ...rec, date: e.target.value })} /></label>
            <label>Forma<select className={input} value={rec.method} onChange={(e) => setRec({ ...rec, method: e.target.value })}>{RECEIPT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
          </div>
          {err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
          <div className="mt-5 flex justify-end gap-2"><button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={() => setMode(null)}>Cancelar</button>
            <button className="h-10 rounded bg-accent px-4 text-sm text-accent-ink" disabled={pending} onClick={() => start(async () => { const r = await receiveOtherIncomeAction(row.id, rec.date, rec.method); if (!r.ok) return setErr(r.error); setMode(null); router.refresh(); })}>Confirmar</button></div>
        </Modal>
      )}
    </span>
  );
}
