"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function AdminNav({ items, horizontal }: { items: { href: string; label: string }[]; horizontal?: boolean }) {
  const path = usePathname();
  const active = (h: string) => (h === "/admin" ? path === h : path === h || path.startsWith(`${h}/`));
  return (
    <nav aria-label="Painel" className={horizontal ? "flex gap-1 overflow-x-auto px-3 py-2" : "flex flex-col gap-0.5 px-3"}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
          className={`whitespace-nowrap rounded px-3 py-2 text-sm transition-colors ${active(i.href) ? "bg-ink text-canvas" : "text-muted hover:bg-ink/5 hover:text-ink"}`}>{i.label}</Link>
      ))}
    </nav>
  );
}
