"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { sheetTooBig } from "@/lib/upload-client";
import { formatBRL } from "@/lib/money";
import type { ListingImportPreview } from "@/modules/mercadolivre/listing-import";

type Done = { created: number; updated: number; unmatched: number; relinked: number; stockMoves: number; negative: string[] };
const pct = (bps: number | null) => (bps == null ? "—" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);

/** Importar a planilha de anúncios do Mercado Livre: escolher → prévia (nada gravado) → custos padrão → importar. */
export function MlListingImportButton() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [prev, setPrev] = useState<ListingImportPreview | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [def, setDef] = useState({ taxPct: "14,5", packaging: "", shipping: "", fixedFee: "", other: "", applyExisting: false });
  const [only, setOnly] = useState<"" | "sem">("");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const send = (mode: "preview" | "commit") => start(async () => {
    if (!file) return; setErr(null);
    const tooBig = sheetTooBig(file); if (tooBig) return setErr(tooBig);
    const fd = new FormData(); fd.append("file", file); fd.append("mode", mode);
    if (mode === "commit") { for (const k of ["taxPct", "packaging", "shipping", "fixedFee", "other"] as const) fd.append(k, def[k]); fd.append("applyExisting", def.applyExisting ? "1" : ""); }
    const r = await fetch("/api/admin/mercadolivre/anuncios/importar", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error?.message ?? "Falha ao ler a planilha.");
    if (mode === "preview") setPrev(j.data); else { setDone(j.data); router.refresh(); }
  });
  const reset = () => { setFile(null); setPrev(null); setDone(null); setErr(null); if (input.current) input.current.value = ""; };
  const rows = prev ? prev.rows.filter((r) => !only || !r.matched) : [];
  const field = (k: "taxPct" | "packaging" | "shipping" | "fixedFee" | "other", label: string, ph: string) => (
    <label className="block text-xs text-muted">{label}<input className="mt-1 h-9 w-full rounded border border-line px-2 text-sm text-ink" inputMode="decimal" placeholder={ph} value={def[k]} onChange={(e) => setDef({ ...def, [k]: e.target.value })} data-def={k} /></label>
  );
  return (
    <>
      <button type="button" className="inline-flex h-9 items-center rounded border border-ink/70 px-3 text-sm hover:bg-ink hover:text-canvas" onClick={() => { reset(); setOpen(true); }} data-ml-listing-import>Importar planilha de anúncios</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="Importar anúncios do Mercado Livre" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="card flex max-h-[94vh] w-full max-w-6xl flex-col p-6">
            <h2 className="font-sans text-lg font-medium">Importar anúncios do Mercado Livre (planilha)</h2>
            {done ? (
              <div className="mt-5 space-y-3 text-sm" data-ml-listing-done>
                <p className="rounded border border-success/40 bg-success/5 p-3" role="status"><b>Importação concluída.</b> {done.created} anúncio(s) novo(s) · {done.updated} atualizado(s){done.unmatched ? ` · ${done.unmatched} sem produto ligado (ligue em “Editar”)` : ""}.{done.relinked ? ` ${done.relinked} item(ns) de vendas já importadas foram ligados aos anúncios.` : ""}{done.stockMoves ? ` Estoque: ${done.stockMoves} movimentação(ões).` : ""}</p>
                {!!done.negative.length && <p className="rounded border border-warning/40 bg-warning/5 p-3">Atenção: o estoque ficou negativo em {done.negative.join(", ")}. Confira o saldo em Estoque.</p>}
                <div className="flex justify-end"><button className="h-10 rounded bg-accent px-5 text-sm text-accent-ink" onClick={() => setOpen(false)}>Fechar</button></div>
              </div>
            ) : (
              <>
                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-muted">
                  <li>No Mercado Livre: <b>Anúncios</b> › <b>Modificar em massa</b> › <b>Modificar em Excel</b> › baixe a planilha.</li>
                  <li>Preencha o SKU do produto do sistema nas colunas “sku 1”, “sku 2”… (kit = mais de um SKU). Não mude os títulos das colunas.</li>
                  <li>Envie aqui, confira a prévia e informe os custos que o Mercado Livre não sabe (valem para todos; ajuste um a um depois). Reimportar atualiza preço, título e tarifa sem duplicar.</li>
                </ol>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input ref={input} type="file" accept=".xlsx,.csv" className="text-sm" data-ml-listing-file onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPrev(null); setErr(null); }} />
                  <button className="h-10 rounded border border-ink/70 px-4 text-sm disabled:opacity-40" disabled={!file || pending} onClick={() => send("preview")}>{pending && !prev ? "Lendo…" : "Ver prévia"}</button>
                </div>
                {err && <p className="mt-3 rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger" role="alert">{err}</p>}
                {prev && (
                  <div className="mt-4 flex min-h-0 flex-1 flex-col">
                    <p className="text-sm" data-ml-listing-summary><b>{prev.totals.rows}</b> anúncio(s): {prev.totals.create} novo(s) · {prev.totals.update} já cadastrado(s) (serão atualizados){prev.totals.unmatched ? <> · <span className="text-warning">{prev.totals.unmatched} sem produto reconhecido</span></> : null}{prev.totals.dropped ? <> · <span className="text-danger">{prev.totals.dropped} linha(s) ignorada(s)</span></> : null}</p>
                    {!!prev.issues.length && <div className="mt-2 max-h-28 overflow-auto rounded border border-danger/30 bg-danger/[0.04] p-2 text-xs" data-ml-listing-issues>{prev.issues.map((i) => <p key={i.line}><b>Linha {i.line}:</b> {i.messages.join(" ")}</p>)}</div>}
                    <div className="mt-2 flex items-center gap-3 text-xs"><label className="flex items-center gap-1.5"><input type="checkbox" checked={only === "sem"} onChange={(e) => setOnly(e.target.checked ? "sem" : "")} />Mostrar só os sem produto reconhecido</label></div>
                    <div className="mt-2 min-h-0 flex-1 overflow-auto rounded border border-line">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-label text-muted"><tr>{["Linha", "Anúncio", "Tipo", "Preço", "Tarifa", "Produto(s) no sistema", "Ação"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-line">
                          {rows.map((r) => (
                            <tr key={`${r.itemId}|${r.variation}`} data-ml-listing-row={r.itemId} className={r.matched ? "" : "bg-warning/[0.05]"}>
                              <td className="px-3 py-2 text-muted">{r.line}</td>
                              <td className="max-w-80 px-3 py-2"><span className="line-clamp-2">{r.title}</span><div className="text-[10px] text-muted">{r.itemId}{r.variation ? ` · ${r.variation}` : ""}</div></td>
                              <td className="px-3 py-2">{r.listingType === "premium" ? "Premium" : r.listingType === "classico" ? "Clássico" : "—"}</td>
                              <td className="whitespace-nowrap px-3 py-2">{r.priceCents != null ? formatBRL(r.priceCents) : "—"}{r.listPriceCents != null && r.listPriceCents !== r.priceCents && <div className="text-[10px] text-muted line-through">{formatBRL(r.listPriceCents)}</div>}</td>
                              <td className="px-3 py-2">{pct(r.feeBps)}</td>
                              <td className="px-3 py-2">{r.skus.length ? r.skus.map((s) => <div key={s.sku} className={s.product ? "" : "text-warning"}>{s.quantity}× {s.sku} {s.product ? <span className="text-muted">— {s.product.split(" · ").slice(1).join(" · ")}</span> : "— não encontrado"}</div>) : <span className="text-warning">sem SKU</span>}{r.warnings.filter((w) => !w.startsWith("SKU sem produto")).map((w) => <div key={w} className="text-[10px] text-muted">{w}</div>)}</td>
                              <td className="px-3 py-2">{r.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <fieldset className="mt-3 rounded border border-line p-3">
                      <legend className="px-1 text-xs font-medium">Custos padrão para os anúncios importados (o Mercado Livre não informa)</legend>
                      <div className="grid gap-3 sm:grid-cols-5">
                        {field("taxPct", "Imposto (%) — padrão 14,5", "14,5")}{field("packaging", "Embalagem por unid. (R$)", "0,00")}{field("shipping", "Frete pago por você, por unid. (R$)", "0,00")}{field("fixedFee", "Tarifa fixa por unid. (R$)", "0,00")}{field("other", "Outros custos por unid. (R$)", "0,00")}
                      </div>
                      <label className="mt-2 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={def.applyExisting} onChange={(e) => setDef({ ...def, applyExisting: e.target.checked })} />Aplicar esses custos também aos anúncios já cadastrados (senão, eles mantêm os custos que já têm)</label>
                      <p className="mt-1 text-[11px] text-muted">A tarifa de venda (%) vem da planilha. O lucro das vendas usa as tarifas e fretes reais da planilha de vendas; estes custos servem para a simulação e quando a venda não traz o valor.</p>
                    </fieldset>
                  </div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button className="h-10 rounded px-4 text-sm hover:bg-ink/5" onClick={() => setOpen(false)}>Cancelar</button>
                  <button className="h-10 rounded bg-accent px-5 text-sm text-accent-ink disabled:opacity-40" disabled={!prev || !prev.totals.rows || pending} onClick={() => send("commit")} data-ml-listing-commit>{pending && prev ? "Importando…" : `Importar ${prev?.totals.rows ?? 0} anúncio(s)`}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
