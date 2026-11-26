"use client";
import Link from "next/link";
import { appendFiles } from "@/lib/upload-client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { formatBRL } from "@/lib/money";
import { fmtPct, type MarkupProfileRule } from "@/modules/pricing/markup";
import { goodsCost, productRevenue, saleResult, suggestProfile } from "@/modules/finance/operation-rules";
import { duplicateQuoteAction, saveQuoteAction } from "@/modules/admin/quote-actions";
import type { ClientOption, QuoteProductOption } from "@/modules/quotes/service";
import { QuoteSheet, type CompanyHeader, type SheetData } from "./quote-sheet";
import { sheetInstallments, sheetTotals } from "@/modules/quotes/sheet";
import { installmentError } from "@/modules/quotes/totals";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";

/** Tela de edição: a própria folha do orçamento, editável (o que se vê é o que sai impresso). */
type ProfileOpt = MarkupProfileRule & { id: string; name: string };
export function QuoteEditor({ initial, products, clients, company, categories = [], profiles = [] }: { initial: SheetData; products: QuoteProductOption[]; clients: ClientOption[]; company: CompanyHeader; categories?: string[]; profiles?: ProfileOpt[] }) {
  const [q, setQ] = useState<SheetData>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  async function upload(file: File) {
    const fd = new FormData();
    try {
      await appendFiles(fd, [file], "image");
      const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setError(`Erro no upload: ${json.error?.message ?? "tente novamente"}`); return null; }
      return json.data[0]?.url as string;
    } catch (e) { setError(`Erro no upload: ${e instanceof Error && e.message !== "Failed to fetch" ? e.message : "falha de conexão."}`); return null; }
  }
  // markup: sugere o dos produtos enquanto ninguém escolheu manualmente
  const [markupTouched, setMarkupTouched] = useState(!!initial.markupProfileId);
  const suggested = useMemo(() => suggestProfile(q.items.filter((i) => i.variantId).map((i) => ({ quantity: parseInt(i.quantity) || 0, profileId: products.find((p) => p.variantId === i.variantId)?.markupProfileId ?? null }))), [q.items, products]);
  useEffect(() => { if (!markupTouched && suggested && suggested !== q.markupProfileId) setQ((s) => ({ ...s, markupProfileId: suggested })); }, [suggested, markupTouched, q.markupProfileId]);
  const result = useMemo(() => {
    const prof = profiles.find((p) => p.id === q.markupProfileId); if (!prof) return null;
    const t = sheetTotals(q); const { revenue } = productRevenue({ totalCents: t.total, freightTerm: q.freightTerm, freightCents: t.freight });
    if (revenue <= 0) return null;
    const lines = q.items.filter((i) => i.variantId);
    const gc = goodsCost(lines.map((i) => ({ quantity: parseInt(i.quantity) || 0, unitCostCents: i.unitCostCents })));
    return { ...saleResult(revenue, gc.cost, prof), missing: gc.missing };
  }, [q, profiles]);
  const save = (generate: boolean) => start(async () => {
    setError(null);
    const diff = sheetInstallments(q, sheetTotals(q).total).diffCents;
    if (generate && diff !== 0) { setError(installmentError(diff)); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const items = q.items.filter((i) => i.variantId || i.name);
    const r = await saveQuoteAction({
      id: q.id, companyId: q.companyId, clientId: q.clientId || null, category: q.category || null, markupProfileId: q.markupProfileId || null, client: q.client, commercial: q.commercial, issuedAt: q.issuedAt, validDays: q.validDays,
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
        <span className="h-6 w-px bg-line" aria-hidden />
        <label htmlFor="q-markup" className="font-medium">Markup da venda</label>
        <select id="q-markup" className="h-9 rounded border border-line bg-white px-2" value={q.markupProfileId} data-quote-markup
          onChange={(e) => { setMarkupTouched(true); setQ((s) => ({ ...s, markupProfileId: e.target.value })); }}>
          <option value="">— escolha —</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {result && <span className={`text-xs ${result.belowMin ? "font-medium text-danger" : "text-muted"}`} data-quote-result>
          Resultado estimado: {formatBRL(result.result)} ({fmtPct(result.marginBps, 1)}){result.belowMin ? " · abaixo da margem mínima" : ""}{result.missing ? " · há item sem custo" : ""}</span>}
        <span className="w-full text-xs text-muted">Uso interno: não aparece no orçamento impresso nem no PDF. O markup define os custos (cartão, comissões, imposto…) usados no resultado da operação do Dashboard.</span>
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
