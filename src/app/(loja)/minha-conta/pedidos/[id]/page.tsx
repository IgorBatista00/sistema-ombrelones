import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { getCommercialSettings } from "@/modules/orders/service";
import { isPaymentConfigured } from "@/modules/integrations/payments";
import { LABELS } from "@/modules/orders/state";
import { StatusBadge } from "@/components/account/status";
import { PaymentPanel, QuoteResponse, ReorderButton } from "@/components/account/account-actions";
import { Notice } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Pedido", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string }> }) {
  const viewer = await getViewer();
  if (!viewer.user || !viewer.company) redirect("/entrar");
  const { id } = await params;
  const { novo } = await searchParams;
  const order = await db.order.findFirst({
    where: { id, companyId: viewer.company.id }, // isolamento por empresa
    include: { items: true, shippingQuote: true, payments: { orderBy: { createdAt: "desc" } }, shipments: true, fiscalDocs: true },
  });
  if (!order) notFound();
  const settings = await getCommercialSettings().catch(() => null);
  const addr = order.addressSnapshot as Record<string, string>;
  const q = order.shippingQuote;
  const lastPayment = order.payments[0] ?? null;
  const canPay = order.commercialStatus === "CONFIRMED" && order.totalCents != null && (order.financialStatus === "NOT_STARTED" || order.financialStatus === "AWAITING_PAYMENT" || order.financialStatus === "FAILED");

  return (
    <div className="container max-w-5xl py-10 md:py-16">
      <nav className="label mb-6"><Link href="/minha-conta#pedidos">Meus pedidos</Link> / Nº {order.code}</nav>

      {novo && (
        <div className="mb-10">
          <Notice tone="success" title={order.commercialStatus === "AWAITING_QUOTE" ? "Solicitação de cotação registrada" : "Pedido registrado"}>
            {order.commercialStatus === "AWAITING_QUOTE"
              ? "Nossa equipe enviará a proposta de frete por e-mail. Os itens ficam reservados até lá. O pagamento será liberado após o seu aceite."
              : "Escolha a forma de pagamento abaixo para concluir. Os itens ficam reservados pelo prazo da cobrança."}
          </Notice>
        </div>
      )}

      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl">Pedido nº {order.code}</h1>
          <p className="mt-2 text-sm text-muted">{order.createdAt.toLocaleString("pt-BR")}</p>
        </div>
        <ReorderButton orderId={order.id} />
      </header>

      <dl className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
        {(["COMMERCIAL", "FINANCIAL", "LOGISTIC", "FISCAL"] as const).map((dim) => {
          const value = { COMMERCIAL: order.commercialStatus, FINANCIAL: order.financialStatus, LOGISTIC: order.logisticStatus, FISCAL: order.fiscalStatus }[dim];
          const title = { COMMERCIAL: "Pedido", FINANCIAL: "Situação financeira", LOGISTIC: "Entrega", FISCAL: "Nota fiscal" }[dim];
          return <div key={dim} className="card p-4"><dt className="label mb-2">{title}</dt><dd><StatusBadge dim={dim} value={value} /></dd></div>;
        })}
      </dl>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-10">
          {q?.status === "PROPOSED" && q.priceCents != null && q.carrierName && q.deadlineDays != null && (
            <QuoteResponse orderId={order.id} carrier={q.carrierName} priceCents={q.priceCents} deadlineDays={q.deadlineDays} validUntil={q.validUntil?.toISOString() ?? null} />
          )}
          {canPay && settings && (
            <PaymentPanel orderId={order.id} enabled={settings.enabledMethods} configured={isPaymentConfigured()} cardReady={false /* PENDENTE: componente de tokenização do cartão (Pagar.me tokenizecard.js) */}
              existing={lastPayment ? { method: lastPayment.method, status: lastPayment.status, pixQrCode: lastPayment.pixQrCode, pixQrCodeUrl: lastPayment.pixQrCodeUrl, boletoUrl: lastPayment.boletoUrl, boletoLine: lastPayment.boletoLine, dueAt: lastPayment.dueAt?.toISOString(), failureReason: lastPayment.failureReason } : null} />
          )}

          <section>
            <h2 className="label mb-4">Itens</h2>
            <ul className="divide-y divide-line border-y border-line text-sm">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 py-4">
                  <span><span className="block">{i.productName}</span><span className="text-xs text-muted">SKU {i.sku} · {i.quantity} × {formatBRL(i.unitPriceCents)}</span></span>
                  <span>{formatBRL(i.totalCents)}</span>
                </li>
              ))}
            </ul>
          </section>

          {order.shipments.length > 0 && (
            <section>
              <h2 className="label mb-4">Expedição</h2>
              {order.shipments.map((s) => (
                <p key={s.id} className="text-sm">{s.carrierName}{s.trackingCode && <> · Rastreio: {s.trackingUrl ? <a className="link" href={s.trackingUrl} target="_blank" rel="noopener">{s.trackingCode}</a> : s.trackingCode}</>}</p>
              ))}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <div className="card p-6 text-sm">
            <h2 className="label mb-4">Resumo</h2>
            <dl className="space-y-2">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatBRL(order.subtotalCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Frete</dt><dd>{order.shippingCents != null ? formatBRL(order.shippingCents) : LABELS.COMMERCIAL[order.commercialStatus] === "Aguardando cotação" ? "A cotar" : "—"}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base"><dt>Total</dt><dd>{order.totalCents != null ? formatBRL(order.totalCents) : "—"}</dd></div>
            </dl>
            {q && q.carrierName && <p className="mt-4 text-xs text-muted">Transporte: {q.carrierName}{q.serviceName && ` · ${q.serviceName}`}{q.deadlineDays && ` · ${q.deadlineDays} dias úteis`}</p>}
            {lastPayment && <p className="mt-2 text-xs text-muted">Pagamento: {{ PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão" }[lastPayment.method]}</p>}
          </div>
          <div className="card p-6 text-sm">
            <h2 className="label mb-3">Entrega</h2>
            <p className="text-muted">{addr.recipient}<br />{addr.street}, {addr.number}{addr.complement && ` – ${addr.complement}`}<br />{addr.district} · {addr.city}/{addr.state}<br />CEP {addr.zipCode}</p>
          </div>
          <p className="text-xs text-muted">Dúvidas sobre este pedido? Fale com o comercial informando o número {order.code}.</p>
        </aside>
      </div>
    </div>
  );
}
