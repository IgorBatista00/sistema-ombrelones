-- Faturamento (NF da venda) e cobrança (forma prevista e boleto por parcela) — vendas do funil de orçamentos.
ALTER TABLE "Sale" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "Sale" ADD COLUMN "invoiceDate" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "invoicedAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "invoicedBy" TEXT;
CREATE INDEX "Sale_invoiceNumber_idx" ON "Sale"("invoiceNumber");
ALTER TABLE "Receivable" ADD COLUMN "plannedMethod" TEXT;
ALTER TABLE "Receivable" ADD COLUMN "boletoNumber" TEXT;
ALTER TABLE "Receivable" ADD COLUMN "boletoIssuedAt" TIMESTAMP(3);
ALTER TABLE "Receivable" ADD COLUMN "boletoIssuedBy" TEXT;
