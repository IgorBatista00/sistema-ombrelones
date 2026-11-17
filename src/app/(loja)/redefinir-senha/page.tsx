import type { Metadata } from "next";
import { AuthShell } from "@/components/account/auth-shell";
import { ResetForm } from "@/components/account/simple-forms";
import { Notice } from "@/components/ui/misc";
export const metadata: Metadata = { title: "Nova senha", robots: { index: false } };
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthShell title="Criar nova senha">{token ? <ResetForm token={token} /> : <Notice tone="danger">Link inválido.</Notice>}</AuthShell>;
}
