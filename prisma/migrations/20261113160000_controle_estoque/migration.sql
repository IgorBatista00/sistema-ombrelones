-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE', 'VENDA');

-- AlterEnum
ALTER TYPE "AdminPermission" ADD VALUE 'STOCK';

-- AlterTable
ALTER TABLE "StockLevel" ADD COLUMN     "minQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "balanceAfter" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "type" "StockMovementType" NOT NULL DEFAULT 'AJUSTE';

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");


