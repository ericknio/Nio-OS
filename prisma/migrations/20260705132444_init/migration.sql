-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TECNICO', 'ATENDENTE');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('NOTEBOOK', 'COMPUTADOR', 'CELULAR', 'TABLET', 'VIDEOGAME', 'IMPRESSORA', 'OUTRO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('DINHEIRO', 'PIX', 'CARTAO', 'PARCELADO', 'AGUARDANDO_PAGAMENTO');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RECEBIDO', 'EM_ANALISE', 'AGUARDANDO_PECA', 'EM_REPARO', 'PRONTO', 'ENTREGUE', 'CANCELADO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ATENDENTE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "birthDate" TIMESTAMP(3),
    "whatsapp" TEXT,
    "secondaryPhone" TEXT,
    "email" TEXT,
    "zipCode" TEXT,
    "address" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "osNumber" SERIAL NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDeliveryDate" TIMESTAMP(3),
    "customerId" TEXT NOT NULL,
    "createdById" TEXT,
    "equipmentType" "EquipmentType" NOT NULL,
    "equipmentOther" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "imei" TEXT,
    "devicePassword" TEXT,
    "deliveredAccessories" TEXT,
    "reportedDefect" TEXT NOT NULL,
    "technicalNotes" TEXT,
    "requiredParts" TEXT,
    "partsCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "status" "OrderStatus" NOT NULL DEFAULT 'RECEBIDO',
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFinalization" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "repairDescription" TEXT NOT NULL,
    "replacedParts" TEXT,
    "finalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "warrantyDays" INTEGER NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "deliveredBy" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "finalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderFinalization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderHistory" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "tradeName" TEXT,
    "cnpj" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563EB',
    "footerText" TEXT,
    "warrantyText" TEXT,
    "defaultWarrantyDays" INTEGER NOT NULL DEFAULT 90,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_cpf_idx" ON "Customer"("cpf");

-- CreateIndex
CREATE INDEX "Customer_whatsapp_idx" ON "Customer"("whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_osNumber_key" ON "ServiceOrder"("osNumber");

-- CreateIndex
CREATE INDEX "ServiceOrder_osNumber_idx" ON "ServiceOrder"("osNumber");

-- CreateIndex
CREATE INDEX "ServiceOrder_brand_idx" ON "ServiceOrder"("brand");

-- CreateIndex
CREATE INDEX "ServiceOrder_model_idx" ON "ServiceOrder"("model");

-- CreateIndex
CREATE INDEX "ServiceOrder_imei_idx" ON "ServiceOrder"("imei");

-- CreateIndex
CREATE INDEX "ServiceOrder_serialNumber_idx" ON "ServiceOrder"("serialNumber");

-- CreateIndex
CREATE INDEX "ServiceOrder_status_idx" ON "ServiceOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFinalization_serviceOrderId_key" ON "OrderFinalization"("serviceOrderId");

-- CreateIndex
CREATE INDEX "OrderHistory_serviceOrderId_idx" ON "OrderHistory"("serviceOrderId");

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFinalization" ADD CONSTRAINT "OrderFinalization_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHistory" ADD CONSTRAINT "OrderHistory_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
