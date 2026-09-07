-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentReceivedAt" TIMESTAMP(3);
