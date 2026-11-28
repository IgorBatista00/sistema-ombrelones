-- Vendas do ML de outra empresa (mesma conta do ML): ficam guardadas, mas fora de todos os números.
ALTER TABLE "MlOrderItem" ADD COLUMN "foreign" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MlOrderItem" ADD COLUMN "foreignManual" BOOLEAN;
ALTER TABLE "MlReceipt" ADD COLUMN "foreign" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "MlOrderItem_foreign_idx" ON "MlOrderItem"("foreign");
-- regra inicial pedida pelo dono (28/11/2026): são da empresa os SKUs que começam com PA50
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('mlOwnSkuPrefixes', '{"prefixes":["PA50"]}', now()) ON CONFLICT ("key") DO NOTHING;
UPDATE "MlOrderItem" SET "foreign" = ("sku" IS NOT NULL AND upper("sku") NOT LIKE 'PA50%');
UPDATE "MlReceipt" r SET "foreign" = true WHERE EXISTS (SELECT 1 FROM "MlOrderItem" i WHERE i."orderId" = r."orderId") AND NOT EXISTS (SELECT 1 FROM "MlOrderItem" i WHERE i."orderId" = r."orderId" AND NOT i."foreign");
