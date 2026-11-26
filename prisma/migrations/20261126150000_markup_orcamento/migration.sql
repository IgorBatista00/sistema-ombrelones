-- Markup escolhido no orçamento (para o resultado da operação) e percentuais congelados no fechamento
ALTER TABLE "Quote" ADD COLUMN "markupProfileId" TEXT;
ALTER TABLE "Quote" ADD COLUMN "markupSnapshot" JSONB;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_markupProfileId_fkey" FOREIGN KEY ("markupProfileId") REFERENCES "MarkupProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
