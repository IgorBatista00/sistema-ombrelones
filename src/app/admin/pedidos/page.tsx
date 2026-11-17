import { parseDocNumber } from "@/lib/doc-code";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { LABELS } from "@/modules/orders/state";
import { StatusBadge } from "@/components/account/status";
import { PageHead, Table, Td } from "@/components/admin/ui";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type SP = { q?: string; comercial?: string; financeiro?: string; logistico?: string; fiscal?: string; pagina?: string };

export default async function OrdersAdmin({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin("ORDERS");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const where: Prisma.OrderWhereInput = {};
  if (sp.q) {
    const n = parseDocNumber(sp.q);
    const digits = sp.q.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    where.OR = [
      ...(n ? [{ number: n }] : []),
      { code: { contains: sp.q.trim().toUpperCase() } },
      { company: { legalName: { contains: sp.q, mode: "insensitive" } } },
      { company: { tradeName: { contains: sp.q, mode: "insensitive" } } },
      ...(digits.length >= 4 ? [{ company: { cnpj: { contains: digits } } }] : []),
    ];
  }
  if (sp.comercial && sp.comercial in LABELS.COMMERCIAL) where.commercialStatus = sp.comercial as never;
  if (sp.financeiro && sp.financeiro in LABELS.FINANCIAL) where.financialStatus = sp.financeiro as never;
  if (sp.logistico && sp.logistico in LABELS.LOGISTIC) where.logisticStatus = sp.logistico as never;
  if (sp.fiscal && sp.fiscal in LABELS.FISCAL) where.fiscalStatus = sp.fiscal as never;

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { company: { select: { legalName: true, tradeName: true } }, _count: { select: { items: true } } } }),
  ]);

  const filter = (name: keyof SP, dim: keyof typeof LABELS, label: string) => (
    <Select name={name} defaultValue={sp[name] ?? ""} className="h-10" aria-label={label}>
      <option value="">{label}: todos</option>
      {Object.entries(LABELS[dim]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </Select>
  );

  return (
    <>
      <PageHead title="Pedidos" subtitle={`${total} pedidos`} />
      <form className="mb-6 grid gap-3 md:grid-cols-6">
        <Input name="q" defaultValue={sp.q} placeholder="Nº, empresa ou CNPJ" className="h-10 md:col-span-2" aria-label="Buscar" />
        {filter("comercial", "COMMERCIAL", "Comercial")}
        {filter("financeiro", "FINANCIAL", "Financeiro")}
        {filter("logistico", "LOGISTIC", "Logístico")}
        <Button type="submit" className="h-10">Filtrar</Button>
      </form>
      <Table head={["Nº", "Data", "Empresa", "Itens", "Total", "Comercial", "Financeiro", "Logístico", "Fiscal"]} empty={orders.length === 0}>
        {orders.map((o) => (
          <tr key={o.id} className="hover:bg-ink/[0.02]">
            <Td><Link href={`/admin/pedidos/${o.id}`} className="link">{o.code}</Link></Td>
            <Td>{o.createdAt.toLocaleDateString("pt-BR")}</Td>
            <Td className="max-w-56 truncate">{o.company.tradeName ?? o.company.legalName}</Td>
            <Td>{o._count.items}</Td>
            <Td>{o.totalCents != null ? formatBRL(o.totalCents) : `${formatBRL(o.subtotalCents)} + frete`}</Td>
            <Td><StatusBadge dim="COMMERCIAL" value={o.commercialStatus} /></Td>
            <Td><StatusBadge dim="FINANCIAL" value={o.financialStatus} /></Td>
            <Td><StatusBadge dim="LOGISTIC" value={o.logisticStatus} /></Td>
            <Td><StatusBadge dim="FISCAL" value={o.fiscalStatus} /></Td>
          </tr>
        ))}
      </Table>
      {total > 30 && (
        <div className="mt-4 flex gap-2 text-sm">
          {page > 1 && <Link className="link" href={`?${new URLSearchParams({ ...sp, pagina: String(page - 1) } as Record<string, string>)}`}>Anterior</Link>}
          {page * 30 < total && <Link className="link" href={`?${new URLSearchParams({ ...sp, pagina: String(page + 1) } as Record<string, string>)}`}>Próxima</Link>}
        </div>
      )}
    </>
  );
}
