import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/session";
import { formatBRL } from "@/lib/money";
import { STATUS_LABEL, installments, validUntil } from "@/modules/quotes/totals";
import { sheetTotals } from "@/modules/quotes/sheet";
import { companyHeader, loadSheet } from "@/modules/quotes/sheet-data";
import { QuoteSheet } from "@/components/admin/quote-sheet";
import { QuoteDocToolbar } from "@/components/admin/quote-doc-toolbar";

export const metadata: Metadata = { title: "Orçamento", robots: { index: false, follow: false } };
const d = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: "UTC" });

/** Documento padronizado (A4), mesmo layout da edição — imprimir ou "Salvar como PDF" pelo navegador. */
export default async function QuoteDocument({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("ORDERS");
  const [q, company] = await Promise.all([loadSheet((await params).id), companyHeader()]);
  if (!q) notFound();
  const t = sheetTotals(q);
  const issued = new Date(q.issuedAt + "T12:00:00Z");
  const inst = installments(t.total, q.installmentPlan, issued, q.installmentValues);
  const whatsapp = [
    `*Orçamento ${q.code} — ${company.brandName}*`, `Cliente: ${q.client.name}`, "",
    ...q.items.map((i, n) => `${n + 1}. ${i.name}${i.measures ? ` (${i.measures})` : ""}\n   ${i.quantity} × R$ ${i.unitPrice}${i.unitDiscount ? ` − R$ ${i.unitDiscount}` : ""} = ${formatBRL(t.rows[n]?.total ?? 0)}`),
    "", `Total do pedido: *${formatBRL(t.total)}*${q.freightTerm === "COTAR" ? " + frete a cotar" : ` · Frete ${q.freightTerm}`}`,
    `Pagamento: ${q.paymentTerms}${inst.length > 1 ? ` (${inst.length}x)` : ""}`, q.deliveryDays ? `Prazo de entrega: ${q.deliveryDays} dias corridos` : "",
    `Válido até ${d(validUntil(issued, q.validDays))}`,
  ].filter((l) => l !== null).join("\n");

  return (
    <div className="qs-page min-h-dvh bg-[#e9e6e0] py-6">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" />
      <style>{`@page { size: A4; margin: 10mm; } @media print { html, body, .qs-page { background: #fff !important; } .qs-page { min-height: 0 !important; padding: 0 !important; } .no-print { display: none !important; } .qs-doc { box-shadow: none !important; padding: 0 !important; max-width: none !important; } }`}</style>
      <QuoteDocToolbar id={q.id!} code={q.code!} status={q.status} statusLabel={STATUS_LABEL[q.status]} whatsapp={whatsapp} />
      <article className="qs-doc mx-auto max-w-[900px] bg-white p-8 shadow-xl">
        <QuoteSheet edit={false} data={q} company={company} />
      </article>
    </div>
  );
}
