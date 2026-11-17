import { route } from "@/lib/route";
import { destroySession } from "@/modules/auth/session";
export const POST = route(async () => { await destroySession(); });
