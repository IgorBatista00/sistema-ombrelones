import "server-only";
import { db } from "@/lib/db";

/** Listas de apoio do formulário (categorias, fornecedores ativos, tabela de custos). */
export async function getProductFormOptions() {
  const [categories, suppliers, costItems] = await Promise.all([
    db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.supplier.findMany({ where: { isActive: true }, orderBy: { legalName: "asc" }, select: { id: true, legalName: true, tradeName: true, cnpj: true, contact: true, phone: true, email: true } }),
    db.costItem.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { label: "asc" }], select: { id: true, label: true, unit: true, priceCents: true, category: true } }),
  ]);
  return { categories, suppliers, costItems };
}
