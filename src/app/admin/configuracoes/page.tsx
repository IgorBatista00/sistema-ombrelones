import { requireAdmin } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { saveSettingAction } from "@/modules/admin/actions";
import { POLICIES } from "@/components/layout/footer";
import { ActionForm } from "@/components/admin/action-form";
import { PageHead } from "@/components/admin/ui";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { isAutomaticShippingConfigured } from "@/modules/integrations/shipping";
import { isPaymentConfigured } from "@/modules/integrations/payments";

export default async function Settings() {
  const { admin } = await requireAdmin("SETTINGS");
  const rows = await db.setting.findMany();
  const get = (k: string) => (rows.find((r) => r.key === k)?.value ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const brand = get("brand"), company = get("company"), contact = get("contact"), commercial = get("commercial");
  const integrations = [
    ["Consulta de CNPJ", !!process.env.CNPJ_PROVIDER && !!process.env.CNPJ_API_URL],
    ["Frete automático", isAutomaticShippingConfigured()],
    ["Pagamentos", isPaymentConfigured()],
    ["ERP", false],
    ["E-mail transacional", false],
    ["Armazenamento de imagens", false],
  ] as const;
  const F = ({ k, label, v, area }: { k: string; label: string; v?: string; area?: boolean }) => (
    <Field label={label} htmlFor={k}>{area ? <Textarea id={k} name={k} defaultValue={v ?? ""} rows={4} /> : <Input id={k} name={k} defaultValue={v ?? ""} className="h-10" />}</Field>
  );

  return (
    <>
      <PageHead title="Configurações" />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card p-6">
          <h2 className="label mb-4">Integrações</h2>
          <ul className="space-y-2 text-sm">{integrations.map(([n, ok]) => <li key={n} className="flex justify-between"><span>{n}</span><Badge tone={ok ? "success" : "warning"}>{ok ? "Configurada" : "Pendente"}</Badge></li>)}</ul>
          <p className="mt-4 text-xs text-muted">Credenciais ficam em variáveis de ambiente (nunca no banco ou no navegador). Consulte o README.</p>
        </section>

        <ActionForm action={saveSettingAction} className="card space-y-4 p-6">
          <input type="hidden" name="key" value="brand" />
          <h2 className="label">Identidade da marca</h2>
          <F k="name" label="Nome da marca" v={brand.name} />
          <p className="text-xs text-muted">Cores e tipografia: tokens em src/app/globals.css (substituir pela identidade definitiva).</p>
        </ActionForm>

        <ActionForm action={saveSettingAction} className="card space-y-4 p-6">
          <input type="hidden" name="key" value="company" />
          <h2 className="label">Dados empresariais (rodapé e "Sobre nós")</h2>
          <F k="legalName" label="Razão social" v={company.legalName} />
          <F k="cnpj" label="CNPJ" v={company.cnpj} />
          <F k="address" label="Endereço" v={company.address} />
          <F k="about" label="Texto institucional (Sobre nós)" v={company.about} area />
        </ActionForm>

        <ActionForm action={saveSettingAction} className="card space-y-4 p-6">
          <input type="hidden" name="key" value="contact" />
          <h2 className="label">Canais de contato</h2>
          <F k="email" label="E-mail comercial" v={contact.email} />
          <F k="phone" label="Telefone" v={contact.phone} />
          <F k="whatsapp" label="WhatsApp (somente dígitos, com DDI)" v={contact.whatsapp} />
          <F k="businessHours" label="Horário de atendimento" v={contact.businessHours} />
        </ActionForm>

        <ActionForm action={saveSettingAction} className="card space-y-4 p-6">
          <input type="hidden" name="key" value="commercial" />
          <h2 className="label">Condições comerciais e pagamento</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {[["PIX", "Pix"], ["BOLETO", "Boleto"], ["CREDIT_CARD", "Cartão"]].map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name={`method_${k}`} defaultChecked={commercial.enabledMethods?.includes(k)} /> {l}</label>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Reserva Pix (min)" htmlFor="res_PIX"><Input id="res_PIX" name="res_PIX" type="number" min={1} defaultValue={commercial.reservationMinutes?.PIX ?? 60} className="h-10" /></Field>
            <Field label="Reserva boleto (min)" htmlFor="res_BOLETO"><Input id="res_BOLETO" name="res_BOLETO" type="number" min={1} defaultValue={commercial.reservationMinutes?.BOLETO ?? 4320} className="h-10" /></Field>
            <Field label="Reserva cartão (min)" htmlFor="res_CREDIT_CARD"><Input id="res_CREDIT_CARD" name="res_CREDIT_CARD" type="number" min={1} defaultValue={commercial.reservationMinutes?.CREDIT_CARD ?? 30} className="h-10" /></Field>
            <Field label="Reserva p/ cotação (h)" htmlFor="quoteReservationHours"><Input id="quoteReservationHours" name="quoteReservationHours" type="number" min={1} defaultValue={commercial.quoteReservationHours ?? 72} className="h-10" /></Field>
            <Field label="Vencimento boleto (dias)" htmlFor="boletoDueDays"><Input id="boletoDueDays" name="boletoDueDays" type="number" min={1} defaultValue={commercial.boletoDueDays ?? 3} className="h-10" /></Field>
            <Field label="Parcelas máx. cartão" htmlFor="maxInstallments"><Input id="maxInstallments" name="maxInstallments" type="number" min={1} max={12} defaultValue={commercial.maxInstallments ?? 1} className="h-10" /></Field>
          </div>
          <p className="text-xs text-muted">Taxas e juros de parcelamento são definidos no contrato com o gateway (PENDENTE de homologação).</p>
        </ActionForm>

        {POLICIES.map((p) => (
          <ActionForm key={p.slug} action={saveSettingAction} className="card space-y-4 p-6">
            <input type="hidden" name="key" value={`page:${p.slug}`} />
            <h2 className="label">{p.label}</h2>
            <Textarea name="body" rows={6} defaultValue={(get(`page:${p.slug}`) as { body?: string }).body ?? ""} placeholder="Texto aprovado pelo jurídico. Parágrafos separados por linha em branco." aria-label={p.label} />
          </ActionForm>
        ))}

        {admin.permissions.includes("ADMIN_USERS") && (
          <section className="card p-6 text-sm">
            <h2 className="label mb-3">Usuários administrativos e permissões</h2>
            <AdminUsers />
          </section>
        )}
      </div>
    </>
  );
}

async function AdminUsers() {
  const admins = await db.adminUser.findMany({ include: { user: { select: { name: true, email: true } } } });
  return (
    <>
      <ul className="space-y-2">{admins.map((a) => <li key={a.id}>{a.user.name} <span className="text-muted">· {a.user.email} · {a.permissions.join(", ")}</span></li>)}</ul>
      <p className="mt-3 text-xs text-muted">Inclusão/edição de administradores: ver README (comando de seed). Tela de gestão completa prevista na Etapa 6.</p>
    </>
  );
}
