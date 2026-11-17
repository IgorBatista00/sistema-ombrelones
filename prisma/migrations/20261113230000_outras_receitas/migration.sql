-- Financeiro: outras receitas (sem venda ligada).
CREATE TYPE "OtherIncomeStatus" AS ENUM ('PREVISTA', 'RECEBIDA');
CREATE TABLE "OtherIncome" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "OtherIncomeStatus" NOT NULL DEFAULT 'RECEBIDA',
    "date" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OtherIncome_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OtherIncome_date_idx" ON "OtherIncome"("date");
CREATE INDEX "OtherIncome_status_date_idx" ON "OtherIncome"("status", "date");
