import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { formatCnpj } from "@/modules/companies/cnpj";
import { cancelOrderAction, logisticAction } from "@/modules/admin/actions";
import { StatusBadge } from "@/components/account/status";
import { ActionForm } from "@/components/admin/action-form";
import { PageHead, Table, Td } from "@/components/admin/ui";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";

export default async function OrderAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("ORDERS");
  const order = await db.order.findUnique({
    where: { id: (await params).id },
    include: { items: true, company: true, shippingQuote: true, payments: { orderBy: { createdAt: "desc" } }, shipments: true, history: { orderBy: { createdAt: "desc" } }, fiscalDocs: true },
  });
  if (!order) notFound();
  const snap = order.companySnapshot as Record<string, string>;
  const addr = order.addressSnapshot as Record<string, string>;

  return (
    <>
      <PageHead title={`Pedido nº ${order.code}`} subtitle={`${order.createdAt.toLocaleString("pt-BR")} · ${order.shippingMode === "MANUAL_QUOTE" ? "Cotação manual" : "Frete automático"}`} />
      <div className="mb-8 flex flex-wrap gap-2">
        <StatusBadge dim="COMMERCIAL" value={order.commercialStatus} /><StatusBadge dim="FINANCIAL" value={order.financialStatus} />
        <StatusBadge dim="LOGISTIC" value={order.logisticStatus} /><StatusBadge dim="FISCAL" value={order.fiscalStatus} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Table head={["SKU", "Produto", "Qtd.", "Unitário", "Total"]}>
            {order.items.map((i) => <tr key={i.id}><Td>{i.sku}</Td><Td>{i.productName}{i.availability === "MADE_TO_ORDER" && <span className="ml-2 text-xs text-warning">sob encomenda</span>}</Td><Td>{i.quantity}</Td><Td>{formatBRL(i.unitPriceCents)}</Td><Td>{formatBRL(i.totalCents)}</Td></tr>)}
            <tr><Td className="text-muted">Subtotal</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td>{formatBRL(order.subtotalCents)}</Td></tr>
            <tr><Td className="text-muted">Frete</Td><Td>{order.shippingQuote?.carrierName ?? "—"}</Td><Td>{""}</Td><Td>{""}</Td><Td>{order.shippingCents != null ? formatBRL(order.shippingCents) : "A cotar"}</Td></tr>
            <tr><Td className="font-medium">Total</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td className="font-medium">{order.totalCents != null ? formatBRL(order.totalCents) : "—"}</Td></tr>
          </Table>

          <div className="card p-5">
            <h2 className="label mb-4">Logística</h2>
            {order.logisticStatus === "NOT_RELEASED" && order.financialStatus !== "PAID" && <Notice>Expedição liberada somente após confirmação do pagamento pelo provedor.</Notice>}
            {order.logisticStatus === "NOT_RELEASED" && order.financialStatus === "PAID" && (
              <ActionForm action={logisticAction} submit="Iniciar preparação"><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="to" value="PREPARING" /></ActionForm>
            )}
            {order.logisticStatus === "PREPARING" && (
              <ActionForm action={logisticAction} submit="Registrar expedição" className="grid gap-3 md:grid-cols-3">
                <input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="to" value="SHIPPED" />
                <Input name="carrierName" placeholder="Transportadora" required defaultValue={order.shippingQuote?.carrierName ?? ""} className="h-10" />
                <Input name="trackingCode" placeholder="Código de rastreio (opcional)" className="h-10" />
                <Input name="trackingUrl" type="url" placeholder="URL de rastreio (opcional)" className="h-10" />
              </ActionForm>
            )}
            {order.logisticStatus === "SHIPPED" && (
              <ActionForm action={logisticAction} submit="Confirmar entrega" confirm="Confirme apenas com comprovante de entrega.">
                <input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="to" value="DELIVERED" />
                <Input name="note" placeholder="Comprovante / observação" className="h-10" required />
              </ActionForm>
            )}
            {order.shipments.map((s) => <p key={s.id} className="mt-3 text-sm text-muted">{s.carrierName} · {s.trackingCode ?? "sem rastreio"} · expedido {s.shippedAt?.toLocaleDateString("pt-BR")}{s.deliveredAt && ` · entregue ${s.deliveredAt.toLocaleDateString("pt-BR")}`}</p>)}
          </div>

          <div className="card p-5">
            <h2 className="label mb-4">Pagamentos</h2>
            {order.payments.length === 0 ? <p className="text-sm text-muted">Nenhuma cobrança gerada.</p> : (
              <ul className="space-y-2 text-sm">{order.payments.map((p) => <li key={p.id}>{p.method} · {p.status} · {formatBRL(p.amountCents)} · {p.provider} {p.externalId && <span className="text-muted">({p.externalId})</span>}{p.paidAt && ` · pago ${p.paidAt.toLocaleString("pt-BR")}`}</li>)}</ul>
            )}
            <p className="mt-3 text-xs text-muted">A situação financeira é atualizada exclusivamente pelos webhooks autenticados do provedor.</p>
          </div>

          <div className="card p-5">
            <h2 className="label mb-4">Histórico</h2>
            <ol className="space-y-2 text-sm">
              {order.history.map((h) => <li key={h.id} className="flex gap-3"><span className="w-36 shrink-0 text-muted">{h.createdAt.toLocaleString("pt-BR")}</span><span>{h.dimension}: {h.fromValue ?? "—"} → {h.toValue} <span className="text-muted">({h.actorType}{h.note && ` · ${h.note}`})</span></span></li>)}
            </ol>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5 text-sm">
            <h2 className="label mb-3">Empresa</h2>
            <p className="font-medium">{snap.legalName}</p>
            <p className="text-muted">CNPJ {formatCnpj(snap.cnpj)}<br />Comprador: {snap.buyer} · {snap.email}</p>
            <Link href={`/admin/clientes?q=${order.company.cnpj}`} className="link mt-2 inline-block text-xs">Ver cliente</Link>
          </div>
          <div className="card p-5 text-sm">
            <h2 className="label mb-3">Entrega</h2>
            <p className="text-muted">{addr.recipient}<br />{addr.street}, {addr.number}{addr.complement && ` – ${addr.complement}`}<br />{addr.district} · {addr.city}/{addr.state} · CEP {addr.zipCode}</p>
          </div>
          {order.notes && <div className="card p-5 text-sm"><h2 className="label mb-3">Observações do cliente</h2><p>{order.notes}</p></div>}
          {order.commercialStatus !== "CANCELED" && order.financialStatus !== "PAID" && (
            <div className="card p-5">
              <h2 className="label mb-3">Cancelar pedido</h2>
              <ActionForm action={cancelOrderAction} submit="Cancelar pedido" confirm="Cancelar este pedido e liberar a reserva de estoque?">
                <input type="hidden" name="orderId" value={order.id} />
                <Input name="reason" placeholder="Motivo" required className="h-10" />
              </ActionForm>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
