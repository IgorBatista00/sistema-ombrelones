"use client";
import { useRouter } from "next/navigation";
import { sheetTooBig } from "@/lib/upload-client";
import { useRef, useState, useTransition } from "react";
import { deleteClientAction } from "@/modules/admin/client-actions";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/misc";

type Row = { line: number; name: string; doc: string; action: "criar" | "atualizar" | "ignorar"; errors: string[]; warnings: string[] };
type Summary = { created: number; updated: number; ignored: number; failed: { line: number; error: string }[] };

/** Importar clientes: modelo → escolher arquivo → prévia (sem gravar) → confirmar. */
export function ImportClientsButton() {
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
    const res = await fetch("/api/admin/clients/import", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error?.message ?? "Falha ao ler a planilha.");
    if (mode === "preview") setRows(json.data.rows); else { setSummary(json.data); router.refresh(); }
  });
  const ok = rows?.filter((r) => r.action !== "ignorar").length ?? 0;
  const count = (a: Row["action"]) => rows?.filter((r) => r.action === a).length ?? 0;
  return (
    <>
      <a href="/api/admin/clients/template" className="inline-flex h-10 items-center rounded border border-ink/80 px-4 text-sm hover:bg-ink hover:text-canvas">Baixar modelo</a>
      <Button className="h-10 px-5" onClick={() => { reset(); setOpen(true); }} data-import-clients>Importar planilha</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="Importar clientes" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="card flex max-h-[90vh] w-full max-w-4xl flex-col p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-sans text-lg font-medium">Importar clientes</h2><p className="mt-1 text-sm text-muted">Cria ou atualiza pelo CNPJ/CPF. Nada é gravado antes da sua confirmação. Não cria login no site.</p></div>
              <a href="/api/admin/clients/template" className="link whitespace-nowrap text-sm">Baixar modelo</a>
            </div>
            {summary ? (
              <div className="mt-6 space-y-4">
                <Notice tone="success" title="Importação concluída">{summary.created} cliente(s) criado(s) · {summary.updated} atualizado(s) · {summary.ignored} linha(s) ignorada(s)</Notice>
                {summary.failed.length > 0 && <Notice tone="danger" title="Linhas não importadas">{summary.failed.slice(0, 30).map((f) => <div key={f.line}>Linha {f.line}: {f.error}</div>)}</Notice>}
                <div className="flex justify-end"><Button className="h-10" onClick={() => setOpen(false)}>Fechar</Button></div>
              </div>
            ) : (
              <>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <input ref={input} type="file" accept=".xlsx,.csv" className="text-sm" data-client-file onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRows(null); setError(null); }} />
                  <Button variant="secondary" className="h-10 px-4" disabled={!file || pending} onClick={() => send("preview")}>{pending && !rows ? "Lendo…" : "Ver prévia"}</Button>
                </div>
                {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
                {rows && (
                  <>
                    <p className="mt-5 text-sm" data-preview-summary>{count("criar")} novo(s) · {count("atualizar")} atualização(ões) · <span className={count("ignorar") ? "text-danger" : ""}>{count("ignorar")} com erro ou de exemplo (serão ignorados)</span></p>
                    <div className="mt-3 flex-1 overflow-auto rounded border border-line">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-label text-muted"><tr>{["Linha", "Cliente", "CNPJ / CPF", "Ação", "Observações"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-line">{rows.map((r) => (
                          <tr key={r.line} data-preview-row={r.line}><td className="px-3 py-2">{r.line}</td><td className="max-w-56 truncate px-3 py-2">{r.name || "—"}</td><td className="whitespace-nowrap px-3 py-2">{r.doc || "—"}</td>
                            <td className="px-3 py-2"><Badge tone={r.action === "ignorar" ? "danger" : r.action === "criar" ? "success" : "neutral"}>{r.action}</Badge></td>
                            <td className="px-3 py-2">{r.errors.map((e) => <div key={e} className="text-danger">{e}</div>)}{r.warnings.map((w) => <div key={w} className="text-warning">{w}</div>)}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="ghost" className="h-10" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button className="h-10 px-5" disabled={!rows || ok === 0 || pending} onClick={() => send("commit")}>{pending && rows ? "Importando…" : `Importar ${ok} ${ok === 1 ? "cliente" : "clientes"}`}</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function DeleteClientButton({ id, name }: { id: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!confirm) return <button className="text-xs text-danger hover:underline" onClick={() => setConfirm(true)}>Excluir</button>;
  return (
    <span className="inline-flex items-center gap-2 rounded bg-danger/5 px-2 py-1 text-xs">
      <span className="text-danger">Excluir “{name.slice(0, 22)}”?</span>
      <button className="font-medium text-danger" disabled={pending} onClick={() => start(async () => { const r = await deleteClientAction(id); if (!r.ok) alert(r.error); setConfirm(false); router.refresh(); })}>{pending ? "…" : "Sim"}</button>
      <button className="text-muted" onClick={() => setConfirm(false)}>Não</button>
    </span>
  );
}
