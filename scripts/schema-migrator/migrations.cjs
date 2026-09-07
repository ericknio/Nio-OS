const crypto = require("node:crypto");

const CONTROL_TABLE = "NioSchemaMigration";
const BASELINE_ID = "20260728_000_baseline_sqlite";
const APP_VERSION = "0.1.1";

const BASE_TABLES = Object.freeze([
  "CompanySettings",
  "Customer",
  "HistoricoOrdem",
  "OrderFinalization",
  "OrderHistory",
  "Product",
  "ProductSale",
  "ProductSaleItem",
  "ServiceOrder",
  "ServiceOrderAttachment",
  "ServiceOrderInternalNote",
  "ServiceOrderPayment",
  "StockMovement",
  "SystemUser",
  "SystemUserPermission",
  "User",
]);

const BASELINE_SCHEMA_CHECKS = Object.freeze({
  ServiceOrder: {
    id: ["TEXT", true],
    osNumber: ["INTEGER", true],
    customerId: ["TEXT", true],
    equipmentType: ["TEXT", true],
    reportedDefect: ["TEXT", true],
    partsCost: ["DECIMAL", true, "0"],
    laborCost: ["DECIMAL", true, "0"],
    discount: ["DECIMAL", true, "0"],
    totalAmount: ["DECIMAL", true, "0"],
    paymentMethod: ["TEXT", true, "'AGUARDANDO_PAGAMENTO'"],
    status: ["TEXT", true, "'RECEBIDO'"],
    paidAmount: ["DECIMAL", true, "0"],
    paymentPercent: ["INTEGER", true, "0"],
    technicianResponsible: ["TEXT", false],
  },
  Customer: {
    id: ["TEXT", true],
    name: ["TEXT", true],
    cpf: ["TEXT", false],
    whatsapp: ["TEXT", false],
    createdAt: ["DATETIME", true, "CURRENT_TIMESTAMP"],
    updatedAt: ["DATETIME", true],
  },
  SystemUser: {
    id: ["TEXT", true],
    name: ["TEXT", true],
    username: ["TEXT", true],
    passwordHash: ["TEXT", true],
    role: ["TEXT", true, "'ATENDENTE'"],
    status: ["TEXT", true, "'ATIVO'"],
  },
  SystemUserPermission: {
    id: ["TEXT", true],
    userId: ["TEXT", true],
    key: ["TEXT", true],
    createdAt: ["DATETIME", true, "CURRENT_TIMESTAMP"],
  },
  Product: {
    id: ["TEXT", true],
    name: ["TEXT", true],
    salePrice: ["DECIMAL", true, "0"],
    costPrice: ["DECIMAL", true, "0"],
    taxPercent: ["DECIMAL", true, "0"],
    stockQuantity: ["INTEGER", true, "0"],
    minStock: ["INTEGER", true, "0"],
    isActive: ["BOOLEAN", true, "true"],
  },
  ProductSale: {
    id: ["TEXT", true],
    saleNumber: ["INTEGER", true],
    subtotalAmount: ["DECIMAL", true, "0"],
    discount: ["DECIMAL", true, "0"],
    taxAmount: ["DECIMAL", true, "0"],
    costAmount: ["DECIMAL", true, "0"],
    profitAmount: ["DECIMAL", true, "0"],
    totalAmount: ["DECIMAL", true, "0"],
    paymentMethod: ["TEXT", true],
    status: ["TEXT", true, "'CONCLUIDA'"],
  },
  ProductSaleItem: {
    id: ["TEXT", true],
    saleId: ["TEXT", true],
    productId: ["TEXT", false],
    productName: ["TEXT", true],
    quantity: ["INTEGER", true],
    unitPrice: ["DECIMAL", true, "0"],
    unitCost: ["DECIMAL", true, "0"],
    totalAmount: ["DECIMAL", true, "0"],
  },
  StockMovement: {
    id: ["TEXT", true],
    productId: ["TEXT", true],
    saleId: ["TEXT", false],
    type: ["TEXT", true],
    quantity: ["INTEGER", true],
    previousStock: ["INTEGER", true],
    newStock: ["INTEGER", true],
  },
  CompanySettings: {
    id: ["TEXT", true],
    companyName: ["TEXT", true],
    defaultOperator: ["TEXT", false, "'Sistema'"],
    productsModuleEnabled: ["BOOLEAN", true, "true"],
    businessDays: ["TEXT", true, "'1,2,3,4,5,6'"],
    businessOpenTime: ["TEXT", true, "'08:00'"],
    businessCloseTime: ["TEXT", true, "'18:00'"],
  },
});

const BASELINE_SQL = `
CREATE TABLE "NioSchemaMigration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "checksum" TEXT NOT NULL,
  "appVersion" TEXT NOT NULL,
  "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const TECHNICAL_PARTS_SQL = `
CREATE TEMP TABLE "_Etapa3bCounts" (
  "productCount" INTEGER NOT NULL,
  "productSaleItemRefs" INTEGER NOT NULL,
  "stockMovementCount" INTEGER NOT NULL
);

INSERT INTO "_Etapa3bCounts"
SELECT
  (SELECT COUNT(*) FROM "Product"),
  (SELECT COUNT(*) FROM "ProductSaleItem" WHERE "productId" IS NOT NULL),
  (SELECT COUNT(*) FROM "StockMovement");

CREATE TABLE "new_Product" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "category" TEXT,
  "description" TEXT,
  "imageUrl" TEXT,
  "salePrice" DECIMAL NOT NULL DEFAULT 0,
  "costPrice" DECIMAL NOT NULL DEFAULT 0,
  "taxPercent" DECIMAL NOT NULL DEFAULT 0,
  "stockQuantity" INTEGER CHECK ("stockQuantity" IS NULL OR "stockQuantity" >= 0),
  "minStock" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Product" (
  "id", "name", "sku", "category", "description", "imageUrl",
  "salePrice", "costPrice", "taxPercent", "stockQuantity", "minStock",
  "isActive", "createdAt", "updatedAt"
)
SELECT
  "id", "name", "sku", "category", "description", "imageUrl",
  "salePrice", "costPrice", "taxPercent",
  CASE WHEN "stockQuantity" = 0 THEN NULL ELSE "stockQuantity" END,
  "minStock", "isActive", "createdAt", "updatedAt"
