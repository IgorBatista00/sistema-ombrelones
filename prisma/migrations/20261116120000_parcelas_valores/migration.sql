-- Parcelas com valores diferentes: valores fixados por parcela (centavos; null = automático).
ALTER TABLE "Quote" ADD COLUMN "installmentValues" JSONB;
ALTER TABLE "Sale" ADD COLUMN "installmentValues" JSONB;
