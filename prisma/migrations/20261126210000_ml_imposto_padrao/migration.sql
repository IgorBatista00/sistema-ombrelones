-- Imposto padrão das vendas no Mercado Livre: 14,5% em todos os anúncios (pedido do dono em 26/11/2026)
ALTER TABLE "MlListing" ALTER COLUMN "taxBps" SET DEFAULT 1450;
UPDATE "MlListing" SET "taxBps" = 1450;