FROM "Product";

-- TEST_POINT_AFTER_PRODUCT_COPY

CREATE TEMP TABLE "_Etapa3bGuard" (
  "ok" INTEGER NOT NULL CHECK ("ok" = 1)
);

INSERT INTO "_Etapa3bGuard" ("ok")
SELECT CASE WHEN
  (SELECT COUNT(*) FROM "new_Product") = (SELECT "productCount" FROM "_Etapa3bCounts")
  AND NOT EXISTS (
    SELECT 1 FROM "new_Product"
    WHERE "stockQuantity" IS NOT NULL AND "stockQuantity" < 0
  )
THEN 1 ELSE 0 END;

DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";

-- TEST_POINT_AFTER_PRODUCT_RENAME

CREATE INDEX "Product_name_idx" ON "Product"("name");
CREATE INDEX "Product_sku_idx" ON "Product"("sku");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");
CREATE INDEX "Product_stockQuantity_idx" ON "Product"("stockQuantity");

CREATE TABLE "new_StockMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "saleId" TEXT,
  "type" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "previousStock" INTEGER,
  "newStock" INTEGER,
  "reason" TEXT,
  "userName" TEXT NOT NULL DEFAULT 'Sistema',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "ProductSale" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_StockMovement" (
  "id", "productId", "saleId", "type", "quantity", "previousStock",
  "newStock", "reason", "userName", "createdAt"
)
SELECT
  "id", "productId", "saleId", "type", "quantity", "previousStock",
  "newStock", "reason", "userName", "createdAt"
FROM "StockMovement";

INSERT INTO "_Etapa3bGuard" ("ok")
SELECT CASE WHEN
  (SELECT COUNT(*) FROM "new_StockMovement") = (SELECT "stockMovementCount" FROM "_Etapa3bCounts")
THEN 1 ELSE 0 END;

DROP TABLE "StockMovement";
ALTER TABLE "new_StockMovement" RENAME TO "StockMovement";

CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");
CREATE INDEX "StockMovement_saleId_idx" ON "StockMovement"("saleId");
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");
CREATE INDEX "StockMovement_userName_idx" ON "StockMovement"("userName");

INSERT INTO "_Etapa3bGuard" ("ok")
SELECT CASE WHEN
  (SELECT COUNT(*) FROM "Product") = (SELECT "productCount" FROM "_Etapa3bCounts")
  AND (SELECT COUNT(*) FROM "ProductSaleItem" WHERE "productId" IS NOT NULL) =
      (SELECT "productSaleItemRefs" FROM "_Etapa3bCounts")
  AND (SELECT COUNT(*) FROM "StockMovement") =
      (SELECT "stockMovementCount" FROM "_Etapa3bCounts")
  AND NOT EXISTS (
    SELECT 1 FROM "ProductSaleItem" i
    WHERE i."productId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = i."productId")
  )
  AND NOT EXISTS (
    SELECT 1 FROM "StockMovement" m
    WHERE NOT EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = m."productId")
  )
THEN 1 ELSE 0 END;

CREATE TABLE "TechnicalPart" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL CHECK (length(trim("name")) > 0),
  "sku" TEXT,
  "category" TEXT,
  "brand" TEXT,
  "compatibleModel" TEXT,
  "description" TEXT,
  "location" TEXT,
  "notes" TEXT,
  "quantityOnHand" INTEGER CHECK ("quantityOnHand" IS NULL OR "quantityOnHand" >= 0),
  "quantityReserved" INTEGER NOT NULL DEFAULT 0
    CHECK ("quantityReserved" >= 0 AND ("quantityOnHand" IS NULL OR "quantityReserved" <= "quantityOnHand")),
  "minStock" INTEGER NOT NULL DEFAULT 0 CHECK ("minStock" >= 0),
  "currentCostPrice" DECIMAL NOT NULL DEFAULT 0 CHECK ("currentCostPrice" >= 0),
  "defaultSalePrice" DECIMAL NOT NULL DEFAULT 0 CHECK ("defaultSalePrice" >= 0),
  "isActive" BOOLEAN NOT NULL DEFAULT true CHECK ("isActive" IN (0, 1)),
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ServiceOrderPart" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "serviceOrderId" TEXT NOT NULL,
  "technicalPartId" TEXT NOT NULL,
  "partNameSnapshot" TEXT NOT NULL CHECK (length(trim("partNameSnapshot")) > 0),
  "partSkuSnapshot" TEXT,
  "unitCostSnapshot" DECIMAL NOT NULL CHECK ("unitCostSnapshot" >= 0),
  "unitPriceSnapshot" DECIMAL NOT NULL CHECK ("unitPriceSnapshot" >= 0),
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "totalCostSnapshot" DECIMAL NOT NULL
    CHECK ("totalCostSnapshot" >= 0 AND abs("totalCostSnapshot" - round("unitCostSnapshot" * "quantity", 2)) < 0.005),
  "totalPriceSnapshot" DECIMAL NOT NULL
    CHECK ("totalPriceSnapshot" >= 0 AND abs("totalPriceSnapshot" - round("unitPriceSnapshot" * "quantity", 2)) < 0.005),
  "state" TEXT NOT NULL DEFAULT 'RESERVED'
    CHECK ("state" IN ('RESERVED', 'CONSUMED', 'RELEASED', 'REVERSED')),
  "reservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" DATETIME,
  "releasedAt" DATETIME,
  "reversedAt" DATETIME,
  "responsibleUserId" TEXT,
  "responsibleUserNameSnapshot" TEXT NOT NULL
    CHECK (length(trim("responsibleUserNameSnapshot")) > 0),
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ServiceOrderPart_serviceOrderId_fkey"
    FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderPart_technicalPartId_fkey"
    FOREIGN KEY ("technicalPartId") REFERENCES "TechnicalPart" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderPart_responsibleUserId_fkey"
    FOREIGN KEY ("responsibleUserId") REFERENCES "SystemUser" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CHECK (
    ("state" = 'RESERVED' AND "consumedAt" IS NULL AND "releasedAt" IS NULL AND "reversedAt" IS NULL) OR
    ("state" = 'CONSUMED' AND "consumedAt" IS NOT NULL AND "releasedAt" IS NULL AND "reversedAt" IS NULL) OR
    ("state" = 'RELEASED' AND "consumedAt" IS NULL AND "releasedAt" IS NOT NULL AND "reversedAt" IS NULL) OR
    ("state" = 'REVERSED' AND "consumedAt" IS NOT NULL AND "releasedAt" IS NULL AND "reversedAt" IS NOT NULL)
  ),
  CHECK ("consumedAt" IS NULL OR "consumedAt" >= "reservedAt"),
  CHECK ("releasedAt" IS NULL OR "releasedAt" >= "reservedAt"),
  CHECK ("reversedAt" IS NULL OR ("consumedAt" IS NOT NULL AND "reversedAt" >= "consumedAt"))
);

