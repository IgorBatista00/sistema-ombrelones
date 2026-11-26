import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer, requireAdminPage } from "@/modules/auth/session";
import { homeFor } from "@/modules/admin/menu";
import { getDashboardMetrics } from "@/modules/admin/metrics";
import { financeDashboard } from "@/modules/finance/queries";
import { formatBRL } from "@/lib/money";
import { PageHead, Stat, Table, Td } from "@/components/admin/ui";
import { operationResult, resultFilterSchema } from "@/modules/finance/operation-result";
import { OperationResult } from "@/components/admin/operation-result";

const RANGES = { "7": "7 dias", "30": "30 dias", "90": "90 dias" } as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ dias?: string; rde?: string; rate?: string }> }) {
  const v = await getViewer();
  if (v.admin && !v.admin.permissions.includes("DASHBOARD")) redirect(homeFor(v.admin.permissions)); // quem não tem Dashboard cai na primeira área liberada
  const { admin } = await requireAdminPage("DASHBOARD");
  const canFinance = admin.permissions.includes("FINANCE"); // valores financeiros só para quem tem acesso ao Financeiro
  const sp = await searchParams;
  const dias = sp.dias ?? "30";
  const days = dias in RANGES ? Number(dias) : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const [m, fin, res] = await Promise.all([getDashboardMetrics(from, to), canFinance ? financeDashboard(from, to) : null, canFinance ? operationResult(resultFilterSchema.parse(sp)) : null]);
  const d = (x: Date | null) => (x ? x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

  return (
    <>
      <PageHead title="Dashboard" subtitle={`Últimos ${days} dias · faturamento considera apenas pedidos com pagamento confirmado`}
        action={<div className="flex gap-1 text-sm">{Object.entries(RANGES).map(([k, l]) => <Link key={k} href={`/admin?dias=${k}${sp.rde ? `&rde=${sp.rde}` : ""}${sp.rate ? `&rate=${sp.rate}` : ""}`} className={`rounded px-3 py-1.5 ${String(days) === k ? "bg-ink text-canvas" : "hover:bg-ink/5"}`}>{l}</Link>)}</div>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Faturamento (pago)" value={formatBRL(m.revenueCents)} />
        <Stat label="Ticket médio" value={formatBRL(m.avgTicketCents)} hint="Sobre pedidos pagos" />
        <Stat label="Pedidos" value={m.orders.created} hint={`${m.orders.paid} pagos · ${m.orders.canceled} cancelados · ${m.orders.invoiced} faturados`} />
        <Stat label="Clientes ativos" value={m.customers.ACTIVE ?? 0} hint={`${m.customers.UNDER_REVIEW ?? 0} em análise · ${m.customers.PENDING_EMAIL ?? 0} sem e-mail confirmado`} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Link href="/admin/pedidos?financeiro=AWAITING_PAYMENT"><Stat label="Aguardando pagamento" value={m.awaitingPayment} /></Link>
        <Link href="/admin/logistica"><Stat label="Cotações de frete pendentes" value={m.quoteRequests} /></Link>
        <Link href="/admin/pedidos?logistico=NOT_RELEASED&financeiro=PAID"><Stat label="Aguardando expedição" value={m.awaitingShipment} /></Link>
      </div>
      {res && <OperationResult r={res} keep={{ dias: sp.dias }} />}
      {fin && (
        <section aria-labelledby="dash-fin" className="mt-10">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="dash-fin" className="label">Financeiro · contas a receber</h2>
            <Link href="/admin/financeiro?aba=receber" className="link text-xs">Abrir contas a receber</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link href="/admin/financeiro?aba=receber&situacao=abertas" data-dash="aberto"><Stat label="A receber (em aberto)" value={formatBRL(fin.open.cents)}
              hint={`${fin.open.count} parcela(s) · ${formatBRL(fin.next7.cents)} vencem nos próximos 7 dias${fin.undefinedDue.count ? ` · ${formatBRL(fin.undefinedDue.cents)} sem vencimento definido` : ""}`} /></Link>
            <Link href="/admin/financeiro?aba=receber&situacao=atrasado" data-dash="atraso" className={fin.overdue.cents > 0 ? "[&_.card]:border-danger/40 [&_.card]:bg-danger/[0.04] [&_.card_p:nth-child(2)]:text-danger" : ""}>
              <Stat label="Em atraso" value={formatBRL(fin.overdue.cents)} hint={fin.overdue.count ? `${fin.overdue.count} parcela(s) vencida(s) e não recebida(s)` : "Nenhuma parcela vencida"} /></Link>
            <Link href="/admin/financeiro?aba=receber&situacao=recebido" data-dash="recebido"><Stat label={`Recebido (últimos ${days} dias)`} value={formatBRL(fin.received.cents)}
              hint={`${formatBRL(fin.received.parcels)} de vendas (${fin.received.parcelsCount} parcela(s))${fin.received.othersCount ? ` + ${formatBRL(fin.received.others)} de outras receitas` : ""}`} /></Link>
          </div>
          {fin.upcoming.length > 0 && (
            <div className="mt-4">
              <Table head={["Vencimento", "Pedido", "Cliente", "Parcela", "Valor", ""]}>
                {fin.upcoming.map((r) => (
                  <tr key={r.id}>
                    <Td className={r.late ? "font-medium text-danger" : ""}>{d(r.dueDate)}{r.late && " · atrasada"}</Td>
                    <Td>{r.sale.code}</Td><Td className="max-w-64 truncate">{r.sale.clientName}</Td><Td className="text-xs">{r.label}</Td><Td>{formatBRL(r.amountCents)}</Td>
                    <Td className="text-right"><Link className="link text-xs" href={`/admin/financeiro/venda/${r.sale.id}`}>Ver venda</Link></Td>
                  </tr>
                ))}
              </Table>
              <p className="mt-2 text-xs text-muted">Parcelas atrasadas e as que vencem nos próximos 7 dias (até 8). Pedidos pagos pelo site estão em “Faturamento”, acima.</p>
            </div>
          )}
        </section>
      )}
      <h2 className="label mb-3 mt-10">Produtos mais vendidos (pagos)</h2>
      <Table head={["SKU", "Produto", "Quantidade", "Valor"]} empty={m.topProducts.length === 0}>
        {m.topProducts.map((p) => <tr key={p.sku}><Td>{p.sku}</Td><Td>{p.name}</Td><Td>{p.quantity}</Td><Td>{formatBRL(p.totalCents)}</Td></tr>)}
      </Table>
    </>
  );
}
