import type { Metadata } from "next";
import { AuthShell } from "@/components/account/auth-shell";
import { ResendVerification } from "@/components/account/simple-forms";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { consumeToken } from "@/modules/auth/tokens";
import { activateAfterEmailVerification } from "@/modules/companies/register";
import { getViewer } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = { title: "Verificação de e-mail", robots: { index: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; enviado?: string; analise?: string }> }) {
  const sp = await searchParams;

  if (sp.token) {
    try {
      const userId = await consumeToken(sp.token, "EMAIL_VERIFICATION");
      await activateAfterEmailVerification(userId);
      const company = (await db.companyMember.findFirst({ where: { userId }, include: { company: true } }))?.company;
      const review = company?.status === "UNDER_REVIEW";
      return (
        <AuthShell title={review ? "E-mail confirmado" : "Cadastro liberado"}>
          {review
            ? <Notice tone="warning" title="Cadastro em análise">Seu e-mail foi confirmado. Para sua segurança, o cadastro passará por uma verificação adicional da nossa equipe. Avisaremos por e-mail.</Notice>
            : <Notice tone="success">Seu e-mail foi confirmado e os preços para empresas estão liberados.</Notice>}
          <ButtonLink href="/produtos" className="mt-8 w-full">Ver produtos</ButtonLink>
        </AuthShell>
      );
    } catch (e) {
      return <AuthShell title="Link inválido"><Notice tone="danger">{e instanceof AppError ? e.message : "Não foi possível verificar."}</Notice><div className="mt-6"><ResendVerification /></div></AuthShell>;
    }
  }

  const viewer = await getViewer();
  return (
    <AuthShell title="Confirme seu e-mail" intro={<>Enviamos um link para <strong className="text-ink">{viewer.user?.email ?? "seu e-mail"}</strong>. Após a confirmação, os preços de atacado são liberados automaticamente.</>}>
      {sp.analise && <div className="mb-6"><Notice tone="warning">Após confirmar o e-mail, seu cadastro passará por uma verificação adicional.</Notice></div>}
      {viewer.user && !viewer.user.emailVerified && <ResendVerification />}
    </AuthShell>
  );
}
