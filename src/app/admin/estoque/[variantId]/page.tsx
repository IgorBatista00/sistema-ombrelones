import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { getStockDisplay } from "@/modules/inventory/movements";
import { recentMovements } from "@/modules/inventory/admin-queries";
import { stockText } from "@/modules/inventory/movements-rules";
import { getUnitPrices } from "@/modules/pricing";
import { formatBRL } from "@/lib/money";
import { Notice } from "@/components/ui/misc";
import { PageHead, Stat } from "@/components/admin/ui";
import { MoveButton } from "@/components/admin/stock-client";
import { MovesTable } from "@/components/admin/moves-table";

export default async function StockHistory({ params }: { params: Promise<{ variantId: string }> }) {
  await requireAdminPage("STOCK");
  const { variantId } = await params;
  const v = await db.productVariant.findUnique({ where: { id: variantId }, include: { stock: true, product: { select: { id: true, name: true, costFinalCents: true } } } });
  if (!v) notFound();
  const [moves, display, openRes] = await Promise.all([
    recentMovements(variantId, 200), getStockDisplay(),
    db.stockReservation.findMany({ where: { variantId, status: "ACTIVE" }, include: { order: { select: { id: true, number: true, code: true } } } }),
  ]);
  const onHand = v.stock?.onHand ?? 0, reserved = v.stock?.reserved ?? 0, free = Math.max(0, onHand - reserved);
  const [prices, buys] = await Promise.all([
    getUnitPrices([variantId]),
    db.purchaseItem.findMany({ where: { variantId }, include: { purchase: { select: { invoiceNumber: true, issuedAt: true, supplierId: true } } }, orderBy: { purchase: { issuedAt: "desc" } }, take: 50 }),
  ]);
  const suppliers = await db.supplier.findMany({ where: { id: { in: buys.map((b) => b.purchase.supplierId) } }, select: { id: true, legalName: true, tradeName: true } });
  const price = prices.get(variantId) ?? null;
  const avg = v.stock?.avgCostCents ?? v.product.costFinalCents;
  const last = v.stock?.lastCostCents ?? v.product.costFinalCents;
  const m = (c: number | null) => (price && c != null ? Math.round(((price - c) / price) * 10_000) : null);
  const mReal = m(avg), mRepo = m(last);
  const pf = (b: number | null) => (b == null ? "—" : `${(b / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
  const costs = buys.map((b) => b.unitTotalCents);
  return (
    <>
      <PageHead title={`Estoque · ${v.sku}`} subtitle={v.product.name} action={<span className="flex items-center gap-4 text-sm"><Link href="/admin/estoque" className="link">Voltar</Link>{v.availability !== "MADE_TO_ORDER" && <MoveButton row={{ variantId, sku: v.sku, name: v.product.name, onHand, reserved }} display={display} button />}</span>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Físico" value={onHand} /><Stat label="Reservado" value={reserved} hint={openRes.length ? `${openRes.length} pedido(s) não pagos` : undefined} />
        <Stat label="Disponível" value={free} hint={`Mínimo: ${v.stock?.minQty ?? 0}`} /><Stat label="Cliente vê" value={<span className="text-base">{stockText(free, display)}</span>} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Custo médio" value={avg == null ? "—" : formatBRL(avg)} hint={avg == null ? undefined : `Valor em estoque: ${formatBRL(avg * onHand)}${v.stock?.avgCostCents == null ? " · custo do cadastro" : ""}`} />
        <Stat label="Última compra" value={v.stock?.lastCostCents == null ? "—" : formatBRL(v.stock.lastCostCents)} hint={costs.length ? `Menor ${formatBRL(Math.min(...costs))} · maior ${formatBRL(Math.max(...costs))}` : "Sem compras lançadas"} />
        <Stat label="Margem real" value={pf(mReal)} hint="Preço de atacado × custo médio" />
        <Stat label="Margem de reposição" value={<span className={mRepo != null && mReal != null && mRepo < mReal - 200 ? "text-danger" : ""}>{pf(mRepo)}</span>} hint="Preço × custo da última compra" />
      </div>
      {mRepo != null && mReal != null && mRepo < mReal - 200 && price && <div className="mt-4"><Notice tone="warning" title="Custo de compra subindo">A margem pela última compra ({pf(mRepo)}) está abaixo da margem pelo custo médio ({pf(mReal)}). Avalie reajustar o preço de atacado ({formatBRL(price)}).</Notice></div>}
      <h2 className="label mb-3 mt-8">Compras</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Emissão", "Nota", "Fornecedor", "Qtd.", "Custo unit.", "IPI", "Frete rateado", "Custo final", "Variação", "Médio após"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{buys.map((b, i) => { const prev = buys[i + 1]; const vb = prev ? Math.round(((b.unitTotalCents - prev.unitTotalCents) / prev.unitTotalCents) * 10_000) : null; const s = suppliers.find((x) => x.id === b.purchase.supplierId); return (
            <tr key={b.id}><td className="px-4 py-2">{b.purchase.issuedAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td className="px-4 py-2">{b.purchase.invoiceNumber}</td><td className="px-4 py-2">{s?.tradeName ?? s?.legalName}</td><td className="px-4 py-2">{b.quantity}</td><td className="px-4 py-2">{formatBRL(b.unitCostCents)}</td><td className="px-4 py-2">{pf(b.ipiBps)}</td><td className="px-4 py-2">{formatBRL(b.allocatedCents)}</td><td className="px-4 py-2 font-medium">{formatBRL(b.unitTotalCents)}</td>
              <td className={`px-4 py-2 ${vb == null ? "" : vb > 0 ? "text-danger" : "text-success"}`}>{vb == null ? "—" : `${vb > 0 ? "▲" : "▼"} ${pf(Math.abs(vb))}`}</td><td className="px-4 py-2">{formatBRL(b.avgAfterCents)}</td></tr>); })}</tbody>
        </table>
        {buys.length === 0 && <p className="p-6 text-center text-sm text-muted">Nenhuma compra lançada para este SKU.</p>}
      </div>
      {openRes.length > 0 && <p className="mt-4 text-sm text-muted">Reservas ativas: {openRes.map((r, i) => <span key={r.id}>{i > 0 && ", "}<Link className="link" href={`/admin/pedidos/${r.order.id}`}>pedido nº {r.order.code}</Link> ({r.quantity} un.)</span>)}. Voltam ao disponível se o pedido expirar ou for cancelado.</p>}
      <h2 className="label mb-3 mt-8">Movimentações</h2>
      <MovesTable moves={moves} />
    </>
  );
}