-- TEST_POINT_AFTER_SECOND_TECHNICAL_TABLE

CREATE TABLE "TechnicalPartMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "technicalPartId" TEXT NOT NULL,
  "serviceOrderPartId" TEXT,
  "type" TEXT NOT NULL
    CHECK ("type" IN ('ENTRY', 'POSITIVE_ADJUSTMENT', 'NEGATIVE_ADJUSTMENT', 'RESERVATION', 'RESERVATION_INCREASE', 'RESERVATION_DECREASE', 'RELEASE', 'CONSUMPTION', 'MANUAL_REVERSAL', 'STOCK_MODE_CHANGE')),
  "quantity" INTEGER NOT NULL
    CHECK (("type" = 'STOCK_MODE_CHANGE' AND "quantity" >= 0) OR ("type" <> 'STOCK_MODE_CHANGE' AND "quantity" > 0)),
  "onHandBefore" INTEGER CHECK ("onHandBefore" IS NULL OR "onHandBefore" >= 0),
  "onHandAfter" INTEGER CHECK ("onHandAfter" IS NULL OR "onHandAfter" >= 0),
  "reservedBefore" INTEGER NOT NULL
    CHECK ("reservedBefore" >= 0 AND ("onHandBefore" IS NULL OR "reservedBefore" <= "onHandBefore")),
  "reservedAfter" INTEGER NOT NULL
    CHECK ("reservedAfter" >= 0 AND ("onHandAfter" IS NULL OR "reservedAfter" <= "onHandAfter")),
  "unitCostSnapshot" DECIMAL CHECK ("unitCostSnapshot" IS NULL OR "unitCostSnapshot" >= 0),
  "reason" TEXT,
  "operatorId" TEXT,
  "operatorNameSnapshot" TEXT NOT NULL CHECK (length(trim("operatorNameSnapshot")) > 0),
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TechnicalPartMovement_technicalPartId_fkey"
    FOREIGN KEY ("technicalPartId") REFERENCES "TechnicalPart" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TechnicalPartMovement_serviceOrderPartId_fkey"
    FOREIGN KEY ("serviceOrderPartId") REFERENCES "ServiceOrderPart" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TechnicalPartMovement_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "SystemUser" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CHECK (
    ("type" IN ('POSITIVE_ADJUSTMENT', 'NEGATIVE_ADJUSTMENT', 'MANUAL_REVERSAL', 'STOCK_MODE_CHANGE')
      AND length(trim(coalesce("reason", ''))) > 0)
    OR "type" NOT IN ('POSITIVE_ADJUSTMENT', 'NEGATIVE_ADJUSTMENT', 'MANUAL_REVERSAL', 'STOCK_MODE_CHANGE')
  ),
  CHECK (
    ("type" IN ('ENTRY', 'POSITIVE_ADJUSTMENT')
      AND "onHandBefore" IS NOT NULL
      AND "onHandAfter" = "onHandBefore" + "quantity"
      AND "reservedAfter" = "reservedBefore") OR
    ("type" = 'NEGATIVE_ADJUSTMENT'
      AND "onHandBefore" IS NOT NULL
      AND "onHandAfter" = "onHandBefore" - "quantity"
      AND "reservedAfter" = "reservedBefore") OR
    ("type" IN ('RESERVATION', 'RESERVATION_INCREASE')
      AND "onHandAfter" IS "onHandBefore"
      AND "reservedAfter" = "reservedBefore" + "quantity") OR
    ("type" IN ('RESERVATION_DECREASE', 'RELEASE')
      AND "onHandAfter" IS "onHandBefore"
      AND "reservedAfter" = "reservedBefore" - "quantity") OR
    ("type" = 'CONSUMPTION'
      AND (("onHandBefore" IS NULL AND "onHandAfter" IS NULL) OR "onHandAfter" = "onHandBefore" - "quantity")
      AND "reservedAfter" = "reservedBefore" - "quantity") OR
    ("type" = 'MANUAL_REVERSAL'
      AND (("onHandBefore" IS NULL AND "onHandAfter" IS NULL) OR "onHandAfter" = "onHandBefore" + "quantity")
      AND "reservedAfter" = "reservedBefore") OR
    ("type" = 'STOCK_MODE_CHANGE'
      AND "reservedBefore" = 0 AND "reservedAfter" = 0
      AND (("onHandBefore" IS NULL AND "onHandAfter" IS NOT NULL AND "onHandAfter" = "quantity")
        OR ("onHandBefore" IS NOT NULL AND "onHandAfter" IS NULL)))
  )
);

