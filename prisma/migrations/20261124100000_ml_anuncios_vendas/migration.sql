-- Mercado Livre: cadastro de anúncios (produtos vinculados e custos de venda), detalhes das vendas da planilha
-- (tarifas separadas, status de envio, vínculo ao anúncio, custo) e controle de expedição/estoque por venda.

CREATE TABLE "MlListing" (
  "id" TEXT NOT NULL,
  "mlItemId" TEXT,
  "variation" TEXT NOT NULL DEFAULT '',
  "sku" TEXT,
  "title" TEXT NOT NULL,
  "listingType" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ATIVO',
  "priceCents" INTEGER,
  "saleFeeBps" INTEGER,
  "fixedFeeCents" INTEGER,
  "shippingCostCents" INTEGER,
  "packagingCents" INTEGER,
  "taxBps" INTEGER,
  "otherCostCents" INTEGER,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MlListing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MlListing_mlItemId_variation_key" ON "MlListing"("mlItemId", "variation");
CREATE INDEX "MlListing_sku_idx" ON "MlListing"("sku");

CREATE TABLE "MlListingComponent" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "MlListingComponent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MlListingComponent_listingId_variantId_key" ON "MlListingComponent"("listingId", "variantId");
CREATE INDEX "MlListingComponent_variantId_idx" ON "MlListingComponent"("variantId");
ALTER TABLE "MlListingComponent" ADD CONSTRAINT "MlListingComponent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MlListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MlListingComponent" ADD CONSTRAINT "MlListingComponent_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- detalhes por item vendido (vindos da planilha; a integração direta preenche o que tiver)
ALTER TABLE "MlOrderItem" ADD COLUMN "sku" TEXT;
ALTER TABLE "MlOrderItem" ADD COLUMN "variation" TEXT;
ALTER TABLE "MlOrderItem" ADD COLUMN "listingId" TEXT;
ALTER TABLE "MlOrderItem" ADD COLUMN "productCents" INTEGER;
ALTER TABLE "MlOrderItem" ADD COLUMN "shippingRevenueCents" INTEGER;
ALTER TABLE "MlOrderItem" ADD COLUMN "saleFeeTotalCents" INTEGER;
ALTER TABLE "MlOrderItem" ADD COLUMN "shippingFeeCents" INTEGER;
ALTER TABLE "MlOrderItem" ADD COLUMN "refundCents" INTEGER;
ALTER TABLE "MlOrderItem" ADD COLUMN "netCents" INTEGER;
ALTER TABLE "MlOrderItem" ADD COLUMN "statusText" TEXT;
ALTER TABLE "MlOrderItem" ADD COLUMN "shipBy" TIMESTAMP(3);
ALTER TABLE "MlOrderItem" ADD COLUMN "costCents" INTEGER;
CREATE INDEX "MlOrderItem_listingId_idx" ON "MlOrderItem"("listingId");
CREATE INDEX "MlOrderItem_saleDate_idx" ON "MlOrderItem"("saleDate");
ALTER TABLE "MlOrderItem" ADD CONSTRAINT "MlOrderItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MlListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- controle interno por venda (não é apagado ao reimportar a planilha)
CREATE TABLE "MlOrderControl" (
  "orderId" TEXT NOT NULL,
  "shippedAt" TIMESTAMP(3),
  "shippedById" TEXT,
  "notes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MlOrderControl_pkey" PRIMARY KEY ("orderId")
);
