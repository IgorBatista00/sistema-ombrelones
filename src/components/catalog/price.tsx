import Link from "next/link";
import { formatBRL } from "@/lib/money";
import { LockIcon } from "@/components/ui/icons";

/** Exibe preço B2B ou o convite ao cadastro. Recebe `null` quando bloqueado. */
export function Price({ cents, locked, size = "sm" }: { cents: number | null; locked: boolean; size?: "sm" | "lg" }) {
  if (locked) {
    return (
      <Link href="/cadastro" className="group inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <LockIcon width={14} height={14} />
        <span className="underline decoration-line underline-offset-4 group-hover:decoration-ink">Cadastre seu CNPJ para consultar os preços.</span>
      </Link>
    );
  }
  if (cents == null) return <span className="text-xs text-muted">Preço sob consulta</span>;
  return (
    <span className={size === "lg" ? "font-display text-3xl" : "text-base"}>
      {formatBRL(cents)}
      <span className="ml-1 text-xs text-muted">/ un.</span>
    </span>
  );
}
