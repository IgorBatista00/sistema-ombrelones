-- Tabela de preços: markup de venda por produto (fator × 10.000).
ALTER TABLE "Product" ADD COLUMN "markup" INTEGER;
ALTER TABLE "Product" ADD COLUMN "markupUpdatedAt" TIMESTAMP(3);
