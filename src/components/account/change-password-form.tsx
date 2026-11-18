"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeOwnPasswordAction } from "@/modules/admin/user-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";

export function ChangePasswordForm({ first }: { first: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form className="space-y-6" onSubmit={(e) => {
      e.preventDefault(); setError(null);
      const fd = new FormData(e.currentTarget);
      const input = { current: String(fd.get("current") ?? ""), password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") };
      start(async () => { const r = await changeOwnPasswordAction(input); if (!r.ok) return setError(r.error); router.push(r.data.next); router.refresh(); });
    }}>
      <Field label={first ? "Senha provisória (a que você recebeu)" : "Senha atual"} htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="Nova senha" htmlFor="password" hint="Mínimo de 10 caracteres, com letras e números."><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
      <Field label="Repita a nova senha" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Salvando…" : "Salvar nova senha"}</Button>
    </form>
  );
}
