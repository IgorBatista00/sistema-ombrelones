import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

const control = "w-full h-12 rounded border border-line bg-surface px-4 text-sm placeholder:text-muted/70 transition-colors focus:border-ink focus:outline-none aria-[invalid=true]:border-danger";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn(control, "appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%23706b63' stroke-width='1.5'%3E%3Cpath d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E\")" }} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "h-auto min-h-24 py-3", className)} {...p} />;
}
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="label block">{label}</label>
      {children}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
