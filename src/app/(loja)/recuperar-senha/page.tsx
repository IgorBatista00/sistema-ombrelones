import type { Metadata } from "next";
import { AuthShell } from "@/components/account/auth-shell";
import { ForgotForm } from "@/components/account/simple-forms";
export const metadata: Metadata = { title: "Recuperar acesso", robots: { index: false } };
export default function ForgotPage() {
  return <AuthShell title="Recuperar acesso" intro="Informe o e-mail cadastrado para receber o link de redefinição."><ForgotForm /></AuthShell>;
}
