-- Funil de orçamentos: data de fechamento e motivo de perda.
ALTER TABLE "Quote" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "lostReason" TEXT;
-- Orçamentos já decididos: usa a última atualização como data de fechamento; expirados fecham no fim da validade.
UPDATE "Quote" SET "closedAt" = "updatedAt" WHERE "status" IN ('APROVADO', 'RECUSADO');
UPDATE "Quote" SET "closedAt" = "issuedAt" + ("validDays" || ' days')::interval, "lostReason" = 'Validade vencida' WHERE "status" = 'EXPIRADO';
CREATE INDEX "Quote_createdAt_idx" ON "Quote"("createdAt");
CREATE INDEX "Quote_closedAt_idx" ON "Quote"("closedAt");
