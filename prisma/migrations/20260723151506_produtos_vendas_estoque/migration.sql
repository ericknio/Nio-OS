-- CreateEnum
CREATE TYPE "ProductSaleStatus" AS ENUM ('CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE', 'VENDA', 'CANCELAMENTO_VENDA');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "salePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSale" (
    "id" TEXT NOT NULL,
    "saleNumber" SERIAL NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT,
    "customerName" TEXT,
    "subtotalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "profitAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "ProductSaleStatus" NOT NULL DEFAULT 'CONCLUIDA',
    "note" TEXT,
    "userName" TEXT NOT NULL DEFAULT 'Sistema',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "profitAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "saleId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "reason" TEXT,
    "userName" TEXT NOT NULL DEFAULT 'Sistema',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Product_stockQuantity_idx" ON "Product"("stockQuantity");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSale_saleNumber_key" ON "ProductSale"("saleNumber");

-- CreateIndex
CREATE INDEX "ProductSale_saleNumber_idx" ON "ProductSale"("saleNumber");

-- CreateIndex
CREATE INDEX "ProductSale_soldAt_idx" ON "ProductSale"("soldAt");

-- CreateIndex
CREATE INDEX "ProductSale_customerId_idx" ON "ProductSale"("customerId");

-- CreateIndex
CREATE INDEX "ProductSale_paymentMethod_idx" ON "ProductSale"("paymentMethod");

-- CreateIndex
CREATE INDEX "ProductSale_status_idx" ON "ProductSale"("status");

-- CreateIndex
CREATE INDEX "ProductSale_userName_idx" ON "ProductSale"("userName");

-- CreateIndex
CREATE INDEX "ProductSaleItem_saleId_idx" ON "ProductSaleItem"("saleId");

-- CreateIndex
CREATE INDEX "ProductSaleItem_productId_idx" ON "ProductSaleItem"("productId");

-- CreateIndex
CREATE INDEX "ProductSaleItem_productName_idx" ON "ProductSaleItem"("productName");

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_saleId_idx" ON "StockMovement"("saleId");

-- CreateIndex
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_userName_idx" ON "StockMovement"("userName");

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSaleItem" ADD CONSTRAINT "ProductSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ProductSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSaleItem" ADD CONSTRAINT "ProductSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ProductSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
