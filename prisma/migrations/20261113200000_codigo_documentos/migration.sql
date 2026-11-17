-- Numeração única para pedidos e orçamentos + código "MÊS-0000" (ex.: NOV-0041).
CREATE SEQUENCE "doc_number_seq";
SELECT setval('doc_number_seq', GREATEST((SELECT COALESCE(MAX("number"), 0) FROM "Order"), (SELECT COALESCE(MAX("number"), 0) FROM "Quote"), 1));

ALTER TABLE "Order" ALTER COLUMN "number" SET DEFAULT nextval('doc_number_seq'::regclass);
ALTER TABLE "Quote" ALTER COLUMN "number" SET DEFAULT nextval('doc_number_seq'::regclass);
DROP SEQUENCE IF EXISTS "Order_number_seq";
DROP SEQUENCE IF EXISTS "Quote_number_seq";

ALTER TABLE "Order" ADD COLUMN "code" TEXT;
ALTER TABLE "Quote" ADD COLUMN "code" TEXT;
UPDATE "Order" SET "code" = (ARRAY['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'])[EXTRACT(MONTH FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int] || '-' || LPAD("number"::text, 4, '0');
UPDATE "Quote" SET "code" = (ARRAY['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'])[EXTRACT(MONTH FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int] || '-' || LPAD("number"::text, 4, '0');
UPDATE "Quote" SET "orderNumber" = "code";
ALTER TABLE "Order" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "Quote" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");
CREATE UNIQUE INDEX "Quote_code_key" ON "Quote"("code");
