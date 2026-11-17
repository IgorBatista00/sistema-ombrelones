-- Integração Mercado Livre (recebimentos).
CREATE TABLE "MlConnection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sellerId" TEXT NOT NULL,
    "nickname" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "connectedById" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MlConnection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MlReceipt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "packId" TEXT,
    "orderStatus" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "buyerNickname" TEXT,
    "itemsSummary" TEXT NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "shippingCents" INTEGER,
    "feeCents" INTEGER,
    "netCents" INTEGER,
    "releaseDate" TIMESTAMP(3),
    "releaseStatus" TEXT,
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MlReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MlReceipt_paymentId_key" ON "MlReceipt"("paymentId");
CREATE INDEX "MlReceipt_saleDate_idx" ON "MlReceipt"("saleDate");
CREATE INDEX "MlReceipt_releaseDate_idx" ON "MlReceipt"("releaseDate");
CREATE INDEX "MlReceipt_orderId_idx" ON "MlReceipt"("orderId");
