"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveOrderCategoriesAction } from "@/modules/admin/quote-actions";

/** Editar a lista de categorias internas de pedido. Renomear/excluir não altera pedidos já salvos. */
export function OrderCategoriesButton({ categories }: { categories: string[] }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(categories);
  const [novo, setNovo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const add = () => { if (novo.trim()) { setList([...list, novo.trim()]); setNovo(""); } };
  return (
    <>
      <button type="button" className="inline-flex h-10 items-center rounded border border-ink/70 px-4 text-sm hover:bg-ink hover:text-canvas" onClick={() => { setList(categories); setErr(null); setOpen(true); }}>Editar categorias</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Categorias de pedido" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="font-sans text-lg font-medium">Categorias de pedido</h2>
            <p className="mt-1 text-sm text-muted">Uso interno. Renomear ou excluir não altera pedidos já salvos.</p>
            <ul className="mt-3 space-y-2">{list.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-5 text-right text-xs text-muted">{i + 1}</span>
                <input className="h-9 flex-1 rounded border border-line px-2 text-sm" value={c} onChange={(e) => setList(list.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Categoria ${i + 1}`} />
                <button type="button" className="text-xs text-muted disabled:opacity-30" disabled={i === 0} aria-label="Subir" onClick={() => { const a = [...list]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setList(a); }}>▲</button>
                <button type="button" className="text-xs text-danger" onClick={() => setList(list.filter((_, j) => j !== i))}>Excluir</button>
              </li>))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input className="h-9 flex-1 rounded border border-line px-2 text-sm" placeholder="Nova categoria" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} aria-label="Nova categoria" />
              <button type="button" className="link text-sm" disabled={!novo.trim()} onClick={add}>Adicionar</button>
            </div>
            {err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={() => setOpen(false)}>Cancelar</button>
              <button type="button" className="h-10 rounded bg-accent px-4 text-sm text-accent-ink disabled:opacity-50" disabled={pending}
                onClick={() => start(async () => { const r = await saveOrderCategoriesAction(list); if (!r.ok) return setErr(r.error); setOpen(false); router.refresh(); })}>{pending ? "Salvando…" : "Salvar categorias"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
