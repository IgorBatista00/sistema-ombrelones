-- Vendas do ML: marca de pacote (frete cobrado numa das vendas do pacote) e "Descontos e bônus" da planilha
ALTER TABLE "MlOrderItem" ADD COLUMN "inPack" BOOLEAN;
ALTER TABLE "MlOrderItem" ADD COLUMN "bonusCents" INTEGER;
