"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { formatCnpj, isValidCnpj } from "@/modules/companies/cnpj";

type Preview = { cnpj: string; legalName: string; tradeName: string | null; city?: string; state?: string };

/** Cadastro em 2 passos: 1) CNPJ → consulta  2) dados do responsável. */
export function RegisterForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [cnpj, setCnpj] = useState("");
  const [company, setCompany] = useState<Preview | null>(null);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const lookup = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidCnpj(cnpj)) return setError({ message: "CNPJ inválido. Confira os números." });
    start(async () => {
      const r = await api<Preview>("/api/auth/cnpj", { method: "POST", body: { cnpj } });
      if (r.ok) { setCompany(r.data); setStep(2); } else setError(r.error);
    });
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null); setFieldErrors({});
    start(async () => {
      const r = await api<{ needsReview: boolean }>("/api/auth/register", {
        method: "POST",
        body: { cnpj: company!.cnpj, name: f.get("name"), email: f.get("email"), phone: f.get("phone"), password: f.get("password"), acceptTerms: f.get("acceptTerms") === "on" },
      });
      if (r.ok) router.push(`/verificar-email?enviado=1${r.data.needsReview ? "&analise=1" : ""}`);
      else { setError(r.error); setFieldErrors((r.error.details as Record<string, string[]>) ?? {}); }
    });
  };

  if (step === 1) {
    return (
      <form onSubmit={lookup} className="space-y-6" noValidate>
        <Field label="CNPJ da empresa" htmlFor="cnpj" hint="Consultamos a Receita Federal para preencher os dados automaticamente.">
          <Input id="cnpj" name="cnpj" autoComplete="off" inputMode="text" placeholder="00.000.000/0000-00" value={cnpj}
            onChange={(e) => setCnpj(e.target.value.toUpperCase())} onBlur={() => setCnpj((c) => formatCnpj(c))} aria-invalid={!!error} required />
        </Field>
        {error && <ErrorNotice error={error} />}
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Consultando…" : "Continuar"}</Button>
        <p className="text-center text-sm text-muted">Já tem cadastro? <Link href="/entrar" className="link text-ink">Entrar</Link></p>
      </form>
    );
  }

  const fe = (k: string) => fieldErrors[k]?.[0];
  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="card p-5">
        <p className="label mb-2">Empresa</p>
        <p className="font-medium">{company!.legalName}</p>
        {company!.tradeName && <p className="text-sm text-muted">{company!.tradeName}</p>}
        <p className="mt-1 text-xs text-muted">CNPJ {formatCnpj(company!.cnpj)}{company!.city && ` · ${company!.city}/${company!.state}`}</p>
        <button type="button" className="link mt-3 text-xs" onClick={() => { setStep(1); setCompany(null); }}>Alterar CNPJ</button>
      </div>
      <Field label="Nome do responsável" htmlFor="name" error={fe("name")}><Input id="name" name="name" autoComplete="name" required /></Field>
      <Field label="E-mail" htmlFor="email" error={fe("email")} hint="Preferencialmente o e-mail corporativo."><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Telefone / WhatsApp" htmlFor="phone" error={fe("phone")}><Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(00) 00000-0000" required /></Field>
      <Field label="Senha" htmlFor="password" error={fe("password")} hint="Mínimo de 10 caracteres, com letras e números."><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" name="acceptTerms" className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" required />
        <span>Declaro que represento esta empresa e aceito os <Link href="/institucional/termos-comerciais" className="link text-ink" target="_blank">termos comerciais</Link> e a <Link href="/institucional/politica-de-privacidade" className="link text-ink" target="_blank">política de privacidade</Link>.</span>
      </label>
      {error && <ErrorNotice error={error} />}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Criando conta…" : "Criar conta"}</Button>
    </form>
  );
}

function ErrorNotice({ error }: { error: { code?: string; message: string } }) {
  if (error.code === "CNPJ_ALREADY_REGISTERED") {
    return <Notice tone="warning" title="CNPJ já cadastrado">{error.message} <Link href="/entrar" className="link text-ink">Entrar</Link> · <Link href="/recuperar-senha" className="link text-ink">Recuperar acesso</Link></Notice>;
  }
  if (error.code === "INTEGRATION_NOT_CONFIGURED") {
    return <Notice tone="warning" title="Cadastro temporariamente indisponível">A consulta automática de CNPJ ainda não está ativa. Fale com nosso comercial para concluir seu cadastro.</Notice>;
  }
  return <Notice tone="danger">{error.message}</Notice>;
}
