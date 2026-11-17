"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicateQuoteAction, saveQuoteAction } from "@/modules/admin/quote-actions";
import type { ClientOption, QuoteProductOption } from "@/modules/quotes/service";
import { QuoteSheet, type CompanyHeader, type SheetData } from "./quote-sheet";
import { sheetInstallments, sheetTotals } from "@/modules/quotes/sheet";
import { installmentError } from "@/modules/quotes/totals";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";

/** Tela de edição: a própria folha do orçamento, editável (o que se vê é o que sai impresso). */
export function QuoteEditor({ initial, products, clients, company, categories = [] }: { initial: SheetData; products: QuoteProductOption[]; clients: ClientOption[]; company: CompanyHeader; categories?: string[] }) {
  const [q, setQ] = useState<SheetData>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  async function upload(file: File) {
    const fd = new FormData(); fd.append("files", file);
    try {
      const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setError(`Erro no upload: ${json.error?.message ?? "tente novamente"}`); return null; }
      return json.data[0]?.url as string;
    } catch { setError("Erro no upload: falha de conexão."); return null; }
  }
  const save = (generate: boolean) => start(async () => {
    setError(null);
    const diff = sheetInstallments(q, sheetTotals(q).total).diffCents;
    if (generate && diff !== 0) { setError(installmentError(diff)); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const items = q.items.filter((i) => i.variantId || i.name);
    const r = await saveQuoteAction({
      id: q.id, companyId: q.companyId, clientId: q.clientId || null, category: q.category || null, client: q.client, commercial: q.commercial, issuedAt: q.issuedAt, validDays: q.validDays,
      deliveryDays: q.deliveryDays, paymentTerms: q.paymentTerms, installmentPlan: q.installmentPlan, installmentValues: q.installmentValues, notes: q.notes,
      freightTerm: q.freightTerm, freight: q.freight || "0", extraDiscount: q.extraDiscount || "0",
      items: items.map((i) => ({ id: i.id, variantId: i.variantId, imageUrl: i.imageUrl, name: i.name, fabricLine: i.fabricLine, paint: i.paint, measures: i.measures, finish: i.finish, cordage: i.cordage, itemNotes: i.itemNotes, quantity: i.quantity, unitPrice: i.unitPrice || "0", unitDiscount: i.unitDiscount || "0" })),
    }, generate);
    if (!r.ok) { setError(r.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (generate) router.push(`/orcamento/${r.data.id}`);
    else { router.replace(`/admin/orcamentos/${r.data.id}`); router.refresh(); setQ((s) => ({ ...s, id: r.data.id })); }
  });

  return (
    <div className="pb-10">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="label">{q.code ? `Orçamento ${q.code}` : "Novo orçamento"}</p><h1 className="mt-1 font-sans text-2xl font-medium">{q.client.name || "Cliente não informado"}</h1></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/orcamentos" className="inline-flex h-10 items-center rounded px-4 text-sm hover:bg-ink/5">Voltar</Link>
          {q.id && q.status !== "RASCUNHO" && <Link href={`/orcamento/${q.id}`} className="inline-flex h-10 items-center rounded border border-ink/80 px-4 text-sm hover:bg-ink hover:text-canvas">Ver orçamento</Link>}
          <Button variant="secondary" className="h-10 px-4" disabled={pending} onClick={() => save(false)}>Salvar rascunho</Button>
          <Button className="h-10 px-5" disabled={pending} onClick={() => save(true)}>{pending ? "Gerando…" : "Gerar orçamento"}</Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-line bg-white px-4 py-3 text-sm" data-quote-category>
        <label htmlFor="q-category" className="font-medium">Categoria do pedido</label>
        <select id="q-category" className="h-9 rounded border border-line bg-white px-2" value={q.category} onChange={(e) => setQ((s) => ({ ...s, category: e.target.value }))}>
          <option value="">Sem categoria</option>
          {[...new Set([...categories, ...(q.category ? [q.category] : [])])].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-muted">Uso interno: não aparece no orçamento impresso nem no PDF.</span>
      </div>
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}
      <div className="overflow-x-auto"><QuoteSheet edit data={q} onChange={setQ} company={company} products={products} clients={clients} onUpload={upload} /></div>
      <p className="mt-3 text-center text-xs text-muted">A folha acima é exatamente o documento que será gerado. Custo e margem aparecem só aqui, na edição.</p>
    </div>
  );
}

export function DuplicateQuoteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button className="link" disabled={pending} onClick={() => start(async () => { const r = await duplicateQuoteAction(id); if (r.ok) router.push(`/admin/orcamentos/${r.data.id}`); else alert(r.error); })}>{pending ? "…" : "Duplicar"}</button>;
}
