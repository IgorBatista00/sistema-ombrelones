-- Perfis de markup (custos percentuais sobre o preço + margens) e vínculo com o produto
CREATE TABLE "MarkupProfile" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cardFeeBps" INTEGER NOT NULL DEFAULT 0,
  "extCommissionBps" INTEGER NOT NULL DEFAULT 0,
  "intCommissionBps" INTEGER NOT NULL DEFAULT 0,
  "taxBps" INTEGER NOT NULL DEFAULT 0,
  "packagingBps" INTEGER NOT NULL DEFAULT 0,
  "financialBps" INTEGER NOT NULL DEFAULT 0,
  "otherBps" INTEGER NOT NULL DEFAULT 0,
  "idealMarginBps" INTEGER NOT NULL DEFAULT 0,
  "minMarginBps" INTEGER NOT NULL DEFAULT 0,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarkupProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarkupProfile_name_key" ON "MarkupProfile"("name");

ALTER TABLE "Product" ADD COLUMN "markupProfileId" TEXT;
CREATE INDEX "Product_markupProfileId_idx" ON "Product"("markupProfileId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_markupProfileId_fkey" FOREIGN KEY ("markupProfileId") REFERENCES "MarkupProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
