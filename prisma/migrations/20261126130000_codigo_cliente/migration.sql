-- Código do cliente (busca no orçamento por nome, código ou CNPJ). Clientes já cadastrados recebem numeração sequencial pela data de cadastro.
ALTER TABLE "Client" ADD COLUMN "code" TEXT;
WITH numbered AS (SELECT "id", row_number() OVER (ORDER BY "createdAt", "name", "id") AS n FROM "Client")
UPDATE "Client" c SET "code" = lpad(numbered.n::text, 5, '0') FROM numbered WHERE numbered."id" = c."id";
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");
