"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCategoriesAction } from "@/modules/admin/product-actions";
import type { AdminCategory } from "@/modules/products/categories";

type Row = { key: string; id: string | null; name: string; isActive: boolean; imageUrl: string; description: string; seoTitle: string; seoDescription: string; products: number; slug: string };

/** Botão “Categorias” da aba Produtos: criar, renomear, ordenar, ativar/desativar e excluir (sem produtos). */
export function CategoriesManager({ categories }: { categories: AdminCategory[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const [novo, setNovo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const openIt = () => { setRows(categories.map((c) => ({ key: c.id, ...c }))); setRemove([]); setNovo(""); setErr(null); setImg(null); setOpen(true); };
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setRows((r) => { const a = [...r], j = i + d; if (j < 0 || j >= a.length) return r; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const add = () => { const n = novo.trim(); if (!n) return; setRows((r) => [...r, { key: `new-${Date.now()}`, id: null, name: n, isActive: true, imageUrl: "", description: "", seoTitle: "", seoDescription: "", products: 0, slug: "" }]); setNovo(""); };
  const del = (i: number) => { const r = rows[i]; if (r.products > 0) return setErr(`“${r.name}” tem ${r.products} produto(s). Mova os produtos para outra categoria ou desative a categoria.`); if (r.id) setRemove((x) => [...x, r.id!]); setRows((x) => x.filter((_, j) => j !== i)); };
  const save = () => start(async () => {
    setErr(null);
    const res = await saveCategoriesAction({ rows: rows.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive, imageUrl: r.imageUrl, description: r.description, seoTitle: r.seoTitle, seoDescription: r.seoDescription })), remove });
    if (!res.ok) return setErr(res.error);
    setOpen(false); router.refresh();
  });
  return (
    <>
      <button type="button" className="inline-flex h-10 items-center rounded border border-ink/80 px-4 text-sm hover:bg-ink hover:text-canvas" onClick={openIt} data-open-categories>Categorias</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Categorias de produtos" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-lg bg-white p-5 shadow-xl">
            <h2 className="font-sans text-lg font-medium">Categorias de produtos</h2>
            <p className="mt-1 text-sm text-muted">A ordem aqui é a ordem no site. Categoria desativada some da loja junto com os produtos dela (eles continuam no painel).</p>
            <ul className="mt-4 flex-1 divide-y divide-line overflow-y-auto border-y border-line">
              {rows.map((r, i) => (
                <li key={r.key} className="py-2" data-cat-row={r.name}>
                  <div className="flex items-center gap-2">
                    <span className="flex flex-col text-xs leading-none text-muted">
                      <button type="button" aria-label={`Subir ${r.name}`} disabled={i === 0} className="px-1 py-0.5 hover:text-ink disabled:opacity-30" onClick={() => move(i, -1)}>▲</button>
                      <button type="button" aria-label={`Descer ${r.name}`} disabled={i === rows.length - 1} className="px-1 py-0.5 hover:text-ink disabled:opacity-30" onClick={() => move(i, 1)}>▼</button>
                    </span>
                    <input className="h-9 min-w-0 flex-1 rounded border border-line px-2 text-sm" value={r.name} onChange={(e) => set(i, { name: e.target.value })} aria-label={`Nome da categoria ${i + 1}`} />
                    <span className="w-20 shrink-0 text-right text-xs text-muted">{r.id ? `${r.products} produto${r.products === 1 ? "" : "s"}` : "nova"}</span>
                    <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={r.isActive} onChange={(e) => set(i, { isActive: e.target.checked })} />Ativa</label>
                    <button type="button" className="shrink-0 text-xs text-muted hover:underline" onClick={() => setImg(img === r.key ? null : r.key)} aria-expanded={img === r.key}>{img === r.key ? "Fechar" : "Página e SEO"}{(r.description || r.seoTitle || r.seoDescription) && img !== r.key ? " ✓" : ""}</button>
                    <button type="button" className="shrink-0 text-xs text-danger hover:underline" onClick={() => del(i)}>Excluir</button>
                  </div>
                  {img === r.key && (
                    <div className="ml-7 mt-2 grid gap-2 rounded bg-ink/[0.03] p-3 text-xs text-muted">
                      <label>Texto de apresentação (aparece no topo da página da categoria e ajuda no Google)
                        <textarea rows={3} className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm text-ink" value={r.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Ex.: para que serve esta linha, onde usar, tamanhos e acabamentos disponíveis. Só informações verdadeiras." /></label>
                      <label>Título para o Google <span className={r.seoTitle.length > 60 ? "text-danger" : ""}>({r.seoTitle.length}/60)</span>
                        <input className="mt-1 h-9 w-full rounded border border-line px-2 text-sm text-ink" maxLength={70} value={r.seoTitle} onChange={(e) => set(i, { seoTitle: e.target.value })} placeholder={`Vazio = “${r.name}”. Ex.: ${r.name} para empresas`} /></label>
                      <label>Descrição para o Google <span className={r.seoDescription.length > 160 ? "text-danger" : ""}>({r.seoDescription.length}/160)</span>
                        <textarea rows={2} className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm text-ink" maxLength={170} value={r.seoDescription} onChange={(e) => set(i, { seoDescription: e.target.value })} placeholder="Vazio = usa o texto de apresentação ou uma frase automática com o nº de produtos." /></label>
                      <label>URL da imagem (opcional, usada no site e no compartilhamento)
                        <input className="mt-1 h-9 w-full rounded border border-line px-2 text-sm text-ink" value={r.imageUrl} onChange={(e) => set(i, { imageUrl: e.target.value })} placeholder="https://…" /></label>
                    </div>
                  )}
                  {r.slug && <p className="ml-7 mt-0.5 text-[11px] text-muted">Endereço no site: /categorias/{r.slug}</p>}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input className="h-10 flex-1 rounded border border-line px-2 text-sm" placeholder="Nova categoria (ex.: Ombrelones de praia)" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} aria-label="Nova categoria" />
              <button type="button" className="h-10 rounded border border-ink/70 px-4 text-sm disabled:opacity-40" disabled={!novo.trim()} onClick={add}>Adicionar</button>
            </div>
            {err && <p className="mt-3 text-sm text-danger" role="alert">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={() => setOpen(false)}>Cancelar</button>
              <button type="button" className="h-10 rounded bg-accent px-5 text-sm text-accent-ink disabled:opacity-50" disabled={pending} onClick={save}>{pending ? "Salvando…" : "Salvar categorias"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
