import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/account/auth-shell";
import { LoginForm } from "@/components/account/simple-forms";
import { Notice } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redefinida?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell eyebrow="Área do cliente" title="Entrar">
      {sp.redefinida && <div className="mb-6"><Notice tone="success">Senha redefinida. Entre com a nova senha.</Notice></div>}
      <Suspense><LoginForm /></Suspense>
    </AuthShell>
  );
}
