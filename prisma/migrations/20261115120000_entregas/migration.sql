-- Entregas dos pedidos fechados.
CREATE TYPE "DeliveryStatus" AS ENUM ('A_AGENDAR', 'AGENDADA', 'EM_ROTA', 'ENTREGUE', 'CANCELADA');
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'A_AGENDAR',
    "clientName" TEXT NOT NULL,
    "clientDoc" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "cep" TEXT,
    "items" JSONB NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "cubageM3" DOUBLE PRECISION,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "promisedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "carrier" TEXT,
    "trackingCode" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Delivery_quoteId_key" ON "Delivery"("quoteId");
CREATE INDEX "Delivery_status_promisedAt_idx" ON "Delivery"("status", "promisedAt");
CREATE INDEX "Delivery_deliveredAt_idx" ON "Delivery"("deliveredAt");
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
