import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { PageHead } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { adminUsersView, getLevelMatrix } from "@/modules/admin-users/service";
import { AREAS, LEVELS, permissionsFor, type LevelKey } from "@/modules/admin-users/levels";
import { LevelMatrixEditor, NewUserButton, UserRowActions } from "@/components/admin/users-manager";

export const metadata = { title: "Usuários" };
const dt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "Nunca entrou");

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { user: me } = await requireAdminPage("ADMIN_USERS");
  const aba = (await searchParams).aba === "niveis" ? "niveis" : "usuarios";
  const [users, matrix] = await Promise.all([adminUsersView(), getLevelMatrix()]);
  const counts = Object.fromEntries(LEVELS.map((l) => [l.key, users.filter((u) => u.active && u.level === l.key).length]));
  const areasOf = (lv: string | null) => (lv === "ADM" ? "Acesso total ao painel" : lv ? permissionsFor(lv as LevelKey, matrix).map((a) => AREAS.find((x) => x.key === a)?.label).filter(Boolean).join(" · ") : "Escolha um nível em Editar");
  return (
    <>
      <PageHead title="Usuários" subtitle="Quem acessa o painel e o que cada nível pode ver." action={aba === "usuarios" ? <NewUserButton /> : undefined} />
      <nav className="mb-5 flex gap-1 border-b border-line" aria-label="Visão">
        {[["usuarios", "Usuários"], ["niveis", "Níveis de acesso"]].map(([k, l]) => (
          <Link key={k} href={k === "usuarios" ? "/admin/usuarios" : "/admin/usuarios?aba=niveis"} aria-current={aba === k ? "page" : undefined} className={`-mb-px border-b-2 px-4 py-2 text-sm ${aba === k ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>{l}</Link>
        ))}
      </nav>
      {aba === "niveis" ? <LevelMatrixEditor initial={matrix} counts={counts} /> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">{LEVELS.map((l) => <div key={l.key} className="card p-4"><p className="label">{l.label}</p><p className="mt-1 text-xl font-medium">{counts[l.key]}</p><p className="text-xs text-muted">{l.hint}</p></div>)}</div>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Usuário", "Nível de acesso", "Situação", "Último acesso", ""].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "text-muted"} data-user={u.email}>
                  <td className="px-4 py-3"><span className="font-medium">{u.name}</span>{u.id === me.id && <span className="ml-1 text-xs text-muted">(você)</span>}<span className="block text-xs text-muted">{u.email}{u.phone ? ` · ${u.phone}` : ""}</span></td>
                  <td className="px-4 py-3">{u.level ? <strong className="font-medium">{u.levelLabel}</strong> : <Badge tone="warning">Sem nível</Badge>}<span className="block max-w-xs text-xs text-muted">{areasOf(u.level)}</span></td>
                  <td className="px-4 py-3">{u.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Desativado</Badge>}{u.active && u.pendingPassword && <span className="mt-1 block text-xs text-warning">Ainda não criou a senha própria</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{dt(u.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-right"><UserRowActions self={u.id === me.id} u={{ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() }} /></td>
                </tr>))}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">O e-mail é o login e não pode ser trocado; para mudar, desative e crie outro usuário. Usuários desativados ficam na lista para manter o histórico.</p>
        </>
      )}
    </>
  );
}
