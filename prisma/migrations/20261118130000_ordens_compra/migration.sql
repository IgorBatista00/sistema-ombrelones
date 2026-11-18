-- Ordens de compra (OC): acompanhamento de pedidos a fornecedores, prazos, entregas e atrasos.
-- Somente acompanhamento: não movimenta estoque nem custo (a entrada continua em Estoque › Compras).
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('ABERTA', 'ENCERRADA', 'CANCELADA');

CREATE TABLE "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "number" SERIAL NOT NULL,
  "supplierId" TEXT NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'ABERTA',
  "orderedAt" TIMESTAMP(3) NOT NULL,
  "promisedAt" TIMESTAMP(3),
  "originalPromisedAt" TIMESTAMP(3),
  "buyer" TEXT,
  "supplierRef" TEXT,
  "paymentTerms" TEXT,
  "notes" TEXT,
  "closedAt" TIMESTAMP(3),
  "closeReason" TEXT,
  "canceledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX "PurchaseOrder_status_promisedAt_idx" ON "PurchaseOrder"("status", "promisedAt");
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PurchaseOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "variantId" TEXT,
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'un',
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitCostCents" INTEGER,
  "leadDays" INTEGER,
  "notes" TEXT,
  CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseOrderItem_orderId_idx" ON "PurchaseOrderItem"("orderId");
CREATE INDEX "PurchaseOrderItem_variantId_idx" ON "PurchaseOrderItem"("variantId");
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PurchaseOrderReceipt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "invoiceNumber" TEXT,
  "receivedBy" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrderReceipt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseOrderReceipt_orderId_idx" ON "PurchaseOrderReceipt"("orderId");
ALTER TABLE "PurchaseOrderReceipt" ADD CONSTRAINT "PurchaseOrderReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PurchaseOrderReceiptLine" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "PurchaseOrderReceiptLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseOrderReceiptLine_receiptId_idx" ON "PurchaseOrderReceiptLine"("receiptId");
CREATE INDEX "PurchaseOrderReceiptLine_itemId_idx" ON "PurchaseOrderReceiptLine"("itemId");
ALTER TABLE "PurchaseOrderReceiptLine" ADD CONSTRAINT "PurchaseOrderReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseOrderReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderReceiptLine" ADD CONSTRAINT "PurchaseOrderReceiptLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Histórico da OC: criação, mudança de data prometida (com motivo), entregas, encerramento, cancelamento.
CREATE TABLE "PurchaseOrderEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrderEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseOrderEvent_orderId_createdAt_idx" ON "PurchaseOrderEvent"("orderId", "createdAt");
ALTER TABLE "PurchaseOrderEvent" ADD CONSTRAINT "PurchaseOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
