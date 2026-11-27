-- Vendas do ML: frete do pacote rateado entre as vendas do mesmo pacote (o ML lança o frete do pacote numa venda só)
ALTER TABLE "MlOrderItem" ADD COLUMN "shipAllocCents" INTEGER;
