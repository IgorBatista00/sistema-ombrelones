import { route } from "@/lib/route";
import { getViewer } from "@/modules/auth/session";
import { listProducts } from "@/modules/catalog/queries";

/** GET /api/products?q=&category=&page= — preço SÓ é incluído para empresa validada. */
export const GET = route(async (req) => {
  const u = new URL(req.url);
  const v = await getViewer();
  return listProducts({ q: u.searchParams.get("q") ?? undefined, category: u.searchParams.get("category") ?? undefined, page: Number(u.searchParams.get("page") ?? 1) || 1 }, v.canSeePrices);
});
