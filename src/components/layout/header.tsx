import Link from "next/link";
import { getViewer } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { BagIcon, UserIcon } from "@/components/ui/icons";
import { MobileNav, SearchToggle } from "./header-client";

export const NAV = [
  { href: "/", label: "Início" },
  { href: "/produtos", label: "Produtos" },
  { href: "/#sobre", label: "Sobre Nós" },
  { href: "/#contato", label: "Contato" },
];

export async function Header({ brandName }: { brandName: string }) {
  const viewer = await getViewer();
  const cartCount = viewer.user && viewer.company
    ? await db.cartItem.count({ where: { cart: { userId: viewer.user.id, companyId: viewer.company.id } } })
    : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
      <div className="container flex h-16 items-center gap-6 md:h-20">
        <MobileNav items={NAV} />
        {/* Logotipo provisório — substituir pelo definitivo */}
        <Link href="/" className="min-w-0 truncate whitespace-nowrap font-display text-base tracking-tight sm:text-lg md:text-xl" aria-label={`${brandName} — início`}>
          {brandName}
        </Link>
        <nav aria-label="Principal" className="ml-8 hidden gap-8 text-sm lg:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="text-muted transition-colors hover:text-ink">{n.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <SearchToggle />
          <Link href={viewer.user ? "/minha-conta" : "/entrar"} className="flex h-10 items-center gap-2 rounded px-2.5 text-sm hover:bg-ink/5" aria-label="Minha conta">
            <UserIcon />
            <span className="hidden max-w-36 truncate md:inline">{viewer.user ? viewer.user.name.split(" ")[0] : "Entrar"}</span>
          </Link>
          <Link href="/carrinho" className="relative flex h-10 w-10 items-center justify-center rounded hover:bg-ink/5" aria-label={`Carrinho, ${cartCount} itens`}>
            <BagIcon />
            {cartCount > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] text-accent-ink">{cartCount}</span>}
          </Link>
        </div>
      </div>
      {viewer.user && !viewer.canSeePrices && (
        <div className="border-t border-line/70 bg-warning/5 py-2 text-center text-xs text-muted">
          {!viewer.user.emailVerified
            ? "Confirme seu e-mail para liberar os preços para empresas."
            : viewer.company?.status === "UNDER_REVIEW"
              ? "Seu cadastro está em análise. Nossa equipe retornará em breve."
              : "Seu acesso aos preços está temporariamente indisponível. Fale com o comercial."}
        </div>
      )}
    </header>
  );
}
