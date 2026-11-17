-- CreateEnum
CREATE TYPE "MeasureUnit" AS ENUM ('CM', 'M');

-- CreateEnum
CREATE TYPE "LeadTime" AS ENUM ('PRONTA_ENTREGA', 'D15', 'D30', 'D60', 'D90', 'IMPORTACAO');

-- CreateEnum
CREATE TYPE "CostItemCategory" AS ENUM ('CORTE', 'TECIDO', 'GRAFICA', 'PLAQUINHA');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "code" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "costFinalCents" INTEGER,
ADD COLUMN     "costUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "lengthMm" INTEGER,
ADD COLUMN     "measureUnit" "MeasureUnit" NOT NULL DEFAULT 'CM';

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "storageKey" TEXT;

-- CreateTable
CREATE TABLE "ProductPackage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT,
    "lengthMm" INTEGER NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "weightG" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "cnpj" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSupplier" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierCode" TEXT,
    "leadTime" "LeadTime",
    "moq" INTEGER,
    "costCents" INTEGER,
    "ipiBps" INTEGER,
    "notes" TEXT,
    "isPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCostHistory" (
    "id" TEXT NOT NULL,
    "productSupplierId" TEXT NOT NULL,
    "costCents" INTEGER,
    "ipiBps" INTEGER,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCostHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostItem" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "category" "CostItemCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCostItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "costItemId" TEXT NOT NULL,
    "category" "CostItemCategory" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "ProductCostItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_cnpj_key" ON "Supplier"("cnpj");

-- CreateIndex
CREATE INDEX "ProductSupplier_supplierId_idx" ON "ProductSupplier"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSupplier_productId_supplierId_key" ON "ProductSupplier"("productId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierCostHistory_productSupplierId_changedAt_idx" ON "SupplierCostHistory"("productSupplierId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CostItem_key_key" ON "CostItem"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCostItem_productId_category_key" ON "ProductCostItem"("productId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- AddForeignKey
ALTER TABLE "ProductPackage" ADD CONSTRAINT "ProductPackage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplier" ADD CONSTRAINT "ProductSupplier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplier" ADD CONSTRAINT "ProductSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCostHistory" ADD CONSTRAINT "SupplierCostHistory_productSupplierId_fkey" FOREIGN KEY ("productSupplierId") REFERENCES "ProductSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostItem" ADD CONSTRAINT "ProductCostItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostItem" ADD CONSTRAINT "ProductCostItem_costItemId_fkey" FOREIGN KEY ("costItemId") REFERENCES "CostItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

