import { z } from "zod";
import { route, parseBody } from "@/lib/route";
import { clientIp } from "@/lib/request";
import { previewCnpj } from "@/modules/companies/register";

/** POST /api/auth/cnpj — valida e consulta CNPJ para pré-preenchimento. */
export const POST = route(async (req) => {
  const { cnpj } = await parseBody(req, z.object({ cnpj: z.string().max(20) }));
  return previewCnpj(cnpj, await clientIp());
});
