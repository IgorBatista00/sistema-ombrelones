"use client";
import { useRouter } from "next/navigation";
import { sheetTooBig } from "@/lib/upload-client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { deleteProductAction, deleteProductsAction } from "@/modules/admin/product-actions";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/misc";

/** Exclusão com confirmação no próprio botão (sem pop-up do navegador). */
export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!confirm) return <button className="text-danger hover:underline" onClick={() => setConfirm(true)}>Excluir</button>;
  return (
    <span className="inline-flex items-center gap-2 rounded bg-danger/5 px-2 py-1">
      <span className="text-danger">Excluir “{name.slice(0, 24)}”?</span>
      <button className="font-medium text-danger" disabled={pending} onClick={() => start(async () => {
        const r = await deleteProductAction(id);
        if (!r.ok) alert(r.error); else if (r.data.failed.length) alert(r.data.failed[0].error);
        setConfirm(false); router.refresh();
      })}>{pending ? "…" : "Sim"}</button>
      <button className="text-muted" onClick={() => setConfirm(false)}>Não</button>
    </span>
  );
}

type Row = { line: number; code: string; name: string; action: "criar" | "atualizar" | "ignorar"; errors: string[]; warnings: string[] };
type Summary = { created: number; updated: number; suppliersCreated: number; ignored: number; failed: { line: number; error: string }[] };

