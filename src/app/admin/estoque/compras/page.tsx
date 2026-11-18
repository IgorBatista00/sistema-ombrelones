import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { PageHead } from "@/components/admin/ui";

export default async function Purchases() {
  await requireAdminPage("STOCK");
  const purchases = await db.purchase.findMany({ orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }], take: 100, include: { items: true } });
  const sup = await db.supplier.findMany({ where: { id: { in: [...new Set(purchases.map((p) => p.supplierId))] } }, select: { id: true, legalName: true, tradeName: true } });
  return (
    <>
      <PageHead title="Compras" subtitle="Notas de entrada lançadas no estoque" action={<Link href="/admin/estoque/compras/nova" className="inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink">Registrar compra</Link>} />
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Emissão", "Nota", "Fornecedor", "Itens", "Unidades", "Frete + despesas", "Total"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{purchases.map((p) => { const s = sup.find((x) => x.id === p.supplierId); return (
            <tr key={p.id}><td className="px-4 py-2">{p.issuedAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td className="px-4 py-2">{p.invoiceNumber}</td><td className="px-4 py-2">{s?.tradeName ?? s?.legalName ?? "—"}</td><td className="px-4 py-2">{p.items.length}</td><td className="px-4 py-2">{p.items.reduce((a, i) => a + i.quantity, 0)}</td><td className="px-4 py-2">{formatBRL(p.freightCents + p.otherCents)}</td><td className="px-4 py-2 font-medium">{formatBRL(p.totalCents)}</td></tr>); })}</tbody>
        </table>
        {purchases.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhuma compra lançada.</p>}
      </div>
    </>
  );
}
