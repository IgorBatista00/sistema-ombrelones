/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { getStockDisplay } from "@/modules/inventory/movements";
import { listStock, recentMovements, type StockFilters } from "@/modules/inventory/admin-queries";
import { PageHead, Stat } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { MinQtyInput, MoveButton, StockDisplayForm } from "@/components/admin/stock-client";
import { MovesTable } from "@/components/admin/moves-table";

const STATE = { zero: ["Zerado", "danger"], low: ["Abaixo do mínimo", "warning"], ok: ["Normal", "success"], mto: ["Sob encomenda", "neutral"] } as const;

export default async function StockPage({ searchParams }: { searchParams: Promise<StockFilters> }) {
  await requireAdminPage("STOCK");
  const sp = await searchParams;
  const display = await getStockDisplay();
  const [rows, all, categories, moves] = await Promise.all([listStock(sp, display), listStock({}, display), db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }), recentMovements(undefined, 12)]);
  const ctrl = all.filter((r) => !r.madeToOrder);
  const units = ctrl.reduce((a, r) => a + r.onHand, 0), value = ctrl.reduce((a, r) => a + (r.valueCents ?? 0), 0), reserved = ctrl.reduce((a, r) => a + r.reserved, 0);
  const zero = ctrl.filter((r) => r.state === "zero").length, low = ctrl.filter((r) => r.state === "low").length;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHead title="Estoque" subtitle="Saldo físico, reservas de pedidos e disponível para venda no site"
        action={<div className="flex flex-wrap gap-2">
          <a href={`/api/admin/stock/export${qs ? `?${qs}` : ""}`} className="inline-flex h-10 items-center rounded border border-ink/80 px-4 text-sm hover:bg-ink hover:text-canvas">Exportar Excel</a>
          <Link href="/admin/estoque/compras" className="inline-flex h-10 items-center rounded border border-ink/80 px-4 text-sm hover:bg-ink hover:text-canvas">Compras</Link>
          <Link href="/admin/estoque/compras/nova" className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink hover:bg-accent/90">Registrar compra</Link>
        </div>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Unidades em estoque" value={units.toLocaleString("pt-BR")} hint={`${ctrl.length} SKUs controlados`} />
        <Stat label="Valor do estoque (custo médio)" value={formatBRL(value)} hint="Saldo físico × custo médio ponderado" />
        <Stat label="Reservado em pedidos" value={reserved} hint="Aguardando pagamento ou cotação" />
        <Link href={`?situacao=${zero ? "zero" : "low"}`}><Stat label="Alertas" value={<span className={zero + low ? "text-danger" : ""}>{zero + low}</span>} hint={`${zero} zerados · ${low} abaixo do mínimo`} /></Link>
      </div>

      <StockDisplayForm initial={display} />

      <form className="mb-4 mt-6 grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
        <Input name="q" defaultValue={sp.q} placeholder="SKU, código ou nome" className="h-10" aria-label="Buscar" />
        <Select name="categoria" defaultValue={sp.categoria ?? ""} className="h-10" aria-label="Categoria"><option value="">Todas as categorias</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select name="situacao" defaultValue={sp.situacao ?? ""} className="h-10" aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(STATE).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Button type="submit" className="h-10">Filtrar</Button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["SKU", "", "Produto", "Físico", "Reservado", "Disponível", "Mínimo", "Situação", "Custo médio", "Últ. compra", "Valor", "Na loja", ""].map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.variantId}>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{r.sku}</td>
                <td className="px-3 py-2">{r.image ? <img src={r.image} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" /> : <div className="h-10 w-10 rounded bg-[#ece8e1]" />}</td>
                <td className="min-w-48 px-3 py-2"><Link href={`/admin/produtos/${r.productId}`} className="link">{r.productName}</Link>{r.variantName && <div className="text-xs text-muted">{r.variantName}</div>}</td>
                {r.madeToOrder ? <><td className="px-3">—</td><td className="px-3">—</td><td className="px-3">—</td><td className="px-3">—</td></> : <>
                  <td className="px-3 py-2">{r.onHand}</td><td className="px-3 py-2">{r.reserved}</td><td className="px-3 py-2 font-medium">{r.available}</td>
                  <td className="px-3 py-2"><MinQtyInput variantId={r.variantId} value={r.minQty} label={r.sku} /></td></>}
                <td className="px-3 py-2"><Badge tone={STATE[r.state][1]}>{STATE[r.state][0]}</Badge></td>
                <td className="whitespace-nowrap px-3 py-2">{r.madeToOrder || r.unitCostCents == null ? "—" : formatBRL(r.unitCostCents)}{!r.madeToOrder && r.unitCostCents != null && r.avgIsEstimate && <div className="text-[10px] text-muted">do cadastro</div>}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.lastCostCents == null ? "—" : formatBRL(r.lastCostCents)}{r.lastVariationBps != null && Math.abs(r.lastVariationBps) >= 50 && <div className={`text-xs ${r.lastVariationBps > 500 ? "text-danger" : r.lastVariationBps > 0 ? "text-warning" : "text-success"}`}>{r.lastVariationBps > 0 ? "▲" : "▼"} {(Math.abs(r.lastVariationBps) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs médio</div>}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.madeToOrder || r.valueCents == null ? "—" : formatBRL(r.valueCents)}</td>
                <td className="min-w-36 px-3 py-2 text-xs text-muted">{r.active ? r.storeText : "Produto inativo"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs"><span className="flex gap-3">{!r.madeToOrder && <MoveButton row={{ variantId: r.variantId, sku: r.sku, name: r.productName, onHand: r.onHand, reserved: r.reserved }} display={display} />}<Link href={`/admin/estoque/${r.variantId}`} className="link">Histórico</Link></span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum SKU encontrado.</p>}
      </div>

      <h2 className="label mb-3 mt-10">Últimas movimentações</h2>
      <MovesTable moves={moves} withProduct />
    </>
  );
}

