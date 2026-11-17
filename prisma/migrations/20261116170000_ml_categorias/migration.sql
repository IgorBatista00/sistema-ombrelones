-- Mercado Livre: itens dos pedidos (categoria do anúncio) e cache de categorias.
CREATE TABLE "MlOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "saleFeeCents" INTEGER,
    "orderStatus" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MlOrderItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MlOrderItem_orderId_position_key" ON "MlOrderItem"("orderId", "position");
CREATE INDEX "MlOrderItem_categoryId_saleDate_idx" ON "MlOrderItem"("categoryId", "saleDate");
CREATE TABLE "MlCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MlCategory_pkey" PRIMARY KEY ("id")
);
