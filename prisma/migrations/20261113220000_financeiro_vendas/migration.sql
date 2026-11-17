-- Financeiro: vendas (orçamentos fechados) e contas a receber.
CREATE TYPE "SaleStatus" AS ENUM ('ATIVA', 'CANCELADA');
CREATE TYPE "ReceivableStatus" AS ENUM ('ABERTO', 'RECEBIDO', 'CANCELADO');

CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "quoteId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientDoc" TEXT,
    "seller" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "costCents" INTEGER,
    "paymentTerms" TEXT NOT NULL,
    "installmentPlan" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'ATIVA',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "amountCents" INTEGER NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'ABERTO',
    "receivedAt" TIMESTAMP(3),
    "receivedCents" INTEGER,
    "method" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Sale_quoteId_key" ON "Sale"("quoteId");
CREATE INDEX "Sale_closedAt_idx" ON "Sale"("closedAt");
CREATE INDEX "Sale_status_idx" ON "Sale"("status");
CREATE INDEX "Receivable_status_dueDate_idx" ON "Receivable"("status", "dueDate");
CREATE INDEX "Receivable_saleId_idx" ON "Receivable"("saleId");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
