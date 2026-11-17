import { toErrorResponse } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { buildClientTemplate } from "@/modules/clients/service";

/** GET — modelo de planilha para importar clientes. */
export async function GET() {
  try {
    await requireAdmin("CUSTOMERS");
    const buf = await buildClientTemplate();
    return new Response(new Uint8Array(buf), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-importacao-clientes.xlsx"', "Cache-Control": "private, no-store",
    } });
  } catch (e) { return toErrorResponse(e); }
}
