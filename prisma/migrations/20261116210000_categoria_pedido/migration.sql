-- Categoria interna do pedido (escolhida no "Novo orçamento"), copiada para a venda e a entrega para filtrar.
ALTER TABLE "Quote" ADD COLUMN "category" TEXT;
ALTER TABLE "Sale" ADD COLUMN "category" TEXT;
ALTER TABLE "Delivery" ADD COLUMN "category" TEXT;
CREATE INDEX "Quote_category_idx" ON "Quote"("category");
CREATE INDEX "Sale_category_idx" ON "Sale"("category");
CREATE INDEX "Delivery_category_idx" ON "Delivery"("category");
-- (sem efeito em banco novo) mantém venda/entrega com a mesma categoria do orçamento
UPDATE "Sale" s SET "category" = q."category" FROM "Quote" q WHERE q."id" = s."quoteId" AND s."category" IS DISTINCT FROM q."category";
UPDATE "Delivery" d SET "category" = q."category" FROM "Quote" q WHERE q."id" = d."quoteId" AND d."category" IS DISTINCT FROM q."category";
