-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('RASCUNHO', 'EMITIDO', 'ENVIADO', 'APROVADO', 'RECUSADO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "FreightTerm" AS ENUM ('COTAR', 'CIF', 'FOB');

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "companyId" TEXT,
    "clientSnapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "validDays" INTEGER NOT NULL DEFAULT 15,
    "paymentTerms" TEXT NOT NULL,
    "deliveryNote" TEXT,
    "freightTerm" "FreightTerm" NOT NULL DEFAULT 'COTAR',
    "freightCents" INTEGER NOT NULL DEFAULT 0,
    "globalDiscountBps" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "seller" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'RASCUNHO',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "costCents" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "variantId" TEXT,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "specs" TEXT,
    "imageUrl" TEXT,
    "delivery" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "unitCostCents" INTEGER,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");

-- CreateIndex
CREATE INDEX "Quote_status_issuedAt_idx" ON "Quote"("status", "issuedAt");

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