CREATE UNIQUE INDEX "TechnicalPart_sku_key_nocase"
  ON "TechnicalPart"("sku" COLLATE NOCASE) WHERE "sku" IS NOT NULL;
CREATE INDEX "TechnicalPart_name_idx" ON "TechnicalPart"("name");
CREATE INDEX "TechnicalPart_category_idx" ON "TechnicalPart"("category");
CREATE INDEX "TechnicalPart_brand_idx" ON "TechnicalPart"("brand");
CREATE INDEX "TechnicalPart_compatibleModel_idx" ON "TechnicalPart"("compatibleModel");
CREATE INDEX "TechnicalPart_isActive_idx" ON "TechnicalPart"("isActive");
CREATE INDEX "TechnicalPart_location_idx" ON "TechnicalPart"("location");
CREATE INDEX "TechnicalPart_updatedAt_idx" ON "TechnicalPart"("updatedAt");

CREATE INDEX "ServiceOrderPart_serviceOrderId_state_idx"
  ON "ServiceOrderPart"("serviceOrderId", "state");
CREATE INDEX "ServiceOrderPart_technicalPartId_state_idx"
  ON "ServiceOrderPart"("technicalPartId", "state");
CREATE UNIQUE INDEX "ServiceOrderPart_active_order_part_key"
  ON "ServiceOrderPart"("serviceOrderId", "technicalPartId")
  WHERE "state" IN ('RESERVED', 'CONSUMED');
CREATE INDEX "ServiceOrderPart_reservedAt_idx" ON "ServiceOrderPart"("reservedAt");
CREATE INDEX "ServiceOrderPart_consumedAt_idx" ON "ServiceOrderPart"("consumedAt");
CREATE INDEX "ServiceOrderPart_responsibleUserId_idx" ON "ServiceOrderPart"("responsibleUserId");

CREATE INDEX "TechnicalPartMovement_part_created_idx"
  ON "TechnicalPartMovement"("technicalPartId", "createdAt");
CREATE INDEX "TechnicalPartMovement_item_created_idx"
  ON "TechnicalPartMovement"("serviceOrderPartId", "createdAt");
CREATE INDEX "TechnicalPartMovement_type_created_idx"
  ON "TechnicalPartMovement"("type", "createdAt");
CREATE INDEX "TechnicalPartMovement_operatorId_idx"
  ON "TechnicalPartMovement"("operatorId");

CREATE TRIGGER "TechnicalPart_normalize_sku_insert"
AFTER INSERT ON "TechnicalPart"
WHEN NEW."sku" IS NOT NULL
 AND (
   NEW."sku" <> trim(NEW."sku")
   OR NEW."sku" = ''
 )
BEGIN
  UPDATE "TechnicalPart"
  SET "sku" = NULLIF(trim(NEW."sku"), '')
  WHERE "id" = NEW."id";
END;

CREATE TRIGGER "TechnicalPart_normalize_sku_update"
AFTER UPDATE OF "sku" ON "TechnicalPart"
WHEN NEW."sku" IS NOT NULL
 AND (
   NEW."sku" <> trim(NEW."sku")
   OR NEW."sku" = ''
 )
BEGIN
  UPDATE "TechnicalPart"
  SET "sku" = NULLIF(trim(NEW."sku"), '')
  WHERE "id" = NEW."id";
END;

DROP TABLE "_Etapa3bGuard";
DROP TABLE "_Etapa3bCounts";
`;

const TECHNICAL_PART_COMMAND_LOG_SQL = `
CREATE TABLE "TechnicalPartCommandLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "logicalKey" TEXT NOT NULL CHECK (length(trim("logicalKey")) > 0),
  "payloadHash" TEXT NOT NULL
    CHECK (length("payloadHash") = 64 AND "payloadHash" NOT GLOB '*[^0-9a-f]*'),
  "operation" TEXT NOT NULL
    CHECK ("operation" IN ('CREATE', 'UPDATE_METADATA', 'DEACTIVATE', 'REACTIVATE')),
  "technicalPartId" TEXT NOT NULL,
  "operatorId" TEXT,
  "operatorNameSnapshot" TEXT NOT NULL
    CHECK (length(trim("operatorNameSnapshot")) > 0),
  "reason" TEXT CHECK ("reason" IS NULL OR length(trim("reason")) > 0),
  "resultVersion" INTEGER NOT NULL CHECK ("resultVersion" >= 0),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TechnicalPartCommandLog_technicalPartId_fkey"
    FOREIGN KEY ("technicalPartId") REFERENCES "TechnicalPart" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TechnicalPartCommandLog_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "SystemUser" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TechnicalPartCommandLog_logicalKey_key"
  ON "TechnicalPartCommandLog"("logicalKey");
CREATE INDEX "TechnicalPartCommandLog_technicalPartId_idx"
  ON "TechnicalPartCommandLog"("technicalPartId");
CREATE INDEX "TechnicalPartCommandLog_operation_idx"
  ON "TechnicalPartCommandLog"("operation");
CREATE INDEX "TechnicalPartCommandLog_operatorId_idx"
  ON "TechnicalPartCommandLog"("operatorId");
CREATE INDEX "TechnicalPartCommandLog_createdAt_idx"
  ON "TechnicalPartCommandLog"("createdAt");
`;

const SERVICE_ORDER_TECHNICAL_COMMAND_LOG_SQL = `
CREATE TABLE "ServiceOrderTechnicalCommandLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "logicalKey" TEXT NOT NULL CHECK (length(trim("logicalKey")) > 0),
  "payloadHash" TEXT NOT NULL
    CHECK (length("payloadHash") = 64 AND "payloadHash" NOT GLOB '*[^0-9a-f]*'),
  "operation" TEXT NOT NULL
    CHECK ("operation" IN ('CONSUME_ON_READY', 'RELEASE_ON_CANCEL', 'MANUAL_REVERSAL')),
  "serviceOrderId" TEXT NOT NULL,
  "operatorId" TEXT,
  "operatorNameSnapshot" TEXT NOT NULL
    CHECK (length(trim("operatorNameSnapshot")) > 0),
  "affectedItems" INTEGER NOT NULL CHECK ("affectedItems" >= 0),
  "resultOrderStatus" TEXT NOT NULL CHECK (length(trim("resultOrderStatus")) > 0),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOrderTechnicalCommandLog_serviceOrderId_fkey"
    FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderTechnicalCommandLog_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "SystemUser" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ServiceOrderTechnicalCommandLog_logicalKey_key"
  ON "ServiceOrderTechnicalCommandLog"("logicalKey");
