import { requireAdminPage } from "@/modules/auth/session";
import { PageHead } from "@/components/admin/ui";
import { listProfiles } from "@/modules/pricing/profiles";
import { MarkupProfiles } from "@/components/admin/markup-profiles";

export const metadata = { title: "Markup" };

export default async function MarkupPage() {
  await requireAdminPage("PRODUCTS");
  const profiles = await listProfiles();
  return (
    <>
      <PageHead title="Markup" subtitle="Monte cada markup com os custos sobre o preço de venda e as margens. Depois escolha, na aba Tabela, qual markup vale para cada produto." />
      <MarkupProfiles initial={profiles} />
      <div className="mt-6 max-w-3xl text-xs leading-relaxed text-muted">
        <p><b className="font-medium text-ink">Como o preço é calculado:</b> todos os percentuais incidem sobre o preço de venda. Divisor = 1 − (total de custos + margem). Preço = custo final do produto ÷ divisor.</p>
        <p className="mt-1">O preço que vai para o site usa a <b className="font-medium text-ink">margem ideal</b>. A <b className="font-medium text-ink">margem mínima</b> dá o menor preço aceitável; a Tabela avisa quando o preço do site está abaixo dele.</p>
      </div>
    </>
  );
}
