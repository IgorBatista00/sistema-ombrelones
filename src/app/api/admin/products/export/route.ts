import { route } from "@/lib/route";
import { requireAdmin } from "@/modules/auth/session";
import { listAdminProducts, type AdminProductFilters } from "@/modules/products/admin-queries";
import { buildExport } from "@/modules/products/excel";

/** GET /api/admin/products/export?<mesmos filtros da lista> → produtos-AAAA-MM-DD.xlsx */
export const GET = route(async (req) => {
  await requireAdmin("PRODUCTS");
  const sp = Object.fromEntries(new URL(req.url).searchParams) as AdminProductFilters;
  const buf = await buildExport(await listAdminProducts(sp));
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return new Response(new Uint8Array(buf), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="produtos-${date}.xlsx"`, "Cache-Control": "no-store",
  } });
});
