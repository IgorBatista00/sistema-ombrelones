-- AlterTable
ALTER TABLE "StockLevel" ADD COLUMN     "avgCostCents" INTEGER,
ADD COLUMN     "lastCostCents" INTEGER;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "unitCostCents" INTEGER;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "cogsCents" INTEGER;

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "freightCents" INTEGER NOT NULL DEFAULT 0,
    "otherCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "ipiBps" INTEGER NOT NULL DEFAULT 0,
    "allocatedCents" INTEGER NOT NULL DEFAULT 0,
    "unitTotalCents" INTEGER NOT NULL,
    "stockBefore" INTEGER NOT NULL,
    "avgBeforeCents" INTEGER,
    "avgAfterCents" INTEGER NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Purchase_issuedAt_idx" ON "Purchase"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_supplierId_invoiceNumber_key" ON "Purchase"("supplierId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "PurchaseItem_variantId_idx" ON "PurchaseItem"("variantId");

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Custo médio inicial do saldo existente: custo final base do cadastro (mercadoria + IPI do fornecedor principal)
UPDATE "StockLevel" sl SET "avgCostCents" = p."costFinalCents"
  FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
 WHERE sl."variantId" = v.id AND sl."avgCostCents" IS NULL AND p."costFinalCents" IS NOT NULL;
