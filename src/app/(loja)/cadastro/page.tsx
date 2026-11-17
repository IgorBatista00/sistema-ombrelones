import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/modules/auth/session";
import { AuthShell } from "@/components/account/auth-shell";
import { RegisterForm } from "@/components/account/register-form";

export const metadata: Metadata = { title: "Cadastrar empresa", robots: { index: false } };

export default async function RegisterPage() {
  if ((await getViewer()).user) redirect("/minha-conta");
  return (
    <AuthShell eyebrow="Cadastro empresarial" title="Cadastre sua empresa" intro="Informe o CNPJ para liberar os preços exclusivos para lojistas. Sem pedido mínimo.">
      <RegisterForm />
    </AuthShell>
  );
}
