-- CreateTable
CREATE TABLE "ServiceOrderPayment" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "percent" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "note" TEXT,
    "userName" TEXT NOT NULL DEFAULT 'Sistema',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceOrderPayment_serviceOrderId_idx" ON "ServiceOrderPayment"("serviceOrderId");

-- AddForeignKey
ALTER TABLE "ServiceOrderPayment" ADD CONSTRAINT "ServiceOrderPayment_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
