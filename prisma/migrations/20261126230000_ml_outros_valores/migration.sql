-- Vendas do ML: demais colunas de valor da planilha (acréscimo no preço, taxa de parcelamento, custo por diferença de medidas, colunas novas…)
ALTER TABLE "MlOrderItem" ADD COLUMN "otherLines" JSONB;
