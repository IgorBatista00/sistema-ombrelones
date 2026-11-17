import { route } from "@/lib/route";
import { processPaymentWebhook } from "@/modules/orders/service";

/** POST /api/webhooks/payments/:provider — autenticado e idempotente. */
export const POST = route<{ params: Promise<{ provider: string }> }>(async (req, { params }) =>
  processPaymentWebhook((await params).provider, req));
