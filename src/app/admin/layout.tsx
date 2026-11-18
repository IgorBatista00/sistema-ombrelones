import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/modules/auth/session";
import { getSiteSettings } from "@/modules/companies/site-settings";
import { AdminNav } from "@/components/admin/nav";
import { allowedMenu } from "@/modules/admin/menu";
import { levelLabel } from "@/modules/admin-users/levels";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };



export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const v = await getViewer();
  if (!v.user) redirect("/entrar?next=/admin");
  if (!v.admin) redirect("/");
  if (v.user.mustChangePassword) redirect("/trocar-senha");
  const s = await getSiteSettings();
  const items = allowedMenu(v.admin.permissions);
  return (
    <div className="flex min-h-dvh bg-[#f4f2ee]">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-6 py-6"><Link href="/admin" className="font-display text-lg">{s.brandName}</Link><p className="label mt-1">Painel administrativo</p></div>
        <AdminNav items={items} />
        <div className="mt-auto border-t border-line px-6 py-4 text-xs text-muted">{v.user.name} · {levelLabel(v.admin.level)}<br /><Link href="/trocar-senha" className="link">Minha senha</Link> · <Link href="/" className="link">Ver loja</Link></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-line bg-surface md:hidden"><AdminNav items={items} horizontal /></div>
        <main id="conteudo" className="flex-1 p-5 md:p-10">{children}</main>
      </div>
    </div>
  );
}
