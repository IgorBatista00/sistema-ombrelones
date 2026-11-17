import { route, parseBody } from "@/lib/route";
import { db } from "@/lib/db";
import { requireBuyer } from "@/modules/auth/session";
import { addressSchema } from "@/modules/companies/addresses";

export const POST = route(async (req) => {
  const ctx = await requireBuyer();
  const input = await parseBody(req, addressSchema);
  const count = await db.address.count({ where: { companyId: ctx.company.id } });
  return db.address.create({ data: { ...input, companyId: ctx.company.id, isDefault: count === 0 } });
});
