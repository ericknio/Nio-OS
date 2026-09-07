-- CreateTable
CREATE TABLE "ServiceOrderInternalNote" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT 'Sistema',
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderInternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceOrderInternalNote_serviceOrderId_idx" ON "ServiceOrderInternalNote"("serviceOrderId");

-- AddForeignKey
ALTER TABLE "ServiceOrderInternalNote" ADD CONSTRAINT "ServiceOrderInternalNote_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
