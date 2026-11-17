"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const next = useSearchParams().get("next");
  return (
    <form className="space-y-6" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      start(async () => {
        const r = await api<{ admin: boolean }>("/api/auth/login", { method: "POST", body: { email: f.get("email"), password: f.get("password") } });
        if (!r.ok) return setError(r.error.message);
        const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
        router.push(safeNext ?? (r.data.admin ? "/admin" : "/produtos"));
        router.refresh();
      });
    }}>
      <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Senha" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</Button>
      <div className="flex justify-between text-sm">
        <Link href="/recuperar-senha" className="link">Esqueci minha senha</Link>
        <Link href="/cadastro" className="link">Cadastrar empresa</Link>
      </div>
    </form>
  );
}

export function ForgotForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <Notice tone="success" title="Verifique seu e-mail">Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha.</Notice>;
  return (
    <form className="space-y-6" onSubmit={(e) => {
      e.preventDefault();
      const email = new FormData(e.currentTarget).get("email");
      start(async () => { const r = await api("/api/auth/forgot", { method: "POST", body: { email } }); r.ok ? setDone(true) : setError(r.error.message); });
    }}>
      <Field label="E-mail cadastrado" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" className="w-full" disabled={pending}>Enviar link</Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form className="space-y-6" onSubmit={(e) => {
      e.preventDefault();
      const password = new FormData(e.currentTarget).get("password");
      start(async () => { const r = await api("/api/auth/reset", { method: "POST", body: { token, password } }); r.ok ? router.push("/entrar?redefinida=1") : setError(r.error.message); });
    }}>
      <Field label="Nova senha" htmlFor="password" hint="Mínimo de 10 caracteres, com letras e números."><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" className="w-full" disabled={pending}>Salvar nova senha</Button>
    </form>
  );
}

export function ResendVerification() {
  const [state, setState] = useState<"idle" | "sent" | string>("idle");
  const [pending, start] = useTransition();
  if (state === "sent") return <p className="text-sm text-success">Novo link enviado.</p>;
  return (
    <div>
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await api("/api/auth/resend", { method: "POST" }); setState(r.ok ? "sent" : r.error.message); })}>Reenviar e-mail</Button>
      {state !== "idle" && <p className="mt-2 text-sm text-danger">{state}</p>}
    </div>
  );
}
