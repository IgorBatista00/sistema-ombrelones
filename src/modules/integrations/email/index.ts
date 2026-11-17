/**
 * E-mails transacionais. Os templates ficam aqui; o envio depende de
 * EMAIL_PROVIDER. Sem provedor configurado, em desenvolvimento o conteúdo
 * é registrado no console; em produção, a falha é registrada como pendência
 * (o fluxo de negócio NÃO é interrompido nem simula envio).
 */
export type EmailTemplate =
  | { kind: "verify-email"; name: string; url: string }
  | { kind: "password-reset"; name: string; url: string }
  | { kind: "order-created"; orderNumber: string; url: string }
  | { kind: "payment-confirmed"; orderNumber: string; url: string }
  | { kind: "quote-available"; orderNumber: string; url: string }
  | { kind: "quote-requested-admin"; orderNumber: string; company: string; url: string }
  | { kind: "order-shipped"; orderNumber: string; url: string; tracking?: string | null }
  | { kind: "order-delivered"; orderNumber: string; url: string };

const brand = "[NOME DA MARCA]";

export function render(t: EmailTemplate): { subject: string; text: string } {
  switch (t.kind) {
    case "verify-email":
      return { subject: `Confirme seu e-mail — ${brand}`, text: `Olá, ${t.name}.\n\nConfirme seu e-mail para liberar os preços para empresas:\n${t.url}\n\nO link expira em 48 horas.` };
    case "password-reset":
      return { subject: `Redefinição de senha — ${brand}`, text: `Olá, ${t.name}.\n\nPara criar uma nova senha, acesse:\n${t.url}\n\nO link expira em 1 hora. Se não foi você, ignore esta mensagem.` };
    case "order-created":
      return { subject: `Pedido nº ${t.orderNumber} registrado`, text: `Recebemos seu pedido nº ${t.orderNumber}.\nAcompanhe em: ${t.url}` };
    case "payment-confirmed":
      return { subject: `Pagamento confirmado — pedido nº ${t.orderNumber}`, text: `O pagamento do pedido nº ${t.orderNumber} foi confirmado pelo provedor.\n${t.url}` };
    case "quote-available":
      return { subject: `Cotação de frete disponível — pedido nº ${t.orderNumber}`, text: `A cotação de frete do seu pedido está disponível para aceite.\n${t.url}` };
    case "quote-requested-admin":
      return { subject: `Nova solicitação de cotação — pedido nº ${t.orderNumber}`, text: `${t.company} solicitou cotação de frete.\n${t.url}` };
    case "order-shipped":
      return { subject: `Pedido nº ${t.orderNumber} expedido`, text: `Seu pedido foi expedido.${t.tracking ? `\nRastreamento: ${t.tracking}` : ""}\n${t.url}` };
    case "order-delivered":
      return { subject: `Pedido nº ${t.orderNumber} entregue`, text: `A entrega do pedido nº ${t.orderNumber} foi confirmada.\n${t.url}` };
  }
}

export async function sendEmail(to: string, template: EmailTemplate) {
  const { subject, text } = render(template);
  const provider = process.env.EMAIL_PROVIDER;
  if (!provider) {
    if (process.env.APP_ENV !== "production") {
      console.info(`[email:dev] para=${to} assunto="${subject}"\n${text}`);
      return { sent: false, reason: "dev-console" as const };
    }
    console.error(`[email] PENDENTE: EMAIL_PROVIDER não configurado. E-mail "${subject}" não enviado.`);
    return { sent: false, reason: "not-configured" as const };
  }
  // PENDENTE: implementar o provedor escolhido (Resend/SES/SMTP).
  console.error(`[email] Provedor "${provider}" ainda não implementado.`);
  return { sent: false, reason: "not-implemented" as const };
}
