"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createPoAction, updatePoAction } from "@/modules/admin/purchase-order-actions";
import { formatBRL } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";

type Link_ = { supplierId: string; leadDays: number | null; leadLabel: string | null; code: string | null };
type V = { id: string; sku: string; name: string; links: Link_[] };
export type PoFormItem = { id?: string | null; kind: "produto" | "livre"; variantId: string; description: string; unit: string; quantity: string; unitCost: string; notes: string; received?: number };
export type PoFormValue = { supplierId: string; orderedAt: string; promisedAt: string; buyer: string; supplierRef: string; paymentTerms: string; notes: string; items: PoFormItem[] };

const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const blank = (): PoFormItem => ({ kind: "produto", variantId: "", description: "", unit: "un", quantity: "", unitCost: "", notes: "" });
const money = (s: string) => { const t = s.trim().replace(/[R$\s]/g, ""); if (!t) return null; const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t); return Number.isFinite(n) ? Math.round(n * 100) : null; };
const qty = (s: string) => { const t = s.trim(); if (!t) return null; const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(n) ? n : null; };
const LEAD: Record<string, string> = { PRONTA_ENTREGA: "Pronta entrega", D15: "15 dias", D30: "30 dias", D60: "60 dias", D90: "90 dias", IMPORTACAO: "Importação" };
const plus = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00-03:00`); d.setUTCDate(d.getUTCDate() + n); return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }); };

export function PoForm({ suppliers, variants, initial, id, code }: { suppliers: { id: string; name: string }[]; variants: V[]; initial?: PoFormValue; id?: string; code?: string }) {
  const [v, setV] = useState<PoFormValue>(initial ?? { supplierId: "", orderedAt: todayBR(), promisedAt: "", buyer: "", supplierRef: "", paymentTerms: "", notes: "", items: [blank()] });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof PoFormValue>(k: K, val: PoFormValue[K]) => setV((s) => ({ ...s, [k]: val }));
  const upd = (i: number, patch: Partial<PoFormItem>) => setV((s) => ({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const linkOf = (variantId: string) => variants.find((x) => x.id === variantId)?.links.find((l) => l.supplierId === v.supplierId) ?? null;
  const fromSupplier = useMemo(() => variants.filter((x) => x.links.some((l) => l.supplierId === v.supplierId)), [variants, v.supplierId]);
  const others = useMemo(() => variants.filter((x) => !x.links.some((l) => l.supplierId === v.supplierId)), [variants, v.supplierId]);
  const leadKnown = v.items.map((i) => (i.kind === "produto" && i.variantId ? linkOf(i.variantId)?.leadDays ?? null : null)).filter((d): d is number => d != null);
  const estimate = !v.promisedAt && leadKnown.length && v.orderedAt ? plus(v.orderedAt, Math.max(...leadKnown)) : null;
  const priced = v.items.filter((i) => money(i.unitCost) != null && qty(i.quantity));
  const total = priced.reduce((a, i) => a + Math.round((money(i.unitCost) ?? 0) * (qty(i.quantity) ?? 0)), 0);

  function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    const payload = {
      ...v,
      items: v.items.filter((i) => i.variantId || i.description.trim() || i.quantity.trim()).map((i) => ({
        id: i.id ?? null, variantId: i.kind === "produto" ? i.variantId || null : null, description: i.kind === "livre" ? i.description : "", unit: i.unit, quantity: i.quantity, unitCost: i.unitCost, notes: i.notes,
      })),
    };
    start(async () => {
      const r = id ? await updatePoAction(id, payload) : await createPoAction(payload);
      if (!r.ok) { setError(r.error); return; }
      router.push(`/admin/ordens-compra/${id ?? (r.data as { id: string }).id}`); router.refresh();
    });
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="card grid gap-4 p-5 md:grid-cols-3">
        <Field label="Fornecedor *" htmlFor="po-sup">
          <Select id="po-sup" className="h-10" value={v.supplierId} onChange={(e) => set("supplierId", e.target.value)} required>
            <option value="">Selecione</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Data do pedido ao fornecedor *" htmlFor="po-ord"><Input id="po-ord" type="date" className="h-10" value={v.orderedAt} max={todayBR()} onChange={(e) => set("orderedAt", e.target.value)} required /></Field>
        <Field label="Data de entrega prometida" htmlFor="po-prom">
          <Input id="po-prom" type="date" className="h-10" value={v.promisedAt} min={v.orderedAt || undefined} onChange={(e) => set("promisedAt", e.target.value)} />
        </Field>
        <Field label="Responsável pela compra" htmlFor="po-buyer"><Input id="po-buyer" className="h-10" value={v.buyer} maxLength={80} onChange={(e) => set("buyer", e.target.value)} placeholder="Quem fez o pedido" /></Field>
        <Field label="Nº do pedido / cotação no fornecedor" htmlFor="po-ref"><Input id="po-ref" className="h-10" value={v.supplierRef} maxLength={60} onChange={(e) => set("supplierRef", e.target.value)} /></Field>
        <Field label="Condição de pagamento" htmlFor="po-pay"><Input id="po-pay" className="h-10" value={v.paymentTerms} maxLength={120} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="Ex.: 30/60 dias, boleto" /></Field>
        <div className="md:col-span-3 text-xs text-muted">
          {v.promisedAt ? "O atraso é contado a partir da data prometida pelo fornecedor." : estimate ? <>Sem data prometida: a entrega será estimada pelo prazo do cadastro do produto — <strong className="font-medium text-ink">{estimate}</strong>.</> : "Sem data prometida e sem prazo no cadastro dos itens: não será possível medir atraso. Informe a data combinada com o fornecedor."}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Tipo", "Item", "Unid.", "Qtd. *", "Valor unit. (R$)", "Prazo do cadastro", ""].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {v.items.map((it, i) => {
              const link = it.kind === "produto" && it.variantId ? linkOf(it.variantId) : null;
              const locked = (it.received ?? 0) > 0;
              return (
                <tr key={i} data-po-item={i}>
                  <td className="px-3 py-2"><Select className="h-9" aria-label="Tipo do item" value={it.kind} disabled={locked} onChange={(e) => upd(i, { kind: e.target.value as PoFormItem["kind"], variantId: "", description: "" })}><option value="produto">Produto</option><option value="livre">Item livre</option></Select></td>
                  <td className="min-w-72 px-3 py-2">
                    {it.kind === "produto" ? (
                      <Select className="h-9" aria-label="Produto" value={it.variantId} disabled={locked} onChange={(e) => upd(i, { variantId: e.target.value })}>
                        <option value="">Selecione o produto</option>
                        {fromSupplier.length > 0 && <optgroup label="Produtos deste fornecedor">{fromSupplier.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</optgroup>}
                        <optgroup label={v.supplierId ? "Outros produtos" : "Produtos"}>{others.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</optgroup>
                      </Select>
                    ) : (
                      <Input className="h-9" aria-label="Descrição do item" placeholder="Ex.: Lona acrílica 2 m — areia" value={it.description} maxLength={200} disabled={locked} onChange={(e) => upd(i, { description: e.target.value })} />
                    )}
                    {link?.code && <p className="mt-1 text-xs text-muted">Código no fornecedor: {link.code}</p>}
                    {locked && <p className="mt-1 text-xs text-muted">Já recebido: {it.received!.toLocaleString("pt-BR")} {it.unit}</p>}
                  </td>
                  <td className="px-3 py-2"><Input className="h-9 w-20" aria-label="Unidade" value={it.unit} maxLength={12} onChange={(e) => upd(i, { unit: e.target.value })} /></td>
                  <td className="px-3 py-2"><Input className="h-9 w-24" inputMode="decimal" aria-label="Quantidade" value={it.quantity} onChange={(e) => upd(i, { quantity: e.target.value })} /></td>
                  <td className="px-3 py-2"><Input className="h-9 w-28" inputMode="decimal" aria-label="Valor unitário" placeholder="opcional" value={it.unitCost} onChange={(e) => upd(i, { unitCost: e.target.value })} /></td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{it.kind === "livre" ? "—" : !it.variantId ? "—" : !v.supplierId ? "Escolha o fornecedor" : link ? (link.leadLabel ? LEAD[link.leadLabel] : "Não informado") : "Produto sem vínculo com este fornecedor"}</td>
                  <td className="px-3 py-2">{!locked && <button type="button" className="text-danger" aria-label="Remover item" onClick={() => setV((s) => ({ ...s, items: s.items.length > 1 ? s.items.filter((_, j) => j !== i) : [blank()] }))}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" className="h-9 px-4 text-sm" onClick={() => setV((s) => ({ ...s, items: [...s.items, blank()] }))}>+ Adicionar item</Button>
        {priced.length > 0 && <p className="text-sm">Total dos itens com valor: <strong className="font-medium">{formatBRL(total)}</strong>{priced.length < v.items.length ? <span className="text-xs text-muted"> (alguns itens sem valor)</span> : null}</p>}
      </div>
      <div className="card p-5"><Field label="Observações" htmlFor="po-notes"><Textarea id="po-notes" rows={3} value={v.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} placeholder="Combinações com o fornecedor, frete, contato…" /></Field></div>
      <p className="text-xs text-muted">A ordem de compra serve para acompanhar prazos e entregas. Ela não altera o estoque: quando a mercadoria chegar, a entrada da nota continua em Estoque › Compras.</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Link href={id ? `/admin/ordens-compra/${id}` : "/admin/ordens-compra"} className="inline-flex h-10 items-center rounded px-4 text-sm hover:bg-ink/5">Cancelar</Link>
        <Button type="submit" className="h-10 px-5" disabled={pending}>{pending ? "Salvando…" : id ? `Salvar ${code ?? "OC"}` : "Criar ordem de compra"}</Button>
      </div>
    </form>
  );
}
