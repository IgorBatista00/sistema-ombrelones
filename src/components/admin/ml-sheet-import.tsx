"use client";
import { useRouter } from "next/navigation";
import { sheetTooBig } from "@/lib/upload-client";
import { useRef, useState, useTransition } from "react";
import type { MlImportPreview } from "@/modules/integrations/mercadolivre/sheet-import";
import { formatBRL } from "@/lib/money";

/** Importar a planilha de vendas exportada pelo Mercado Livre: escolher → prévia (nada gravado) → importar. */
export function MlSheetImportButton() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [prev, setPrev] = useState<MlImportPreview | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number; skipped: number; stockMoves?: number; negative?: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const send = (mode: "preview" | "commit") => start(async () => {
    if (!file) return; setErr(null);
    const tooBig = sheetTooBig(file); if (tooBig) return setErr(tooBig);
    const fd = new FormData(); fd.append("file", file); fd.append("mode", mode);
    const r = await fetch("/api/admin/financeiro/mercadolivre/importar", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error?.message ?? "Falha ao ler a planilha.");
    if (mode === "preview") setPrev(j.data); else { setDone(j.data); router.refresh(); }
  });
  const reset = () => { setFile(null); setPrev(null); setDone(null); setErr(null); if (input.current) input.current.value = ""; };
  const toImport = prev?.orders.filter((o) => o.action !== "ignorar").length ?? 0;
  const dt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return (
    <>
      <button type="button" className="inline-flex h-10 items-center rounded border border-ink/80 px-4 text-sm hover:bg-ink hover:text-canvas" onClick={() => { reset(); setOpen(true); }} data-ml-import>Importar planilha de vendas</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="Importar vendas do Mercado Livre" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="card flex max-h-[92vh] w-full max-w-5xl flex-col p-6">
            <h2 className="font-sans text-lg font-medium">Importar vendas do Mercado Livre (planilha)</h2>
            {done ? (
              <div className="mt-5 space-y-4 text-sm">
                <p className="rounded border border-success/40 bg-success/5 p-3" role="status"><b>Importação concluída.</b> {done.created} venda(s) nova(s) · {done.updated} atualizada(s){done.skipped ? ` · ${done.skipped} ignorada(s) (já vieram pela integração)` : ""}.{done.stockMoves ? ` Estoque: ${done.stockMoves} movimentação(ões) pelos anúncios vinculados.` : ""}</p>
                {!!done.negative?.length && <p className="mt-2 rounded border border-warning/40 bg-warning/5 p-3 text-sm">Atenção: o estoque ficou negativo em {done.negative.join(", ")}. Confira o saldo em Estoque.</p>}
                <div className="flex justify-end"><button className="h-10 rounded bg-accent px-5 text-sm text-accent-ink" onClick={() => setOpen(false)}>Fechar</button></div>
              </div>
            ) : (
              <>
                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-muted">
                  <li>No Mercado Livre: <b>Vendas</b> › escolha o período › <b>Baixar Excel de vendas</b> (ou “Exportar”).</li>
                  <li>Envie o arquivo aqui sem mudar os títulos das colunas. Confira a prévia e importe.</li>
                  <li>Pode importar de novo o mesmo período: as vendas já importadas são <b>atualizadas</b>, não duplicadas. Quando a integração direta for ligada, ela substitui o que veio da planilha.</li>
                </ol>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input ref={input} type="file" accept=".xlsx,.csv" className="text-sm" data-ml-file onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPrev(null); setErr(null); }} />
                  <button className="h-10 rounded border border-ink/70 px-4 text-sm disabled:opacity-40" disabled={!file || pending} onClick={() => send("preview")}>{pending && !prev ? "Lendo…" : "Ver prévia"}</button>
                </div>
                {err && <p className="mt-3 rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger" role="alert">{err}</p>}
                {prev && (
                  <>
                    <p className="mt-4 text-sm" data-ml-summary><b>{prev.totals.orders}</b> venda(s) · produtos <b>{formatBRL(prev.totals.productCents)}</b> · tarifas {formatBRL(prev.totals.feeCents)}{prev.totals.cancelled ? ` · ${prev.totals.cancelled} cancelada(s) (entram como estornadas)` : ""}{prev.lineIssues.some((l) => l.errors.length) ? <span className="text-danger"> · {prev.lineIssues.filter((l) => l.errors.length).length} linha(s) com erro (ignoradas)</span> : null}</p>
                    <div className="mt-2 flex-1 overflow-auto rounded border border-line">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-label text-muted"><tr>{["Venda", "Data", "Comprador", "Itens", "Produtos", "Tarifa", "Líquido", "Situação", "Ação"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-line">
                          {prev.orders.map((o) => (
                            <tr key={o.orderId} data-ml-row={o.orderId} className={o.cancelled ? "text-muted" : ""}>
                              <td className="whitespace-nowrap px-3 py-2">{o.orderId}<div className="text-[10px] text-muted">linha {o.lines.join(", ")}</div></td>
                              <td className="whitespace-nowrap px-3 py-2">{dt(o.saleDate)}</td><td className="px-3 py-2">{o.buyer ?? "—"}</td>
                              <td className="max-w-72 px-3 py-2"><span className="line-clamp-2">{o.items}</span></td>
                              <td className="whitespace-nowrap px-3 py-2">{formatBRL(o.productCents)}</td><td className="whitespace-nowrap px-3 py-2">{o.feeCents != null ? formatBRL(o.feeCents) : "—"}</td><td className="whitespace-nowrap px-3 py-2">{o.netCents != null ? formatBRL(o.netCents) : "—"}</td>
                              <td className="max-w-40 px-3 py-2">{o.cancelled ? <span className="text-danger">Cancelada</span> : o.status}</td>
                              <td className="px-3 py-2">{o.action}{o.note && <div className="text-[10px] text-muted">{o.note}</div>}</td>
                            </tr>
                          ))}
                          {prev.lineIssues.filter((l) => l.errors.length || l.warnings.length).map((l) => (
                            <tr key={`l${l.line}`} className="bg-ink/[0.02]"><td className="px-3 py-2 text-muted">linha {l.line}</td><td colSpan={8} className="px-3 py-2">{l.errors.map((e) => <div key={e} className="text-danger">{e}</div>)}{l.warnings.map((w) => <div key={w} className="text-warning">{w}</div>)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={() => setOpen(false)}>Cancelar</button>
                  <button className="h-10 rounded bg-accent px-5 text-sm text-accent-ink disabled:opacity-40" disabled={!prev || !toImport || pending} onClick={() => send("commit")}>{pending && prev ? "Importando…" : `Importar ${toImport} venda(s)`}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
