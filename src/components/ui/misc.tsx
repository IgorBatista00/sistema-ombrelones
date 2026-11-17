import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger"; children: ReactNode }) {
  const t = { neutral: "text-muted border-line", success: "text-success border-success/30", warning: "text-warning border-warning/30", danger: "text-danger border-danger/30" }[tone];
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] tracking-wide", t)}>{children}</span>;
}

export function Notice({ tone = "neutral", title, children }: { tone?: "neutral" | "warning" | "danger" | "success"; title?: string; children: ReactNode }) {
  const t = { neutral: "border-line", warning: "border-warning/40 bg-warning/5", danger: "border-danger/40 bg-danger/5", success: "border-success/40 bg-success/5" }[tone];
  return (
    <div role="status" className={cn("rounded-lg border p-4 text-sm", t)}>
      {title && <p className="mb-1 font-medium">{title}</p>}
      <div className="text-muted">{children}</div>
    </div>
  );
}

/** Espaço reservado para fotografia ainda não fornecida (nunca imagem genérica). */
export function ImagePlaceholder({ label, className, icon = true }: { label: string; className?: string; icon?: boolean }) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center bg-[#ece8e1] text-muted", className)} aria-label={label} role="img">
      {icon && <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
        <path d="M4 18 Q20 4 36 18 Z" /><path d="M20 11v25M14 36h12" />
      </svg>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4 md:mb-10">
      <div>
        {eyebrow && <p className="label mb-3">{eyebrow}</p>}
        <h2 className="text-3xl md:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
