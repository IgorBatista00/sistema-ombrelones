import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { proposeQuoteAction } from "@/modules/admin/actions";
import { ActionForm } from "@/components/admin/action-form";
import { PageHead } from "@/components/admin/ui";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";

export default async function Logistics() {
  await requireAdminPage("LOGISTICS");
  const quotes = await db.shippingQuote.findMany({
    where: { status: { in: ["REQUESTED", "PROPOSED"] }, order: { commercialStatus: "AWAITING_QUOTE" } },
    include: { order: { include: { company: true, items: { select: { packagesSnapshot: true, quantity: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const tomorrow = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <PageHead title="Logística" subtitle="Solicitações de cotação manual de frete" />
      {quotes.length === 0 && <p className="card p-8 text-center text-sm text-muted">Nenhuma cotação pendente.</p>}
      <div className="space-y-4">
        {quotes.map((q) => {
          const o = q.order;
          const addr = o.addressSnapshot as Record<string, string>;
          type Pkg = { lengthMm: number; widthMm: number; heightMm: number; weightG: number; quantity: number };
          const vols = o.items.flatMap((i) => (i.packagesSnapshot as Pkg[]).map((p) => ({ ...p, quantity: p.quantity * i.quantity })));
          const weight = vols.reduce((a, v) => a + v.weightG * v.quantity, 0);
          return (
            <div key={q.id} className="card grid gap-6 p-5 lg:grid-cols-[1fr_1.4fr]">
              <div className="text-sm">
                <div className="flex items-center gap-2"><Link href={`/admin/pedidos/${o.id}`} className="link font-medium">Pedido nº {o.code}</Link><Badge tone={q.status === "PROPOSED" ? "success" : "warning"}>{q.status === "PROPOSED" ? "Proposta enviada" : "Aguardando proposta"}</Badge></div>
                <p className="mt-2">{o.company.tradeName ?? o.company.legalName}</p>
                <p className="text-muted">Destino: {addr.city}/{addr.state} · CEP {addr.zipCode}</p>
                <p className="text-muted">Mercadoria: {formatBRL(o.subtotalCents)} · {vols.reduce((a, v) => a + v.quantity, 0)} volumes · {(weight / 1000).toLocaleString("pt-BR")} kg</p>
                <ul className="mt-2 text-xs text-muted">{vols.map((v, i) => <li key={i}>{v.quantity}× {v.lengthMm / 10}×{v.widthMm / 10}×{v.heightMm / 10} cm · {(v.weightG / 1000).toLocaleString("pt-BR")} kg</li>)}</ul>
                {q.status === "PROPOSED" && <p className="mt-3">Proposta: {q.carrierName} · {formatBRL(q.priceCents ?? 0)} · {q.deadlineDays} dias · aguardando aceite do cliente</p>}
              </div>
              <ActionForm action={proposeQuoteAction} submit={q.status === "PROPOSED" ? "Reenviar proposta" : "Enviar proposta ao cliente"} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="orderId" value={o.id} />
                <Input name="carrierName" placeholder="Transportadora" required className="h-10" defaultValue={q.carrierName ?? ""} />
                <Input name="price" placeholder="Valor do frete (R$)" inputMode="decimal" required className="h-10" />
                <Input name="deadlineDays" type="number" min={1} placeholder="Prazo (dias úteis)" required className="h-10" />
                <label className="text-xs text-muted">Válida até<Input name="validUntil" type="date" required defaultValue={tomorrow} className="mt-1 h-10" /></label>
                <Input name="notes" placeholder="Observações ao cliente (opcional)" className="h-10 sm:col-span-2" />
              </ActionForm>
            </div>
          );
        })}
      </div>
    </>
  );
}
