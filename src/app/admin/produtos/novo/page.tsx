import { requireAdmin } from "@/modules/auth/session";
import { getProductFormOptions } from "@/modules/products/form-data";
import { EMPTY_FORM, ProductForm } from "@/components/admin/product-form";

export default async function NewProduct() {
  await requireAdmin("PRODUCTS");
  const opts = await getProductFormOptions();
  return <ProductForm mode="new" draftKey="b2b:product-draft:new" initial={EMPTY_FORM} wholesalePriceCents={null} {...opts} />;
}
