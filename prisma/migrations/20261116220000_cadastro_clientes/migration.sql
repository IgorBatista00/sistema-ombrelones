-- Cadastro comercial de clientes (PF ou PJ) — usado nos orçamentos; separado das contas de empresa da loja.
CREATE TYPE "PersonType" AS ENUM ('PJ', 'PF');
CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "personType" "PersonType" NOT NULL DEFAULT 'PJ',
  "name" TEXT NOT NULL,
  "tradeName" TEXT,
  "cnpj" TEXT,
  "cpf" TEXT,
  "stateRegistration" TEXT,
  "contactName" TEXT,
  "mobile" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "street" TEXT,
  "district" TEXT,
  "city" TEXT,
  "state" TEXT,
  "zipCode" TEXT,
  "deliveryAddress" TEXT,
  "birthday" TEXT,
  "notes" TEXT,
  "source" TEXT NOT NULL DEFAULT 'IMPORT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Client_cnpj_key" ON "Client"("cnpj");
CREATE UNIQUE INDEX "Client_cpf_key" ON "Client"("cpf");
CREATE INDEX "Client_name_idx" ON "Client"("name");
ALTER TABLE "Quote" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Quote_clientId_idx" ON "Quote"("clientId");
