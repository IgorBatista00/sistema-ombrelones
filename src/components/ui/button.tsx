import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost";
const styles: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90",
  secondary: "border border-ink/80 text-ink hover:bg-ink hover:text-canvas",
  ghost: "text-ink hover:bg-ink/5",
};
const base =
  "inline-flex items-center justify-center gap-2 rounded h-12 px-6 text-sm tracking-wide transition-colors duration-300 ease-soft disabled:opacity-40 disabled:pointer-events-none";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cn(base, styles[variant], className)} {...p} />;
}
export function ButtonLink({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(base, styles[variant], className)} {...p} />;
}
