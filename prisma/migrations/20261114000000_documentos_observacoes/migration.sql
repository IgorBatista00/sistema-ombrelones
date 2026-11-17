-- Financeiro: documentos anexados (NF, boleto, comprovante) e observações da venda.
CREATE TYPE "FinanceDocType" AS ENUM ('NOTA_FISCAL', 'BOLETO', 'COMPROVANTE', 'OUTRO');
CREATE TABLE "FinanceDocument" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "receivableId" TEXT,
    "type" "FinanceDocType" NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "FinanceDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SaleNote" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "SaleNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinanceDocument_storageKey_key" ON "FinanceDocument"("storageKey");
CREATE INDEX "FinanceDocument_saleId_deletedAt_idx" ON "FinanceDocument"("saleId", "deletedAt");
CREATE INDEX "FinanceDocument_receivableId_idx" ON "FinanceDocument"("receivableId");
CREATE INDEX "SaleNote_saleId_createdAt_idx" ON "SaleNote"("saleId", "createdAt");
ALTER TABLE "FinanceDocument" ADD CONSTRAINT "FinanceDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceDocument" ADD CONSTRAINT "FinanceDocument_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleNote" ADD CONSTRAINT "SaleNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
