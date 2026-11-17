"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { registerPurchaseAction } from "@/modules/admin/stock-actions";
import { COST_ALERT_BPS, allocatePurchase, costVariationBps, newAverageCost } from "@/modules/inventory/movements-rules";
import { formatBRL } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";

type V = { id: string; sku: string; name: string; onHand: number; avgCostCents: number | null; lastCostCents: number | null; principalSupplierId: string | null; ipiBps: number | null };
type Item = { variantId: string; quantity: string; unitCost: string; ipi: string };
const money = (s: string) => { const t = s.trim().replace(/[R$\s]/g, ""); const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t || 0); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const pct = (s: string) => Math.round((Number(s.replace("%", "").replace(",", ".")) || 0) * 100);
const pctFmt = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function PurchaseForm({ suppliers, variants }: { suppliers: { id: string; name: string }[]; variants: V[] }) {
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoice] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [freight, setFreight] = useState("");
  const [other, setOther] = useState("");
  const [items, setItems] = useState<Item[]>([{ variantId: "", quantity: "", unitCost: "", ipi: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ totalCents: number; items: { sku: string; avgBefore: number | null; avgAfter: number }[] } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const filled = items.filter((i) => i.variantId && Number(i.quantity) > 0);
  const calc = useMemo(() => allocatePurchase(filled.map((i) => ({ quantity: Number(i.quantity), unitCostCents: money(i.unitCost), ipiBps: pct(i.ipi) })), money(freight), money(other)), [filled, freight, other]);
  const total = calc.reduce((a, l) => a + l.gross, 0) + money(freight) + money(other);
  const upd = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  if (done) {
    return (
      <div className="card max-w-2xl p-6">
        <Notice tone="success" title={`Compra registrada · ${formatBRL(done.totalCents)}`}>Estoque e custo médio atualizados.</Notice>
        <ul className="mt-4 space-y-1 text-sm">{done.items.map((i) => <li key={i.sku}>{i.sku}: médio {i.avgBefore == null ? "—" : formatBRL(i.avgBefore)} → <strong className="font-medium">{formatBRL(i.avgAfter)}</strong></li>)}</ul>
        <div className="mt-6 flex gap-2"><Link href="/admin/estoque" className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink">Voltar ao estoque</Link><Button variant="secondary" className="h-10" onClick={() => { setDone(null); setInvoice(""); setFreight(""); setOther(""); setItems([{ variantId: "", quantity: "", unitCost: "", ipi: "" }]); }}>Lançar outra nota</Button></div>
      </div>
    );
  }

  let k = -1;
  return (
    <form className="space-y-5" onSubmit={(e) => {
      e.preventDefault(); setError(null);
      start(async () => {
        const r = await registerPurchaseAction({ supplierId, invoiceNumber, issuedAt, freight: freight || "0", other: other || "0", items: items.filter((i) => i.variantId).map((i) => ({ ...i, ipi: i.ipi || "0" })) });
        if (!r.ok) return setError(r.error);
        setDone(r.data); router.refresh();
      });
    }}>
      <div className="card grid gap-4 p-5 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <Field label="Fornecedor" htmlFor="pc-sup"><Select id="pc-sup" className="h-10" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required><option value="">Selecione</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Nota fiscal" htmlFor="pc-nf"><Input id="pc-nf" className="h-10" value={invoiceNumber} onChange={(e) => setInvoice(e.target.value)} placeholder="12345" required /></Field>
        <Field label="Data de emissão" htmlFor="pc-dt"><Input id="pc-dt" type="date" className="h-10" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} required /></Field>
        <Field label="Frete da nota (R$)" htmlFor="pc-fr"><Input id="pc-fr" className="h-10" inputMode="decimal" placeholder="0,00" value={freight} onChange={(e) => setFreight(e.target.value)} /></Field>
        <Field label="Outras despesas (R$)" htmlFor="pc-ot"><Input id="pc-ot" className="h-10" inputMode="decimal" placeholder="seguro, descarga…" value={other} onChange={(e) => setOther(e.target.value)} /></Field>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Produto", "Qtd.", "Custo unit. (R$)", "IPI %", "Frete rateado", "Custo final unit.", "Médio atual", "Novo médio", ""].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {items.map((it, i) => {
              const v = variants.find((x) => x.id === it.variantId);
              const l = it.variantId && Number(it.quantity) > 0 ? calc[++k] : undefined;
              const na = v && l ? newAverageCost(v.onHand, v.avgCostCents, l.quantity, l.unitTotalCents) : null;
              const varBps = v && l ? costVariationBps(l.unitTotalCents, v.avgCostCents) : null;
              return (
                <tr key={i}>
                  <td className="min-w-64 px-3 py-2"><Select className="h-9" aria-label="Produto" value={it.variantId} onChange={(e) => { const nv = variants.find((x) => x.id === e.target.value); upd(i, { variantId: e.target.value, ipi: it.ipi || (nv?.ipiBps != null ? String(nv.ipiBps / 100).replace(".", ",") : "") }); }}>
                    <option value="">Selecione o produto</option>{variants.filter((x) => x.id === it.variantId || !items.some((y) => y.variantId === x.id)).map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</Select></td>
                  <td className="px-3 py-2"><Input className="h-9 w-20" type="number" min={1} aria-label="Quantidade" value={it.quantity} onChange={(e) => upd(i, { quantity: e.target.value })} /></td>
                  <td className="px-3 py-2"><Input className="h-9 w-28" inputMode="decimal" aria-label="Custo unitário" placeholder="0,00" value={it.unitCost} onChange={(e) => upd(i, { unitCost: e.target.value })} /></td>
                  <td className="px-3 py-2"><Input className="h-9 w-20" inputMode="decimal" aria-label="IPI" value={it.ipi} onChange={(e) => upd(i, { ipi: e.target.value })} /></td>
                  <td className="whitespace-nowrap px-3 py-2">{l ? formatBRL(l.allocatedCents) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{l ? formatBRL(l.unitTotalCents) : "—"}{varBps != null && varBps > COST_ALERT_BPS && <div className="text-xs font-normal text-danger">▲ {pctFmt(varBps)} acima do médio</div>}</td>
                  <td className="whitespace-nowrap px-3 py-2">{v ? <>{v.avgCostCents == null ? "—" : formatBRL(v.avgCostCents)}<div className="text-xs text-muted">{v.onHand} un.</div></> : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{na != null && v && l ? <><strong className="font-medium">{formatBRL(na)}</strong><div className="text-xs text-muted">{v.onHand + l.quantity} un.</div></> : "—"}</td>
                  <td className="px-3 py-2"><button type="button" className="text-danger" aria-label="Remover item" onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : [{ variantId: "", quantity: "", unitCost: "", ipi: "" }]))}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" className="h-9 px-4 text-sm" onClick={() => setItems((xs) => [...xs, { variantId: "", quantity: "", unitCost: "", ipi: xs.at(-1)?.ipi ?? "" }])}>+ Adicionar item</Button>
        <p className="text-sm">Total da nota: <strong className="font-medium">{formatBRL(total)}</strong></p>
      </div>
      <p className="text-xs text-muted">Custo final unit. = custo + IPI + frete e despesas rateados pelo valor de cada item. Novo médio = (saldo × médio atual + qtd × custo final) ÷ (saldo + qtd). ICMS recuperável não entra no custo — confirme o critério com o seu contador.</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end gap-2"><Link href="/admin/estoque" className="inline-flex h-10 items-center rounded px-4 text-sm hover:bg-ink/5">Cancelar</Link><Button type="submit" className="h-10 px-5" disabled={pending || !filled.length}>{pending ? "Registrando…" : "Registrar entrada"}</Button></div>
    </form>
  );
}
