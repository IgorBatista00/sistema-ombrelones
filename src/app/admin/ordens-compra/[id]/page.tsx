import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/modules/auth/session";
import { formatBRL } from "@/lib/money";
import { Badge } from "@/components/ui/misc";
import { getPurchaseOrder } from "@/modules/purchase-orders/service";
import { fmtQty, spDay } from "@/modules/purchase-orders/rules";
import { DateButton, DeleteReceiptButton, ReceiptButton, StatusButton } from "@/components/admin/po-actions";

export const metadata = { title: "Ordem de compra" };
const d = (x: Date | null) => (x ? x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const dt = (x: Date) => x.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const days = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("STOCK");
  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();
  const open = po.status === "ABERTA";
  const anyReceived = po.detailItems.some((i) => i.received > 0);
  const priced = po.detailItems.filter((i) => i.unitCostCents != null);
  const prazo = !po.due ? <span className="text-warning">Sem data prometida — informe a data combinada para acompanhar o atraso.</span>
    : po.state === "CANCELADA" ? <span className="text-muted">—</span>
    : !po.open ? (po.onTime == null ? <span>—</span> : po.onTime ? <span className="text-success">Entregue no prazo</span> : <span className="text-danger">Entregue com {days(po.lateDays)} de atraso</span>)
    : po.late ? <strong className="font-medium text-danger">Atrasada há {days(po.lateDays)}</strong>
    : po.daysLeft === 0 ? <span className="font-medium text-warning">Chega hoje</span> : <span>Faltam {days(po.daysLeft ?? 0)}</span>;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/ordens-compra" className="link">← Ordens de compra</Link></p>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-sans text-2xl font-medium">{po.code}</h1><Badge tone={po.stateTone}>{po.stateLabel}</Badge>{po.late && <Badge tone="danger">Atrasada</Badge>}</div>
          <p className="mt-1 text-sm text-muted">{po.supplierName}{po.supplier.tradeName && po.supplier.legalName !== po.supplier.tradeName ? ` · ${po.supplier.legalName}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {open && <ReceiptButton id={po.id} code={po.code} orderedAt={spDay(po.orderedAt)} items={po.detailItems.map((i) => ({ id: i.id, description: i.description, unit: i.unit, quantity: i.quantity, received: i.received, pending: i.pending }))} />}
          {open && <DateButton id={po.id} code={po.code} orderedAt={spDay(po.orderedAt)} current={po.promisedAt ? spDay(po.promisedAt) : ""} />}
          {open && <Link href={`/admin/ordens-compra/${po.id}/editar`} className="inline-flex h-9 items-center rounded border border-line px-4 text-sm hover:bg-ink/5">Editar</Link>}
          {open && anyReceived && <StatusButton id={po.id} code={po.code} action="encerrar" />}
          {open && !anyReceived && <StatusButton id={po.id} code={po.code} action="cancelar" />}
          {(po.state === "ENCERRADA_SALDO" || po.state === "CANCELADA") && <StatusButton id={po.id} code={po.code} action="reabrir" />}
        </div>
      </div>

      {po.closeReason && <p className="card mb-4 border-l-4 p-3 text-sm">Encerrada com saldo em {d(po.closedAt)}. Motivo: {po.closeReason}</p>}
      {po.cancelReason && <p className="card mb-4 border-l-4 p-3 text-sm">Cancelada em {d(po.canceledAt)}. Motivo: {po.cancelReason}</p>}

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="card p-4 text-sm"><p className="label">Pedido ao fornecedor</p><p className="mt-1 text-lg">{d(po.orderedAt)}</p><p className="text-xs text-muted">{po.buyer ? `Responsável: ${po.buyer}` : "Responsável não informado"}</p></div>
        <div className="card p-4 text-sm"><p className="label">Entrega prometida</p><p className="mt-1 text-lg">{d(po.due)}</p><p className="text-xs text-muted">{po.dueEstimated ? "Estimada pelo prazo do cadastro" : po.rescheduled ? `Remarcada · original ${d(po.originalPromisedAt)}` : po.due ? "Data combinada com o fornecedor" : ""}</p></div>
        <div className="card p-4 text-sm"><p className="label">Situação do prazo</p><p className="mt-1 text-lg">{prazo}</p>{po.lastReceiptAt && <p className="text-xs text-muted">Última entrega: {d(po.lastReceiptAt)}</p>}</div>
        <div className="card p-4 text-sm"><p className="label">Recebido</p><p className="mt-1 text-lg">{po.receivedPct}%</p><div className="mt-2 h-1.5 overflow-hidden rounded bg-ink/10"><div className="h-full bg-[#4a6b4f]" style={{ width: `${po.receivedPct}%` }} /></div></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <section className="card overflow-x-auto">
            <h2 className="px-5 pt-5 font-sans text-base font-medium">Itens</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Item", "Pedido", "Recebido", "Saldo", "Valor unit.", "Total"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-2 font-normal">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{po.detailItems.map((i) => (
                <tr key={i.id} data-po-line={i.description}>
                  <td className="px-4 py-2">{i.productId ? <Link className="hover:underline" href={`/admin/produtos/${i.productId}`}>{i.description}</Link> : i.description}{!i.variantId && <span className="ml-1 text-xs text-muted">(item livre)</span>}{i.notes && <p className="text-xs text-muted">{i.notes}</p>}</td>
                  <td className="whitespace-nowrap px-4 py-2">{fmtQty(i.quantity)} {i.unit}</td>
                  <td className={`whitespace-nowrap px-4 py-2 ${i.pending <= 0 ? "text-success" : i.received > 0 ? "text-warning" : ""}`}>{fmtQty(i.received)} {i.unit}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium">{i.pending > 0 ? `${fmtQty(i.pending)} ${i.unit}` : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2">{i.unitCostCents == null ? "—" : formatBRL(i.unitCostCents)}</td>
                  <td className="whitespace-nowrap px-4 py-2">{i.unitCostCents == null ? "—" : formatBRL(Math.round(i.unitCostCents * i.quantity))}</td>
                </tr>))}</tbody>
            </table>
            {priced.length > 0 && <p className="px-5 py-3 text-right text-sm">Total{priced.length < po.detailItems.length ? " dos itens com valor" : ""}: <strong className="font-medium">{formatBRL(po.totalCents ?? 0)}</strong></p>}
          </section>

          <section className="card p-5">
            <h2 className="font-sans text-base font-medium">Entregas recebidas</h2>
            {po.receipts.length === 0 && <p className="mt-3 text-sm text-muted">Nenhuma entrega registrada ainda.</p>}
            <ul className="mt-3 divide-y divide-line">{po.receipts.map((r) => (
              <li key={r.id} className="py-3 text-sm" data-receipt={d(r.receivedAt)}>
                <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">{d(r.receivedAt)}{r.invoiceNumber ? ` · NF ${r.invoiceNumber}` : ""}</p>{po.state !== "CANCELADA" && <DeleteReceiptButton orderId={po.id} receiptId={r.id} label={d(r.receivedAt)} />}</div>
                <ul className="mt-1 text-xs">{r.lines.map((l) => <li key={l.itemId}>{fmtQty(l.quantity)} {l.unit} · {l.description}</li>)}</ul>
                <p className="mt-1 text-xs text-muted">{[r.receivedBy && `Conferido por ${r.receivedBy}`, `lançado por ${r.by}`].filter(Boolean).join(" · ")}</p>
                {r.notes && <p className="mt-1 text-xs">{r.notes}</p>}
              </li>))}</ul>
            <p className="mt-3 text-xs text-muted">A OC não movimenta o estoque. Para dar entrada da nota no estoque e no custo médio, use <Link href="/admin/estoque/compras/nova" className="link">Estoque › Compras</Link>.</p>
          </section>
        </div>

        <div className="space-y-5">
          <section className="card p-5 text-sm">
            <h2 className="font-sans text-base font-medium">Dados da compra</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted">Nº no fornecedor</dt><dd>{po.supplierRef ?? "—"}</dd>
              <dt className="text-muted">Pagamento</dt><dd>{po.paymentTerms ?? "—"}</dd>
              <dt className="text-muted">Criada por</dt><dd>{po.createdBy} · {dt(po.createdAt)}</dd>
            </dl>
            {po.notes && <><p className="label mt-4">Observações</p><p className="mt-1 whitespace-pre-line">{po.notes}</p></>}
          </section>
          <section className="card p-5 text-sm">
            <h2 className="font-sans text-base font-medium">Histórico</h2>
            <ol className="mt-3 space-y-3">{po.events.map((e) => (
              <li key={e.id} className="border-l-2 border-line pl-3"><p>{e.text}</p><p className="text-xs text-muted">{dt(e.at)} · {e.by}</p></li>))}</ol>
          </section>
        </div>
      </div>
    </>
  );
}
