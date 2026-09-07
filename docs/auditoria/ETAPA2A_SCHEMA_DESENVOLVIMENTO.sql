CREATE INDEX "Customer_cpf_idx" ON "Customer"("cpf");

CREATE INDEX "Customer_name_idx" ON "Customer"("name");

CREATE INDEX "Customer_whatsapp_idx" ON "Customer"("whatsapp");

CREATE INDEX "HistoricoOrdem_ordemId_idx" ON "HistoricoOrdem"("ordemId");

CREATE UNIQUE INDEX "OrderFinalization_serviceOrderId_key" ON "OrderFinalization"("serviceOrderId");

CREATE INDEX "OrderHistory_serviceOrderId_idx" ON "OrderHistory"("serviceOrderId");

CREATE INDEX "ProductSaleItem_productId_idx" ON "ProductSaleItem"("productId");

CREATE INDEX "ProductSaleItem_productName_idx" ON "ProductSaleItem"("productName");

CREATE INDEX "ProductSaleItem_saleId_idx" ON "ProductSaleItem"("saleId");

CREATE INDEX "ProductSale_customerId_idx" ON "ProductSale"("customerId");

CREATE INDEX "ProductSale_paymentMethod_idx" ON "ProductSale"("paymentMethod");

CREATE INDEX "ProductSale_saleNumber_idx" ON "ProductSale"("saleNumber");

CREATE UNIQUE INDEX "ProductSale_saleNumber_key" ON "ProductSale"("saleNumber");

CREATE INDEX "ProductSale_soldAt_idx" ON "ProductSale"("soldAt");

CREATE INDEX "ProductSale_status_idx" ON "ProductSale"("status");

CREATE INDEX "ProductSale_userName_idx" ON "ProductSale"("userName");

CREATE INDEX "Product_category_idx" ON "Product"("category");

CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

CREATE INDEX "Product_name_idx" ON "Product"("name");

CREATE INDEX "Product_sku_idx" ON "Product"("sku");

CREATE INDEX "Product_stockQuantity_idx" ON "Product"("stockQuantity");

CREATE INDEX "ServiceOrderAttachment_serviceOrderId_idx" ON "ServiceOrderAttachment"("serviceOrderId");

CREATE INDEX "ServiceOrderInternalNote_serviceOrderId_idx" ON "ServiceOrderInternalNote"("serviceOrderId");

CREATE INDEX "ServiceOrderPayment_serviceOrderId_idx" ON "ServiceOrderPayment"("serviceOrderId");

CREATE INDEX "ServiceOrder_brand_idx" ON "ServiceOrder"("brand");

CREATE INDEX "ServiceOrder_imei_idx" ON "ServiceOrder"("imei");

CREATE INDEX "ServiceOrder_model_idx" ON "ServiceOrder"("model");

CREATE INDEX "ServiceOrder_osNumber_idx" ON "ServiceOrder"("osNumber");

CREATE UNIQUE INDEX "ServiceOrder_osNumber_key" ON "ServiceOrder"("osNumber");

CREATE INDEX "ServiceOrder_serialNumber_idx" ON "ServiceOrder"("serialNumber");

CREATE INDEX "ServiceOrder_status_idx" ON "ServiceOrder"("status");

CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

CREATE INDEX "StockMovement_saleId_idx" ON "StockMovement"("saleId");

CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");

CREATE INDEX "StockMovement_userName_idx" ON "StockMovement"("userName");

CREATE INDEX "SystemUserPermission_key_idx" ON "SystemUserPermission"("key");

CREATE INDEX "SystemUserPermission_userId_idx" ON "SystemUserPermission"("userId");

CREATE UNIQUE INDEX "SystemUserPermission_userId_key_key" ON "SystemUserPermission"("userId", "key");

CREATE INDEX "SystemUser_email_idx" ON "SystemUser"("email");

CREATE INDEX "SystemUser_role_idx" ON "SystemUser"("role");

CREATE INDEX "SystemUser_status_idx" ON "SystemUser"("status");

CREATE INDEX "SystemUser_username_idx" ON "SystemUser"("username");

CREATE UNIQUE INDEX "SystemUser_username_key" ON "SystemUser"("username");

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "defaultOperator" TEXT DEFAULT 'Sistema',
    "productsModuleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "businessDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
    "businessOpenTime" TEXT NOT NULL DEFAULT '08:00',
    "businessCloseTime" TEXT NOT NULL DEFAULT '18:00',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "birthDate" DATETIME,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "HistoricoOrdem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ordemId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "descricao" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricoOrdem_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ServiceOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OrderFinalization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceOrderId" TEXT NOT NULL,
    "repairDescription" TEXT NOT NULL,
    "replacedParts" TEXT,
    "finalAmount" DECIMAL NOT NULL DEFAULT 0,
    "warrantyDays" INTEGER NOT NULL,
    "deliveredAt" DATETIME NOT NULL,
    "deliveredBy" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "finalNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderFinalization_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "OrderHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceOrderId" TEXT NOT NULL,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderHistory_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "salePrice" DECIMAL NOT NULL DEFAULT 0,
    "costPrice" DECIMAL NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL NOT NULL DEFAULT 0,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ProductSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleNumber" INTEGER NOT NULL,
    "soldAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT,
    "customerName" TEXT,
    "subtotalAmount" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "costAmount" DECIMAL NOT NULL DEFAULT 0,
    "profitAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONCLUIDA',
    "note" TEXT,
    "userName" TEXT NOT NULL DEFAULT 'Sistema',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ProductSaleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL NOT NULL DEFAULT 0,
    "subtotalAmount" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "costAmount" DECIMAL NOT NULL DEFAULT 0,
    "profitAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ProductSale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "osNumber" INTEGER NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDeliveryDate" DATETIME,
    "customerId" TEXT NOT NULL,
    "createdById" TEXT,
    "equipmentType" TEXT NOT NULL,
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
    "technicianResponsible" TEXT,
    "partsCost" DECIMAL NOT NULL DEFAULT 0,
    "laborCost" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "status" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "finalizedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "paymentPercent" INTEGER NOT NULL DEFAULT 0,
    "paymentReceivedAt" DATETIME,
    CONSTRAINT "ServiceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ServiceOrderAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceOrderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceOrderAttachment_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ServiceOrderInternalNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceOrderId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT 'Sistema',
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceOrderInternalNote_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ServiceOrderPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceOrderId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "percent" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "note" TEXT,
    "userName" TEXT NOT NULL DEFAULT 'Sistema',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceOrderPayment_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "saleId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "reason" TEXT,
    "userName" TEXT NOT NULL DEFAULT 'Sistema',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ProductSale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "SystemUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ATENDENTE',
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "SystemUserPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemUserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "SystemUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ATENDENTE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
