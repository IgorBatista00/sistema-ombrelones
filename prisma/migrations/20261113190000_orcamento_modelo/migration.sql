-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "commercialSnapshot" JSONB,
ADD COLUMN     "deliveryDays" INTEGER,
ADD COLUMN     "extraDiscountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "installmentPlan" TEXT,
ADD COLUMN     "orderNumber" TEXT;

-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "cordage" TEXT,
ADD COLUMN     "cubageM3" DOUBLE PRECISION,
ADD COLUMN     "fabricLine" TEXT,
ADD COLUMN     "finish" TEXT,
ADD COLUMN     "itemNotes" TEXT,
ADD COLUMN     "measures" TEXT,
ADD COLUMN     "paint" TEXT,
ADD COLUMN     "unitDiscountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weightG" INTEGER;

