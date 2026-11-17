"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, MenuIcon, SearchIcon } from "@/components/ui/icons";

export function MobileNav({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; }, [open]);
  return (
    <>
      <button className="-ml-2 flex h-10 w-10 items-center justify-center lg:hidden" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <MenuIcon />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-canvas fade-in lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="container flex h-16 items-center justify-end">
            <button className="flex h-10 w-10 items-center justify-center" aria-label="Fechar menu" onClick={() => setOpen(false)}><CloseIcon /></button>
          </div>
          <nav className="container mt-6 flex flex-col">
            {items.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="border-b border-line py-5 font-display text-3xl">{n.label}</Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}

export function SearchToggle() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  return (
    <>
      <button className="flex h-10 w-10 items-center justify-center rounded hover:bg-ink/5" aria-label="Buscar" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <SearchIcon />
      </button>
      {open && (
        <form
          role="search"
          className="absolute inset-x-0 top-full border-b border-line bg-canvas py-4 fade-in"
          onSubmit={(e) => { e.preventDefault(); const q = ref.current?.value.trim(); setOpen(false); router.push(q ? `/produtos?q=${encodeURIComponent(q)}` : "/produtos"); }}
        >
          <div className="container flex items-center gap-3">
            <SearchIcon className="text-muted" />
            <input ref={ref} name="q" placeholder="Buscar por nome ou SKU" className="h-10 flex-1 bg-transparent text-base outline-none placeholder:text-muted" aria-label="Buscar por nome ou SKU" onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
          </div>
        </form>
      )}
    </>
  );
}
