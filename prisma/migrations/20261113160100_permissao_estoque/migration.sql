-- Migração separada: o PostgreSQL não permite usar um valor de enum novo na mesma transação em que foi criado.
-- Quem já administra produtos passa a ter acesso ao estoque
UPDATE "AdminUser" SET "permissions" = array_append("permissions", 'STOCK'::"AdminPermission") WHERE 'PRODUCTS' = ANY("permissions") AND NOT ('STOCK' = ANY("permissions"));
-- Movimentações antigas de venda recebem o novo tipo
UPDATE "StockMovement" SET "type" = 'VENDA' WHERE "reason" = 'SALE';
