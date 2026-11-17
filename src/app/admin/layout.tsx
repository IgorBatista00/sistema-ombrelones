import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { AdminPermission } from "@prisma/client";
import { getViewer } from "@/modules/auth/session";
import { getSiteSettings } from "@/modules/companies/site-settings";
import { AdminNav } from "@/components/admin/nav";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };

const MENU: { href: string; label: string; perm: AdminPermission | AdminPermission[] }[] = [
  { href: "/admin/meu-dia", label: "Meu dia", perm: ["DASHBOARD", "ORDERS", "LOGISTICS", "FINANCE"] },
  { href: "/admin", label: "Dashboard", perm: "DASHBOARD" },
  { href: "/admin/pedidos", label: "Pedidos", perm: "ORDERS" },
  { href: "/admin/orcamentos", label: "Orçamentos", perm: "ORDERS" },
  { href: "/admin/funil", label: "Funil de orçamentos", perm: "ORDERS" },
  { href: "/admin/logistica", label: "Logística", perm: "LOGISTICS" },
  { href: "/admin/entregas", label: "Entregas", perm: "LOGISTICS" },
  { href: "/admin/produtos", label: "Produtos", perm: "PRODUCTS" },
  { href: "/admin/tabela", label: "Tabela", perm: "PRODUCTS" },
  { href: "/admin/estoque", label: "Estoque", perm: "STOCK" },
  { href: "/admin/fornecedores", label: "Fornecedores", perm: "PRODUCTS" },
  { href: "/admin/tabela-custos", label: "Tabela de custos", perm: "PRODUCTS" },
  { href: "/admin/clientes", label: "Clientes", perm: "CUSTOMERS" },
  { href: "/admin/financeiro", label: "Financeiro", perm: "FINANCE" },
  { href: "/admin/configuracoes", label: "Configurações", perm: "SETTINGS" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const v = await getViewer();
  if (!v.user) redirect("/entrar?next=/admin");
  if (!v.admin) redirect("/");
  const s = await getSiteSettings();
  const items = MENU.filter((m) => (Array.isArray(m.perm) ? m.perm : [m.perm]).some((p) => v.admin!.permissions.includes(p))).map(({ href, label }) => ({ href, label }));
  return (
    <div className="flex min-h-dvh bg-[#f4f2ee]">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-6 py-6"><Link href="/admin" className="font-display text-lg">{s.brandName}</Link><p className="label mt-1">Painel administrativo</p></div>
        <AdminNav items={items} />
        <div className="mt-auto border-t border-line px-6 py-4 text-xs text-muted">{v.user.name}<br /><Link href="/" className="link">Ver loja</Link></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-line bg-surface md:hidden"><AdminNav items={items} horizontal /></div>
        <main id="conteudo" className="flex-1 p-5 md:p-10">{children}</main>
      </div>
    </div>
  );
}