CREATE INDEX "ServiceOrderTechnicalCommandLog_serviceOrderId_idx"
  ON "ServiceOrderTechnicalCommandLog"("serviceOrderId");
CREATE INDEX "ServiceOrderTechnicalCommandLog_operation_idx"
  ON "ServiceOrderTechnicalCommandLog"("operation");
CREATE INDEX "ServiceOrderTechnicalCommandLog_operatorId_idx"
  ON "ServiceOrderTechnicalCommandLog"("operatorId");
CREATE INDEX "ServiceOrderTechnicalCommandLog_createdAt_idx"
  ON "ServiceOrderTechnicalCommandLog"("createdAt");
`;


const TECHNICIAN_PROFIT_SHARE_SQL = `
ALTER TABLE "SystemUser"
  ADD COLUMN "profitShareEnabled" BOOLEAN NOT NULL DEFAULT false
  CHECK ("profitShareEnabled" IN (0, 1));

ALTER TABLE "SystemUser"
  ADD COLUMN "profitSharePercent" DECIMAL NOT NULL DEFAULT 0
  CHECK ("profitSharePercent" >= 0 AND "profitSharePercent" <= 100);

ALTER TABLE "ServiceOrder"
  ADD COLUMN "technicianUserId" TEXT
  REFERENCES "SystemUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceOrder"
  ADD COLUMN "technicianProfitPercentSnapshot" DECIMAL
  CHECK (
    "technicianProfitPercentSnapshot" IS NULL OR
    ("technicianProfitPercentSnapshot" >= 0 AND "technicianProfitPercentSnapshot" <= 100)
  );

CREATE INDEX "ServiceOrder_technicianUserId_idx"
  ON "ServiceOrder"("technicianUserId");
`;

const ATTENDANT_PDV_PROFIT_SHARE_SQL = `
ALTER TABLE "SystemUser"
  ADD COLUMN "pdvProfitShareEnabled" BOOLEAN NOT NULL DEFAULT false
  CHECK ("pdvProfitShareEnabled" IN (0, 1));

ALTER TABLE "SystemUser"
  ADD COLUMN "pdvProfitSharePercent" DECIMAL NOT NULL DEFAULT 0
  CHECK ("pdvProfitSharePercent" >= 0 AND "pdvProfitSharePercent" <= 100);

ALTER TABLE "ProductSale"
  ADD COLUMN "attendantUserId" TEXT
  REFERENCES "SystemUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductSale"
  ADD COLUMN "attendantProfitPercentSnapshot" DECIMAL
  CHECK (
    "attendantProfitPercentSnapshot" IS NULL OR
    ("attendantProfitPercentSnapshot" >= 0 AND "attendantProfitPercentSnapshot" <= 100)
  );

ALTER TABLE "ProductSale"
  ADD COLUMN "attendantProfitShare" DECIMAL NOT NULL DEFAULT 0
  CHECK ("attendantProfitShare" >= 0);

CREATE INDEX "ProductSale_attendantUserId_idx"
  ON "ProductSale"("attendantUserId");
