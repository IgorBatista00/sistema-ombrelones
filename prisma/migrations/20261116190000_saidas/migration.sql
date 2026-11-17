-- Financeiro: saídas (contas a pagar / custos) e anexos.
CREATE TYPE "ExpenseStatus" AS ENUM ('A_PAGAR', 'PAGA');
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payee" TEXT,
    "amountCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'A_PAGAR',
    "paidAt" TIMESTAMP(3),
    "paidCents" INTEGER,
    "method" TEXT,
    "note" TEXT,
    "seriesId" TEXT,
    "seriesLabel" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExpenseDocument" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "type" "FinanceDocType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ExpenseDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Expense_status_dueDate_idx" ON "Expense"("status", "dueDate");
CREATE INDEX "Expense_paidAt_idx" ON "Expense"("paidAt");
CREATE INDEX "Expense_seriesId_idx" ON "Expense"("seriesId");
CREATE UNIQUE INDEX "ExpenseDocument_storageKey_key" ON "ExpenseDocument"("storageKey");
CREATE INDEX "ExpenseDocument_expenseId_deletedAt_idx" ON "ExpenseDocument"("expenseId", "deletedAt");
ALTER TABLE "ExpenseDocument" ADD CONSTRAINT "ExpenseDocument_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
