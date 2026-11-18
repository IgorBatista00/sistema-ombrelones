import { route } from "@/lib/route";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { getViewer } from "@/modules/auth/session";
import { issueToken } from "@/modules/auth/tokens";
import { sendEmail } from "@/modules/integrations/email";
import { appUrl } from "@/lib/app-url";

export const POST = route(async () => {
  const v = await getViewer();
  if (!v.user) throw new AppError("UNAUTHENTICATED", "Faça login.", 401);
  if (v.user.emailVerified) return { already: true };
  await rateLimit(`resend:${v.user.id}`, 3, 3600);
  const token = await issueToken(v.user.id, "EMAIL_VERIFICATION");
  await sendEmail(v.user.email, { kind: "verify-email", name: v.user.name, url: `${appUrl()}/verificar-email?token=${token}` });
  return { sent: true };
});
