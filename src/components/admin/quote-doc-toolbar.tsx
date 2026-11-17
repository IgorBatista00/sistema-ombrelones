"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setQuoteStatusAction } from "@/modules/admin/quote-actions";

export function QuoteDocToolbar({ id, code, status, statusLabel, whatsapp }: { id: string; code: string; status: string; statusLabel: string; whatsapp: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const btn = "inline-flex h-9 items-center rounded border border-ink/70 bg-white px-4 text-sm hover:bg-ink hover:text-canvas";
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[860px] flex-wrap items-center gap-2 px-2">
      <span className="mr-auto text-sm">Orçamento {code} · <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs">{statusLabel}</span></span>
      <button className={btn} onClick={() => window.print()}>Imprimir / Salvar PDF</button>
      <button className={btn} onClick={async () => { try { await navigator.clipboard.writeText(whatsapp); setMsg("Resumo copiado — cole no WhatsApp"); } catch { setMsg("Não foi possível copiar"); } }}>Copiar resumo (WhatsApp)</button>
      <select className="h-9 rounded border border-ink/70 bg-white px-3 text-sm" aria-label="Alterar situação" value="" disabled={pending || status === "RASCUNHO"}
        onChange={(e) => { const v = e.target.value as "ENVIADO" | "APROVADO" | "RECUSADO"; if (!v) return; start(async () => { const r = await setQuoteStatusAction(id, v); setMsg(r.ok ? "Situação atualizada" : r.error); router.refresh(); }); }}>
        <option value="">Alterar situação…</option><option value="ENVIADO">Enviado</option><option value="APROVADO">Aprovado</option><option value="RECUSADO">Recusado</option>
      </select>
      <Link href={`/admin/orcamentos/${id}`} className={btn}>Editar</Link>
      {msg && <span className="w-full text-right text-xs text-success">{msg}</span>}
    </div>
  );
}
