-- CreateTable
CREATE TABLE "ServiceOrderAttachment" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceOrderAttachment_serviceOrderId_idx" ON "ServiceOrderAttachment"("serviceOrderId");

-- AddForeignKey
ALTER TABLE "ServiceOrderAttachment" ADD CONSTRAINT "ServiceOrderAttachment_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
