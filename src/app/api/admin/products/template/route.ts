import { route } from "@/lib/route";
import { requireAdmin } from "@/modules/auth/session";
import { buildTemplate } from "@/modules/products/excel";

export const GET = route(async () => {
  await requireAdmin("PRODUCTS");
  return new Response(new Uint8Array(await buildTemplate()), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="modelo-produtos.xlsx"',
  } });
});