/** Importar Excel: escolher arquivo → prévia (sem gravar) → confirmar. */
export function ImportProductsButton() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const reset = () => { setFile(null); setRows(null); setSummary(null); setError(null); if (input.current) input.current.value = ""; };

  const send = (mode: "preview" | "commit") => start(async () => {
    if (!file) return;
    setError(null);
    const tooBig = sheetTooBig(file); if (tooBig) return setError(tooBig);
    const fd = new FormData(); fd.append("file", file); fd.append("mode", mode);
    const res = await fetch("/api/admin/products/import", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error?.message ?? "Falha ao ler a planilha.");
    if (mode === "preview") setRows(json.data.rows); else { setSummary(json.data); router.refresh(); }
  });

  const ok = rows?.filter((r) => r.action !== "ignorar").length ?? 0;
  return (
    <>
      <Button variant="secondary" className="h-10 px-4" onClick={() => { reset(); setOpen(true); }}>Importar Excel</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="Importar produtos" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="card flex max-h-[90vh] w-full max-w-4xl flex-col p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-sans text-lg font-medium">Importar produtos</h2><p className="mt-1 text-sm text-muted">Cria ou atualiza pelo código. Nada é gravado antes da sua confirmação.</p></div>
              <a href="/api/admin/products/template" className="link whitespace-nowrap text-sm">Baixar modelo</a>
            </div>

            {summary ? (
              <div className="mt-6 space-y-4">
                <Notice tone="success" title="Importação concluída">{summary.created} criados · {summary.updated} atualizados · {summary.suppliersCreated} fornecedores cadastrados · {summary.ignored} linhas ignoradas</Notice>
                {summary.failed.length > 0 && <Notice tone="danger" title="Linhas com falha">{summary.failed.map((f) => <div key={f.line}>Linha {f.line}: {f.error}</div>)}</Notice>}
                <p className="text-xs text-muted">Fotos e custos adicionais (corte, tecido, gráfica, plaquinha) são definidos no formulário de cada produto; o custo final já considera os adicionais existentes.</p>
                <div className="flex justify-end"><Button className="h-10" onClick={() => setOpen(false)}>Fechar</Button></div>
              </div>
            ) : (
              <>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <input ref={input} type="file" accept=".xlsx,.csv" className="text-sm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRows(null); setError(null); }} />
                  <Button variant="secondary" className="h-10 px-4" disabled={!file || pending} onClick={() => send("preview")}>{pending && !rows ? "Lendo…" : "Ver prévia"}</Button>
                </div>
                {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
                {rows && (
                  <>
                    <p className="mt-5 text-sm">{rows.filter((r) => r.action === "criar").length} novos · {rows.filter((r) => r.action === "atualizar").length} atualizações · <span className={rows.some((r) => r.action === "ignorar") ? "text-danger" : ""}>{rows.filter((r) => r.action === "ignorar").length} com erro (serão ignorados)</span></p>
                    <div className="mt-3 flex-1 overflow-auto rounded border border-line">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-label text-muted"><tr>{["Linha", "Código", "Produto", "Ação", "Observações"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-line">{rows.map((r) => (
                          <tr key={r.line}><td className="px-3 py-2">{r.line}</td><td className="px-3 py-2">{r.code || "—"}</td><td className="max-w-56 truncate px-3 py-2">{r.name || "—"}</td>
                            <td className="px-3 py-2"><Badge tone={r.action === "ignorar" ? "danger" : r.action === "criar" ? "success" : "neutral"}>{r.action}</Badge></td>
                            <td className="px-3 py-2">{r.errors.map((e) => <div key={e} className="text-danger">{e}</div>)}{r.warnings.map((w) => <div key={w} className="text-warning">{w}</div>)}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="ghost" className="h-10" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button className="h-10 px-5" disabled={!rows || ok === 0 || pending} onClick={() => send("commit")}>{pending && rows ? "Importando…" : `Importar ${ok} ${ok === 1 ? "linha" : "linhas"}`}</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ exclusão em massa
const BOX = "input[data-bulk-product]";
const boxes = () => [...document.querySelectorAll<HTMLInputElement>(BOX)];
const selectedIds = () => [...new Set(boxes().filter((b) => b.checked).map((b) => b.value))];

/** Caixa do cabeçalho da tabela: marca/desmarca todos os produtos listados. */
export function SelectAllProducts() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const sync = () => { const all = [...new Set(boxes().map((b) => b.value))], sel = selectedIds(); if (ref.current) { ref.current.checked = all.length > 0 && sel.length === all.length; ref.current.indeterminate = sel.length > 0 && sel.length < all.length; } };
    document.addEventListener("bulk-products", sync); return () => document.removeEventListener("bulk-products", sync);
  }, []);
  return <input ref={ref} type="checkbox" aria-label="Selecionar todos os produtos" className="h-4 w-4 cursor-pointer accent-[var(--color-accent,#2f3a33)]"
    onChange={(e) => { boxes().forEach((b) => (b.checked = e.target.checked)); document.dispatchEvent(new Event("bulk-products")); }} />;
}

/** Caixa de cada produto (tabela e cartões do celular ficam sincronizados pelo id). */
export function ProductCheckbox({ id, name }: { id: string; name: string }) {
  return <input type="checkbox" value={id} data-bulk-product aria-label={`Selecionar ${name}`} className="h-4 w-4 cursor-pointer accent-[var(--color-accent,#2f3a33)]"
    onChange={(e) => { boxes().filter((b) => b.value === id).forEach((b) => (b.checked = e.target.checked)); document.dispatchEvent(new Event("bulk-products")); }} />;
}

type BulkResult = { deleted: string[]; archived: string[]; failed: { name: string; error: string }[] };
/** Barra que aparece ao selecionar produtos: excluir selecionados, com confirmação. */
export function BulkDeleteBar({ total }: { total: number }) {
  const [count, setCount] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const refresh = useCallback(() => { setCount(selectedIds().length); setConfirm(false); }, []);
  useEffect(() => { document.addEventListener("bulk-products", refresh); return () => document.removeEventListener("bulk-products", refresh); }, [refresh]);
  const setAll = (v: boolean) => { boxes().forEach((b) => (b.checked = v)); document.dispatchEvent(new Event("bulk-products")); };
  const run = () => start(async () => {
    setError(null);
    const r = await deleteProductsAction(selectedIds());
    if (!r.ok) { setError(r.error); return; }
    setResult(r.data); setAll(false); router.refresh();
  });
  return (
    <>
      {result && (
        <div className="mb-4 rounded border border-line bg-white p-4 text-sm" role="status">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Exclusão concluída</p>
              {result.deleted.length > 0 && <p className="mt-1">{result.deleted.length} produto(s) excluído(s).</p>}
              {result.archived.length > 0 && <p className="mt-1">{result.archived.length} produto(s) arquivado(s), porque já aparecem em pedidos, orçamentos, compras ou movimentações de estoque: saíram do site e da lista, e o histórico foi mantido. Veja em Status → Arquivados.<span className="block text-xs text-muted">{result.archived.slice(0, 8).join(" · ")}{result.archived.length > 8 ? " …" : ""}</span></p>}
              {result.failed.length > 0 && <p className="mt-1 text-danger">{result.failed.length} não puderam ser excluídos: {result.failed.slice(0, 5).map((f) => `${f.name} (${f.error})`).join(" · ")}</p>}
            </div>
            <button className="text-xs text-muted hover:underline" onClick={() => setResult(null)}>Fechar</button>
          </div>
        </div>
      )}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" data-bulk-bar>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-white px-4 py-3 text-sm shadow-lg">
            <span className="font-medium">{count} selecionado{count > 1 ? "s" : ""}</span>
            {count < total && <button className="link text-xs" onClick={() => setAll(true)}>Selecionar todos ({total})</button>}
            <button className="link text-xs" onClick={() => setAll(false)}>Limpar seleção</button>
            {!confirm ? (
              <button className="inline-flex h-9 items-center rounded bg-danger px-4 text-white disabled:opacity-50" onClick={() => setConfirm(true)}>Excluir selecionados</button>
            ) : (
              <span className="flex flex-wrap items-center gap-2 rounded bg-danger/5 px-3 py-1.5">
                <span className="text-danger">Excluir {count} produto{count > 1 ? "s" : ""}? Os que já têm histórico serão arquivados.</span>
                <button className="inline-flex h-8 items-center rounded bg-danger px-3 text-white disabled:opacity-50" disabled={pending} onClick={run}>{pending ? "Excluindo…" : "Sim, excluir"}</button>
                <button className="text-muted hover:underline" disabled={pending} onClick={() => setConfirm(false)}>Cancelar</button>
              </span>
            )}
            {error && <span className="w-full text-danger" role="alert">{error}</span>}
          </div>
        </div>
      )}
    </>
  );
}
