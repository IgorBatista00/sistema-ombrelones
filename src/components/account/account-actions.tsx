"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { formatBRL } from "@/lib/money";

export function LogoutButton() {
  const router = useRouter();
  return <Button variant="ghost" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); router.push("/"); router.refresh(); }}>Sair</Button>;
}

export function ReorderButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div>
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => {
        const r = await api<{ skipped: string[] }>("/api/cart/reorder", { method: "POST", body: { orderId } });
        if (!r.ok) return setMsg(r.error.message);
        if (r.data.skipped.length) setMsg(`Itens indisponíveis não adicionados: ${r.data.skipped.join(", ")}`);
        router.push("/carrinho"); router.refresh();
      })}>Comprar novamente</Button>
      {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
    </div>
  );
}

export function QuoteResponse({ orderId, carrier, priceCents, deadlineDays, validUntil }: { orderId: string; carrier: string; priceCents: number; deadlineDays: number; validUntil: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const respond = (accept: boolean) => start(async () => {
    const r = await api(`/api/orders/${orderId}/quote`, { method: "POST", body: { accept } });
    r.ok ? router.refresh() : setError(r.error.message);
  });
  return (
    <div className="card p-6">
      <p className="label mb-3">Proposta de frete</p>
      <p className="text-lg">{carrier} · {formatBRL(priceCents)}</p>
      <p className="text-sm text-muted">Prazo estimado: {deadlineDays} dias úteis{validUntil && ` · válida até ${new Date(validUntil).toLocaleDateString("pt-BR")}`}</p>
      {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
      <div className="mt-5 flex gap-3">
        <Button disabled={pending} onClick={() => respond(true)}>Aceitar e seguir para pagamento</Button>
        <Button variant="ghost" disabled={pending} onClick={() => { if (confirm("Recusar a cotação cancela o pedido. Confirmar?")) respond(false); }}>Recusar</Button>
      </div>
    </div>
  );
}

type PaymentView = { method: string; status: string; pixQrCode?: string | null; pixQrCodeUrl?: string | null; boletoUrl?: string | null; boletoLine?: string | null; dueAt?: string | null; failureReason?: string | null };

export function PaymentPanel({ orderId, enabled, configured, cardReady, existing }: { orderId: string; enabled: string[]; configured: boolean; cardReady: boolean; existing: PaymentView | null }) {
  const [method, setMethod] = useState(enabled[0] ?? "PIX");
  const [payment, setPayment] = useState<PaymentView | null>(existing);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const LABEL: Record<string, string> = { PIX: "Pix", BOLETO: "Boleto bancário", CREDIT_CARD: "Cartão de crédito" };

  if (!configured) {
    return <Notice tone="warning" title="Pagamento online ainda não ativado">A integração com o provedor de pagamento está em homologação. Seu pedido está registrado; nossa equipe comercial entrará em contato para concluir o pagamento.</Notice>;
  }
  if (payment && payment.status === "PENDING") {
    return (
      <div className="card space-y-4 p-6">
        <p className="label">{LABEL[payment.method]} · aguardando pagamento</p>
        {payment.pixQrCodeUrl && <img src={payment.pixQrCodeUrl} alt="QR Code Pix" className="h-48 w-48" />}
        {payment.pixQrCode && <CopyField label="Pix copia e cola" value={payment.pixQrCode} />}
        {payment.boletoLine && <CopyField label="Linha digitável" value={payment.boletoLine} />}
        {payment.boletoUrl && <a className="link text-sm" href={payment.boletoUrl} target="_blank" rel="noopener">Abrir boleto (PDF)</a>}
        {payment.dueAt && <p className="text-xs text-muted">Vencimento: {new Date(payment.dueAt).toLocaleString("pt-BR")}</p>}
        <p className="text-xs text-muted">A confirmação é automática quando o provedor notificar o pagamento. Atualize esta página para acompanhar.</p>
      </div>
    );
  }
  return (
    <div className="card p-6">
      <p className="label mb-4">Forma de pagamento</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {enabled.map((m) => (
          <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
            className={`rounded border px-4 py-3 text-sm ${method === m ? "border-ink" : "border-line hover:border-ink/40"}`}>{LABEL[m]}</button>
        ))}
      </div>
      {method === "CREDIT_CARD" && !cardReady && <div className="mt-4"><Notice tone="warning">Pagamento com cartão em homologação (tokenização segura do provedor pendente).</Notice></div>}
      {payment?.status === "FAILED" && <div className="mt-4"><Notice tone="danger">{payment.failureReason ?? "Pagamento não aprovado."} Tente novamente ou escolha outra forma.</Notice></div>}
      {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
      <Button className="mt-5 w-full" disabled={pending || (method === "CREDIT_CARD" && !cardReady)} onClick={() => start(async () => {
        setError(null);
        const r = await api<PaymentView>(`/api/orders/${orderId}/pay`, { method: "POST", body: { method, installments: 1 } });
        r.ok ? setPayment(r.data) : setError(r.error.message);
      })}>{pending ? "Gerando cobrança…" : `Pagar com ${LABEL[method]}`}</Button>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="label mb-2">{label}</p>
      <div className="flex gap-2">
        <input readOnly value={value} className="h-11 flex-1 truncate rounded border border-line bg-canvas px-3 text-xs" aria-label={label} />
        <Button variant="secondary" className="h-11" onClick={() => { navigator.clipboard.writeText(value); setCopied(true); }}>{copied ? "Copiado" : "Copiar"}</Button>
      </div>
    </div>
  );
}