`;

function normalizeSql(sql) {
  return String(sql)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function checksumPayload(migration) {
  return {
    alteredTables: migration.alteredTables || [],
    appVersion: migration.appVersion,
    id: migration.id,
    ownedTables: migration.ownedTables || [],
    requiresForeignKeysOff: Boolean(migration.requiresForeignKeysOff),
    requiredTables: migration.requiredTables || [],
    schemaChecks: migration.schemaChecks || {},
    structureChecks: migration.structureChecks || {},
    sql: normalizeSql(migration.sql),
  };
}

function migrationChecksum(migration) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(checksumPayload(migration))), "utf8")
    .digest("hex");
}

function defineMigration(definition) {
  const migration = {
    ...definition,
    sql: normalizeSql(definition.sql),
    ownedTables: Object.freeze([...(definition.ownedTables || [])]),
    alteredTables: Object.freeze([...(definition.alteredTables || [])]),
    requiredTables: Object.freeze([...(definition.requiredTables || [])]),
    schemaChecks: Object.freeze({ ...(definition.schemaChecks || {}) }),
    structureChecks: Object.freeze({ ...(definition.structureChecks || {}) }),
    requiresForeignKeysOff: Boolean(definition.requiresForeignKeysOff),
  };
  migration.checksum = migrationChecksum(migration);
  return Object.freeze(migration);
}

const migrations = Object.freeze([
  defineMigration({
    id: BASELINE_ID,
    appVersion: APP_VERSION,
    description: "Baseline do schema SQLite atual do Nio-OS",
    sql: BASELINE_SQL,
    kind: "baseline",
    ownedTables: [],
    requiredTables: BASE_TABLES,
    schemaChecks: BASELINE_SCHEMA_CHECKS,
  }),
  defineMigration({
    id: "20260804_001_technical_parts",
    appVersion: APP_VERSION,
    description: "Estoque técnico e regra unificada NULL = ilimitado",
    sql: TECHNICAL_PARTS_SQL,
    kind: "migration",
    ownedTables: ["TechnicalPart", "ServiceOrderPart", "TechnicalPartMovement"],
    alteredTables: ["Product", "StockMovement"],
    requiredTables: ["Product", "ProductSaleItem", "ProductSale", "StockMovement", "ServiceOrder", "SystemUser"],
    requiresForeignKeysOff: true,
    schemaChecks: {
      Product: {
        id: ["TEXT", true], name: ["TEXT", true], sku: ["TEXT", false],
        category: ["TEXT", false], description: ["TEXT", false], imageUrl: ["TEXT", false],
        salePrice: ["DECIMAL", true, "0"], costPrice: ["DECIMAL", true, "0"],
        taxPercent: ["DECIMAL", true, "0"], stockQuantity: ["INTEGER", false],
        minStock: ["INTEGER", true, "0"], isActive: ["BOOLEAN", true, "true"],
        createdAt: ["DATETIME", true, "CURRENT_TIMESTAMP"], updatedAt: ["DATETIME", true],
      },
      StockMovement: {
        id: ["TEXT", true], productId: ["TEXT", true], saleId: ["TEXT", false],
        type: ["TEXT", true], quantity: ["INTEGER", true],
        previousStock: ["INTEGER", false], newStock: ["INTEGER", false],
        reason: ["TEXT", false], userName: ["TEXT", true, "'Sistema'"],
        createdAt: ["DATETIME", true, "CURRENT_TIMESTAMP"],
      },
      TechnicalPart: {
        id: ["TEXT", true], name: ["TEXT", true], sku: ["TEXT", false],
        category: ["TEXT", false], brand: ["TEXT", false], compatibleModel: ["TEXT", false],
        description: ["TEXT", false], location: ["TEXT", false], notes: ["TEXT", false],
        quantityOnHand: ["INTEGER", false], quantityReserved: ["INTEGER", true, "0"],
        minStock: ["INTEGER", true, "0"], currentCostPrice: ["DECIMAL", true, "0"],
        defaultSalePrice: ["DECIMAL", true, "0"], isActive: ["BOOLEAN", true, "true"],
        version: ["INTEGER", true, "0"], createdAt: ["DATETIME", true, "CURRENT_TIMESTAMP"],
        updatedAt: ["DATETIME", true],
      },
      ServiceOrderPart: {
        id: ["TEXT", true], serviceOrderId: ["TEXT", true], technicalPartId: ["TEXT", true],
        partNameSnapshot: ["TEXT", true], partSkuSnapshot: ["TEXT", false],
        unitCostSnapshot: ["DECIMAL", true], unitPriceSnapshot: ["DECIMAL", true],
        quantity: ["INTEGER", true], totalCostSnapshot: ["DECIMAL", true],
        totalPriceSnapshot: ["DECIMAL", true], state: ["TEXT", true, "'RESERVED'"],
        reservedAt: ["DATETIME", true, "CURRENT_TIMESTAMP"], consumedAt: ["DATETIME", false],
        releasedAt: ["DATETIME", false], reversedAt: ["DATETIME", false],
        responsibleUserId: ["TEXT", false], responsibleUserNameSnapshot: ["TEXT", true],
        idempotencyKey: ["TEXT", true], createdAt: ["DATETIME", true, "CURRENT_TIMESTAMP"],
        updatedAt: ["DATETIME", true],
      },
      TechnicalPartMovement: {
        id: ["TEXT", true], technicalPartId: ["TEXT", true], serviceOrderPartId: ["TEXT", false],
        type: ["TEXT", true], quantity: ["INTEGER", true], onHandBefore: ["INTEGER", false],
        onHandAfter: ["INTEGER", false], reservedBefore: ["INTEGER", true],
        reservedAfter: ["INTEGER", true], unitCostSnapshot: ["DECIMAL", false],
        reason: ["TEXT", false], operatorId: ["TEXT", false], operatorNameSnapshot: ["TEXT", true],
        idempotencyKey: ["TEXT", true], createdAt: ["DATETIME", true, "CURRENT_TIMESTAMP"],
      },
    },
    structureChecks: {
      foreignKeys: [
        ["StockMovement", "productId", "Product", "id", "CASCADE", "CASCADE"],
        ["StockMovement", "saleId", "ProductSale", "id", "SET NULL", "CASCADE"],
        ["ServiceOrderPart", "serviceOrderId", "ServiceOrder", "id", "RESTRICT", "CASCADE"],
        ["ServiceOrderPart", "technicalPartId", "TechnicalPart", "id", "RESTRICT", "CASCADE"],
        ["ServiceOrderPart", "responsibleUserId", "SystemUser", "id", "SET NULL", "CASCADE"],
        ["TechnicalPartMovement", "technicalPartId", "TechnicalPart", "id", "RESTRICT", "CASCADE"],
        ["TechnicalPartMovement", "serviceOrderPartId", "ServiceOrderPart", "id", "RESTRICT", "CASCADE"],
        ["TechnicalPartMovement", "operatorId", "SystemUser", "id", "SET NULL", "CASCADE"],
      ],
      indexes: [
        ["Product_name_idx", "Product", false, false, [["name", "BINARY"]]],
        ["Product_sku_idx", "Product", false, false, [["sku", "BINARY"]]],
        ["Product_category_idx", "Product", false, false, [["category", "BINARY"]]],
        ["Product_isActive_idx", "Product", false, false, [["isActive", "BINARY"]]],
        ["Product_stockQuantity_idx", "Product", false, false, [["stockQuantity", "BINARY"]]],
        ["StockMovement_productId_idx", "StockMovement", false, false, [["productId", "BINARY"]]],
        ["StockMovement_saleId_idx", "StockMovement", false, false, [["saleId", "BINARY"]]],
        ["StockMovement_type_idx", "StockMovement", false, false, [["type", "BINARY"]]],
        ["StockMovement_createdAt_idx", "StockMovement", false, false, [["createdAt", "BINARY"]]],
        ["StockMovement_userName_idx", "StockMovement", false, false, [["userName", "BINARY"]]],
        ["TechnicalPart_sku_key_nocase", "TechnicalPart", true, true, [["sku", "NOCASE"]], "where \"sku\" is not null"],
        ["TechnicalPart_name_idx", "TechnicalPart", false, false, [["name", "BINARY"]]],
        ["TechnicalPart_category_idx", "TechnicalPart", false, false, [["category", "BINARY"]]],
        ["TechnicalPart_brand_idx", "TechnicalPart", false, false, [["brand", "BINARY"]]],
        ["TechnicalPart_compatibleModel_idx", "TechnicalPart", false, false, [["compatibleModel", "BINARY"]]],
        ["TechnicalPart_isActive_idx", "TechnicalPart", false, false, [["isActive", "BINARY"]]],
        ["TechnicalPart_location_idx", "TechnicalPart", false, false, [["location", "BINARY"]]],
        ["TechnicalPart_updatedAt_idx", "TechnicalPart", false, false, [["updatedAt", "BINARY"]]],
        ["ServiceOrderPart_serviceOrderId_state_idx", "ServiceOrderPart", false, false, [["serviceOrderId", "BINARY"], ["state", "BINARY"]]],
        ["ServiceOrderPart_technicalPartId_state_idx", "ServiceOrderPart", false, false, [["technicalPartId", "BINARY"], ["state", "BINARY"]]],
        ["ServiceOrderPart_active_order_part_key", "ServiceOrderPart", true, true, [["serviceOrderId", "BINARY"], ["technicalPartId", "BINARY"]], "where \"state\" in ('reserved', 'consumed')"],
        ["ServiceOrderPart_reservedAt_idx", "ServiceOrderPart", false, false, [["reservedAt", "BINARY"]]],
        ["ServiceOrderPart_consumedAt_idx", "ServiceOrderPart", false, false, [["consumedAt", "BINARY"]]],
        ["ServiceOrderPart_responsibleUserId_idx", "ServiceOrderPart", false, false, [["responsibleUserId", "BINARY"]]],
        ["TechnicalPartMovement_part_created_idx", "TechnicalPartMovement", false, false, [["technicalPartId", "BINARY"], ["createdAt", "BINARY"]]],
        ["TechnicalPartMovement_item_created_idx", "TechnicalPartMovement", false, false, [["serviceOrderPartId", "BINARY"], ["createdAt", "BINARY"]]],
        ["TechnicalPartMovement_type_created_idx", "TechnicalPartMovement", false, false, [["type", "BINARY"], ["createdAt", "BINARY"]]],
        ["TechnicalPartMovement_operatorId_idx", "TechnicalPartMovement", false, false, [["operatorId", "BINARY"]]],
      ],
      triggers: [
        ["TechnicalPart_normalize_sku_insert", "TechnicalPart", ["after insert", "new.\"sku\" is not null", "nullif(trim(new.\"sku\"), '')"]],
        ["TechnicalPart_normalize_sku_update", "TechnicalPart", ["after update of \"sku\"", "new.\"sku\" is not null", "nullif(trim(new.\"sku\"), '')"]],
      ],
      tableSqlIncludes: {
        Product: ["check (\"stockquantity\" is null or \"stockquantity\" >= 0)"],
        TechnicalPart: ["\"quantityonhand\" is null or \"quantityonhand\" >= 0", "\"quantityreserved\" <= \"quantityonhand\""],
        ServiceOrderPart: ["\"state\" = 'reserved'", "\"totalcostsnapshot\" - round", "\"reversedat\" >= \"consumedat\""],
        TechnicalPartMovement: ["'stock_mode_change'", "\"onhandbefore\" is null and \"onhandafter\" is null", "\"reservedafter\" = \"reservedbefore\" - \"quantity\""],
      },
    },
  }),
  defineMigration({
    id: "20260806_002_technical_part_command_log",
    appVersion: APP_VERSION,
    description: "Idempotência e auditoria administrativa de peças técnicas",
    sql: TECHNICAL_PART_COMMAND_LOG_SQL,
    kind: "migration",
    ownedTables: ["TechnicalPartCommandLog"],
    requiredTables: ["TechnicalPart", "SystemUser"],
    schemaChecks: {
      TechnicalPartCommandLog: {
        id: ["TEXT", true], logicalKey: ["TEXT", true], payloadHash: ["TEXT", true],
        operation: ["TEXT", true], technicalPartId: ["TEXT", true],
        operatorId: ["TEXT", false], operatorNameSnapshot: ["TEXT", true],
        reason: ["TEXT", false], resultVersion: ["INTEGER", true],
        createdAt: ["DATETIME", true, "CURRENT_TIMESTAMP"],
      },
    },
    structureChecks: {
      foreignKeys: [
        ["TechnicalPartCommandLog", "technicalPartId", "TechnicalPart", "id", "RESTRICT", "CASCADE"],
        ["TechnicalPartCommandLog", "operatorId", "SystemUser", "id", "SET NULL", "CASCADE"],
      ],
      indexes: [
        ["TechnicalPartCommandLog_logicalKey_key", "TechnicalPartCommandLog", true, false, [["logicalKey", "BINARY"]]],
        ["TechnicalPartCommandLog_technicalPartId_idx", "TechnicalPartCommandLog", false, false, [["technicalPartId", "BINARY"]]],
        ["TechnicalPartCommandLog_operation_idx", "TechnicalPartCommandLog", false, false, [["operation", "BINARY"]]],
        ["TechnicalPartCommandLog_operatorId_idx", "TechnicalPartCommandLog", false, false, [["operatorId", "BINARY"]]],
        ["TechnicalPartCommandLog_createdAt_idx", "TechnicalPartCommandLog", false, false, [["createdAt", "BINARY"]]],
      ],
      tableSqlIncludes: {
        TechnicalPartCommandLog: [
          "length(\"payloadhash\") = 64",
          "\"payloadhash\" not glob '*[^0-9a-f]*'",
          "\"resultversion\" >= 0",
          "length(trim(\"operatornamesnapshot\")) > 0",
        ],
      },
    },
  }),
  defineMigration({
    id: "20260806_003_service_order_technical_command_log",
    appVersion: APP_VERSION,
    description: "Idempotência e auditoria técnica no nível da ordem de serviço",
    sql: SERVICE_ORDER_TECHNICAL_COMMAND_LOG_SQL,
    kind: "migration",
    ownedTables: ["ServiceOrderTechnicalCommandLog"],
    requiredTables: ["ServiceOrder", "SystemUser"],
    schemaChecks: {
      ServiceOrderTechnicalCommandLog: {
        id: ["TEXT", true], logicalKey: ["TEXT", true], payloadHash: ["TEXT", true],
        operation: ["TEXT", true], serviceOrderId: ["TEXT", true],
        operatorId: ["TEXT", false], operatorNameSnapshot: ["TEXT", true],
        affectedItems: ["INTEGER", true], resultOrderStatus: ["TEXT", true],
        createdAt: ["DATETIME", true, "CURRENT_TIMESTAMP"],
      },
    },
    structureChecks: {
      foreignKeys: [
        ["ServiceOrderTechnicalCommandLog", "serviceOrderId", "ServiceOrder", "id", "RESTRICT", "CASCADE"],
        ["ServiceOrderTechnicalCommandLog", "operatorId", "SystemUser", "id", "SET NULL", "CASCADE"],
      ],
      indexes: [
        ["ServiceOrderTechnicalCommandLog_logicalKey_key", "ServiceOrderTechnicalCommandLog", true, false, [["logicalKey", "BINARY"]]],
        ["ServiceOrderTechnicalCommandLog_serviceOrderId_idx", "ServiceOrderTechnicalCommandLog", false, false, [["serviceOrderId", "BINARY"]]],
        ["ServiceOrderTechnicalCommandLog_operation_idx", "ServiceOrderTechnicalCommandLog", false, false, [["operation", "BINARY"]]],
        ["ServiceOrderTechnicalCommandLog_operatorId_idx", "ServiceOrderTechnicalCommandLog", false, false, [["operatorId", "BINARY"]]],
        ["ServiceOrderTechnicalCommandLog_createdAt_idx", "ServiceOrderTechnicalCommandLog", false, false, [["createdAt", "BINARY"]]],
      ],
      tableSqlIncludes: {
        ServiceOrderTechnicalCommandLog: [
          "length(trim(\"logicalkey\")) > 0",
          "length(\"payloadhash\") = 64",
          "\"payloadhash\" not glob '*[^0-9a-f]*'",
          "length(trim(\"operatornamesnapshot\")) > 0",
          "\"affecteditems\" >= 0",
          "length(trim(\"resultorderstatus\")) > 0",
        ],
      },
    },
  }),
  defineMigration({
    id: "20260810_004_technician_profit_share",
    appVersion: APP_VERSION,
    description: "Participação de lucro por técnico e snapshot percentual na OS",
    sql: TECHNICIAN_PROFIT_SHARE_SQL,
    kind: "migration",
    alteredTables: ["SystemUser", "ServiceOrder"],
    requiredTables: ["SystemUser", "ServiceOrder"],
    schemaChecks: {
      SystemUser: {
        profitShareEnabled: ["BOOLEAN", true, "false"],
        profitSharePercent: ["DECIMAL", true, "0"],
      },
      ServiceOrder: {
        technicianUserId: ["TEXT", false],
        technicianProfitPercentSnapshot: ["DECIMAL", false],
      },
    },
    structureChecks: {
      foreignKeys: [
        ["ServiceOrder", "technicianUserId", "SystemUser", "id", "SET NULL", "CASCADE"],
      ],
      indexes: [
        ["ServiceOrder_technicianUserId_idx", "ServiceOrder", false, false, [["technicianUserId", "BINARY"]]],
      ],
      tableSqlIncludes: {
        SystemUser: [
          "\"profitshareenabled\" in (0, 1)",
          "\"profitsharepercent\" >= 0",
          "\"profitsharepercent\" <= 100",
        ],
        ServiceOrder: [
          "\"technicianprofitpercentsnapshot\" is null",
          "\"technicianprofitpercentsnapshot\" >= 0",
          "\"technicianprofitpercentsnapshot\" <= 100",
        ],
      },
    },
  }),
  defineMigration({
    id: "20260906_005_attendant_pdv_profit_share",
    appVersion: APP_VERSION,
    description: "Participação de lucro do atendente nas vendas do PDV",
    sql: ATTENDANT_PDV_PROFIT_SHARE_SQL,
    kind: "migration",
    alteredTables: ["SystemUser", "ProductSale"],
    requiredTables: ["SystemUser", "ProductSale"],
    schemaChecks: {
      SystemUser: {
        pdvProfitShareEnabled: ["BOOLEAN", true, "false"],
        pdvProfitSharePercent: ["DECIMAL", true, "0"],
      },
      ProductSale: {
        attendantUserId: ["TEXT", false],
        attendantProfitPercentSnapshot: ["DECIMAL", false],
        attendantProfitShare: ["DECIMAL", true, "0"],
      },
    },
    structureChecks: {
      foreignKeys: [
        ["ProductSale", "attendantUserId", "SystemUser", "id", "SET NULL", "CASCADE"],
      ],
      indexes: [
        ["ProductSale_attendantUserId_idx", "ProductSale", false, false, [["attendantUserId", "BINARY"]]],
      ],
      tableSqlIncludes: {
        SystemUser: [
          "\"pdvprofitshareenabled\" in (0, 1)",
          "\"pdvprofitsharepercent\" >= 0",
          "\"pdvprofitsharepercent\" <= 100",
        ],
        ProductSale: [
          "\"attendantprofitpercentsnapshot\" is null",
          "\"attendantprofitpercentsnapshot\" >= 0",
          "\"attendantprofitpercentsnapshot\" <= 100",
          "\"attendantprofitshare\" >= 0",
        ],
      },
    },
  }),
]);

module.exports = {
  APP_VERSION,
  BASELINE_ID,
  BASE_TABLES,
  CONTROL_TABLE,
  migrations,
  migrationChecksum,
  normalizeSql,
};
