import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/account/auth-shell";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { getViewer } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Trocar senha", robots: { index: false } };

export default async function ChangePasswordPage() {
  const v = await getViewer();
  if (!v.user) redirect("/entrar?next=/trocar-senha");
  const first = v.user.mustChangePassword;
  return (
    <AuthShell eyebrow={first ? "Primeiro acesso" : "Minha senha"} title={first ? "Crie a sua senha" : "Trocar senha"}
      intro={first ? "Você entrou com uma senha provisória. Para continuar, crie uma senha só sua." : "As outras sessões abertas com a senha antiga serão encerradas."}>
      <ChangePasswordForm first={first} />
    </AuthShell>
  );
}
