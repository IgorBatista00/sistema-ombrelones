import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { normalizeCnpj } from "@/modules/companies/cnpj";
import { PageHead } from "@/components/admin/ui";
import { SuppliersTable } from "@/components/admin/suppliers-table";

export default async function Suppliers({ searchParams }: { searchParams: Promise<{ q?: string; inativos?: string }> }) {
  await requireAdminPage("PRODUCTS");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const digits = q ? normalizeCnpj(q) : "";
  const suppliers = await db.supplier.findMany({
    where: {
      ...(sp.inativos ? {} : { isActive: true }),
      ...(q ? { OR: [
        { legalName: { contains: q, mode: "insensitive" } }, { tradeName: { contains: q, mode: "insensitive" } },
        { contact: { contains: q, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ cnpj: { contains: digits } }] : []),
      ] } : {}),
    },
    include: { _count: { select: { products: true } } },
    orderBy: { legalName: "asc" },
  });
  return (
    <>
      <PageHead title="Fornecedores" subtitle={`${suppliers.length} fornecedores · uso interno`} />
      <SuppliersTable q={q ?? ""} showInactive={!!sp.inativos} rows={suppliers.map((s) => ({ id: s.id, legalName: s.legalName, tradeName: s.tradeName, cnpj: s.cnpj, contact: s.contact, phone: s.phone, email: s.email, notes: s.notes, isActive: s.isActive, products: s._count.products }))} />
    </>
  );
}
