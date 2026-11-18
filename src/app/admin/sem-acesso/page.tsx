import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/modules/auth/session";
import { homeFor } from "@/modules/admin/menu";
import { levelLabel } from "@/modules/admin-users/levels";

export const metadata = { title: "Sem acesso" };

export default async function NoAccess() {
  const v = await getViewer();
  if (!v.user || !v.admin) redirect("/entrar?next=/admin");
  const home = homeFor(v.admin.permissions);
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="font-sans text-xl font-medium">Esta área não faz parte do seu acesso</h1>
      <p className="mt-3 text-sm text-muted">Seu nível de acesso é <strong className="font-medium text-ink">{levelLabel(v.admin.level)}</strong>. Se precisar desta área, peça a um usuário Adm para ajustar o seu nível.</p>
      {home !== "/admin/sem-acesso" && <Link href={home} className="mt-6 inline-flex h-10 items-center rounded bg-accent px-5 text-sm text-accent-ink">Ir para o meu painel</Link>}
    </div>
  );
}
