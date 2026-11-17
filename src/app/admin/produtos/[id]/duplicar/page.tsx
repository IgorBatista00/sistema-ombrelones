import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/session";
import { getProductFormOptions } from "@/modules/products/form-data";
import { loadProductForm } from "@/modules/products/service";
import { ProductForm } from "@/components/admin/product-form";

export default async function DuplicateProduct({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("PRODUCTS");
  const { id } = await params;
  const [initial, opts] = await Promise.all([loadProductForm(id, true), getProductFormOptions()]);
  if (!initial) notFound();
  return <ProductForm mode="duplicate" draftKey={`b2b:product-draft:duplicate-${id}`} initial={initial} wholesalePriceCents={null} {...opts} />;
}
