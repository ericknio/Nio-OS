# ETAPA 3A — Modelos, enums, constraints e migração SQLite

## 1. Modelos Prisma definitivos (desenho)

### `TechnicalPart`

| Campo | Tipo/atributo |
|---|---|
| `id` | `String @id @default(cuid())` |
| `name` | `String` |
| `sku` | `String?` — trim; vazio vira `null`; único quando não nulo |
| `category`, `brand`, `compatibleModel`, `description`, `location`, `notes` | `String?` |
| `quantityOnHand` | `Int?` — `null` significa ilimitado; `0` significa sem estoque |
| `quantityReserved`, `minStock` | `Int @default(0)` |
| `currentCostPrice`, `defaultSalePrice` | `Decimal @default(0)` |
| `isActive` | `Boolean @default(true)` |
| `version` | `Int @default(0)` |
| `createdAt` | `DateTime @default(now())` |
| `updatedAt` | `DateTime @updatedAt` |
| relações | `serviceOrderParts[]`, `movements[]` |

Não existe `quantityAvailable`; a API calcula `null` quando `quantityOnHand` é `null`, senão `quantityOnHand - quantityReserved`. Índices: nome, SKU parcial único `NOCASE`, categoria, marca, modelo compatível, ativo, localização, mínimo e atualização.

### `ServiceOrderPart`

| Campo | Tipo/atributo |
|---|---|
| `id` | `String @id @default(cuid())` |
| `serviceOrderId` | FK obrigatória para `ServiceOrder`, `Restrict` |
| `technicalPartId` | FK obrigatória para `TechnicalPart`, `Restrict` |
| `partNameSnapshot`, `partSkuSnapshot` | `String`, `String?` |
| `unitCostSnapshot`, `unitPriceSnapshot` | `Decimal` não negativos |
| `quantity` | `Int` positivo |
| `totalCostSnapshot`, `totalPriceSnapshot` | `Decimal` não negativos; servidor = unitário × quantidade |
| `state` | `ServiceOrderPartState` |
| `reservedAt`, `consumedAt`, `releasedAt`, `reversedAt` | timestamps condicionais |
| `responsibleUserId` | FK opcional para `SystemUser`, `SetNull` |
| `responsibleUserNameSnapshot` | `String` obrigatório |
| `idempotencyKey` | `String @unique` — identidade do comando que criou o item |
| `createdAt`, `updatedAt` | timestamps |
| relações | `movements[]` |

Índices: `(serviceOrderId,state)`, `(technicalPartId,state)`, `serviceOrderId`, `technicalPartId`, `reservedAt`, `consumedAt`, `responsibleUserId`. Um índice parcial único garante no máximo um item ativo (`RESERVED` ou `CONSUMED`) por par OS/peça; se a peça for estornada/liberada, uma nova linha pode ser criada, preservando história.

### `TechnicalPartMovement`

| Campo | Tipo/atributo |
|---|---|
| `id` | `String @id @default(cuid())` |
| `technicalPartId` | FK obrigatória, `Restrict` |
| `serviceOrderPartId` | FK opcional, `Restrict` |
| `type` | `TechnicalPartMovementType` |
| `quantity` | inteiro positivo; direção está no tipo |
| `onHandBefore`, `onHandAfter` | `Int?`; ambos `null` em movimento de peça ilimitada |
| `reservedBefore`, `reservedAfter` | inteiros não negativos |
| `unitCostSnapshot` | `Decimal?`, obrigatório em entrada/ajustes/consumo/estorno quando aplicável |
| `reason` | `String?`; obrigatório para ajustes e estorno |
| `operatorId` | FK opcional para `SystemUser`, `SetNull` |
| `operatorNameSnapshot` | `String` obrigatório |
| `idempotencyKey` | `String @unique` |
| `createdAt` | `DateTime @default(now())` |

Índices: `(technicalPartId,createdAt)`, `(serviceOrderPartId,createdAt)`, `(type,createdAt)`, `operatorId`, `createdAt`.

## 2. Enums definitivos

```text
ServiceOrderPartState = RESERVED | CONSUMED | RELEASED | REVERSED

TechnicalPartMovementType =
  ENTRY |
  POSITIVE_ADJUSTMENT |
  NEGATIVE_ADJUSTMENT |
  RESERVATION |
  RESERVATION_INCREASE |
  RESERVATION_DECREASE |
  RELEASE |
  CONSUMPTION |
  MANUAL_REVERSAL |
  STOCK_MODE_CHANGE
```

`quantity` é sempre positiva; o tipo define se físico/reservado sobe ou desce. Não se usa `ADJUSTMENT` ambíguo nem quantidade negativa.

## 3. Constraints e coerência

- Peça: `quantityOnHand IS NULL OR quantityOnHand >= 0`; `quantityReserved >= 0`; `quantityOnHand IS NULL OR quantityReserved <= quantityOnHand`; `minStock >= 0`; preços >= 0; `version >= 0`; nome após trim não vazio; booleano em `(0,1)`.
- Item: quantidade > 0; unitários/totais >= 0; tolerância de centavos para `total = round(unit * quantity,2)`; estado e timestamps coerentes.
- Movimento: quantidade > 0, exceto `STOCK_MODE_CHANGE`, cuja quantidade inicial pode ser zero; físico anterior/posterior ambos nulos para operação ilimitada ou coerentes com a troca de modo; reservados >= 0; quando o físico não é nulo, reservado nunca o supera; custo nulo ou >= 0; deltas coerentes com o tipo.
- SKU: API converte trim vazio em `NULL`; trigger de normalização cobre escritas externas; índice parcial único `NOCASE` quando não nulo.
- Exclusão: FKs `ON DELETE RESTRICT` entre OS/item/peça/movimento; API só inativa. `SystemUser` usa `SET NULL`, preservando snapshot.
- SQLite não permite adicionar `CHECK` a tabela existente sem rebuild. Como são três tabelas novas, todas as regras entram no `CREATE TABLE`. Prisma não expressa checks, índices parciais, `COLLATE NOCASE` ou triggers; o SQL do migrador é a autoridade dessas garantias.

## 4. SQL completo planejado — `20260804_001_technical_parts`

O SQL abaixo é o corpo planejado do manifesto. O `core.cjs` já abre `BEGIN IMMEDIATE`; portanto o SQL **não** contém `BEGIN/COMMIT`, evitando transação aninhada.

```sql
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
  "quantityReserved" INTEGER NOT NULL DEFAULT 0 CHECK ("quantityReserved" >= 0 AND ("quantityOnHand" IS NULL OR "quantityReserved" <= "quantityOnHand")),
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
  "totalCostSnapshot" DECIMAL NOT NULL CHECK ("totalCostSnapshot" >= 0 AND abs("totalCostSnapshot" - round("unitCostSnapshot" * "quantity", 2)) < 0.005),
  "totalPriceSnapshot" DECIMAL NOT NULL CHECK ("totalPriceSnapshot" >= 0 AND abs("totalPriceSnapshot" - round("unitPriceSnapshot" * "quantity", 2)) < 0.005),
  "state" TEXT NOT NULL CHECK ("state" IN ('RESERVED','CONSUMED','RELEASED','REVERSED')),
  "reservedAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "releasedAt" DATETIME,
  "reversedAt" DATETIME,
  "responsibleUserId" TEXT,
  "responsibleUserNameSnapshot" TEXT NOT NULL CHECK (length(trim("responsibleUserNameSnapshot")) > 0),
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ServiceOrderPart_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderPart_technicalPartId_fkey" FOREIGN KEY ("technicalPartId") REFERENCES "TechnicalPart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderPart_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "SystemUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CHECK (
    ("state"='RESERVED' AND "consumedAt" IS NULL AND "releasedAt" IS NULL AND "reversedAt" IS NULL) OR
    ("state"='CONSUMED' AND "consumedAt" IS NOT NULL AND "releasedAt" IS NULL AND "reversedAt" IS NULL) OR
    ("state"='RELEASED' AND "consumedAt" IS NULL AND "releasedAt" IS NOT NULL AND "reversedAt" IS NULL) OR
    ("state"='REVERSED' AND "consumedAt" IS NOT NULL AND "releasedAt" IS NULL AND "reversedAt" IS NOT NULL)
  ),
  CHECK ("consumedAt" IS NULL OR "consumedAt" >= "reservedAt"),
  CHECK ("releasedAt" IS NULL OR "releasedAt" >= "reservedAt"),
  CHECK ("reversedAt" IS NULL OR ("consumedAt" IS NOT NULL AND "reversedAt" >= "consumedAt"))
);

CREATE TABLE "TechnicalPartMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "technicalPartId" TEXT NOT NULL,
  "serviceOrderPartId" TEXT,
  "type" TEXT NOT NULL CHECK ("type" IN ('ENTRY','POSITIVE_ADJUSTMENT','NEGATIVE_ADJUSTMENT','RESERVATION','RESERVATION_INCREASE','RESERVATION_DECREASE','RELEASE','CONSUMPTION','MANUAL_REVERSAL','STOCK_MODE_CHANGE')),
  "quantity" INTEGER NOT NULL CHECK (("type"='STOCK_MODE_CHANGE' AND "quantity">=0) OR ("type"<>'STOCK_MODE_CHANGE' AND "quantity">0)),
  "onHandBefore" INTEGER CHECK ("onHandBefore" IS NULL OR "onHandBefore" >= 0),
  "onHandAfter" INTEGER CHECK ("onHandAfter" IS NULL OR "onHandAfter" >= 0),
  "reservedBefore" INTEGER NOT NULL CHECK ("reservedBefore" >= 0 AND ("onHandBefore" IS NULL OR "reservedBefore" <= "onHandBefore")),
  "reservedAfter" INTEGER NOT NULL CHECK ("reservedAfter" >= 0 AND ("onHandAfter" IS NULL OR "reservedAfter" <= "onHandAfter")),
  "unitCostSnapshot" DECIMAL CHECK ("unitCostSnapshot" IS NULL OR "unitCostSnapshot" >= 0),
  "reason" TEXT,
  "operatorId" TEXT,
  "operatorNameSnapshot" TEXT NOT NULL CHECK (length(trim("operatorNameSnapshot")) > 0),
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TechnicalPartMovement_technicalPartId_fkey" FOREIGN KEY ("technicalPartId") REFERENCES "TechnicalPart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TechnicalPartMovement_serviceOrderPartId_fkey" FOREIGN KEY ("serviceOrderPartId") REFERENCES "ServiceOrderPart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TechnicalPartMovement_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "SystemUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CHECK (("type" IN ('POSITIVE_ADJUSTMENT','NEGATIVE_ADJUSTMENT','MANUAL_REVERSAL','STOCK_MODE_CHANGE') AND length(trim(coalesce("reason",''))) > 0) OR "type" NOT IN ('POSITIVE_ADJUSTMENT','NEGATIVE_ADJUSTMENT','MANUAL_REVERSAL','STOCK_MODE_CHANGE')),
  CHECK (("type" IN ('ENTRY','POSITIVE_ADJUSTMENT') AND "onHandBefore" IS NOT NULL AND "onHandAfter"="onHandBefore"+"quantity" AND "reservedAfter"="reservedBefore") OR
         ("type"='NEGATIVE_ADJUSTMENT' AND "onHandAfter"="onHandBefore"-"quantity" AND "reservedAfter"="reservedBefore") OR
         ("type" IN ('RESERVATION','RESERVATION_INCREASE') AND "onHandAfter" IS "onHandBefore" AND "reservedAfter"="reservedBefore"+"quantity") OR
         ("type" IN ('RESERVATION_DECREASE','RELEASE') AND "onHandAfter" IS "onHandBefore" AND "reservedAfter"="reservedBefore"-"quantity") OR
         ("type"='CONSUMPTION' AND (("onHandBefore" IS NULL AND "onHandAfter" IS NULL) OR "onHandAfter"="onHandBefore"-"quantity") AND "reservedAfter"="reservedBefore"-"quantity") OR
         ("type"='MANUAL_REVERSAL' AND (("onHandBefore" IS NULL AND "onHandAfter" IS NULL) OR "onHandAfter"="onHandBefore"+"quantity") AND "reservedAfter"="reservedBefore") OR
         ("type"='STOCK_MODE_CHANGE' AND "reservedBefore"=0 AND "reservedAfter"=0 AND (("onHandBefore" IS NULL AND "onHandAfter" IS NOT NULL AND "onHandAfter"="quantity") OR ("onHandBefore" IS NOT NULL AND "onHandAfter" IS NULL))))
);

CREATE UNIQUE INDEX "TechnicalPart_sku_key_nocase" ON "TechnicalPart"("sku" COLLATE NOCASE) WHERE "sku" IS NOT NULL;
CREATE INDEX "TechnicalPart_name_idx" ON "TechnicalPart"("name");
CREATE INDEX "TechnicalPart_category_idx" ON "TechnicalPart"("category");
CREATE INDEX "TechnicalPart_brand_idx" ON "TechnicalPart"("brand");
CREATE INDEX "TechnicalPart_compatibleModel_idx" ON "TechnicalPart"("compatibleModel");
CREATE INDEX "TechnicalPart_isActive_idx" ON "TechnicalPart"("isActive");
CREATE INDEX "TechnicalPart_location_idx" ON "TechnicalPart"("location");
CREATE INDEX "TechnicalPart_updatedAt_idx" ON "TechnicalPart"("updatedAt");
CREATE INDEX "ServiceOrderPart_serviceOrderId_state_idx" ON "ServiceOrderPart"("serviceOrderId","state");
CREATE INDEX "ServiceOrderPart_technicalPartId_state_idx" ON "ServiceOrderPart"("technicalPartId","state");
CREATE UNIQUE INDEX "ServiceOrderPart_active_order_part_key" ON "ServiceOrderPart"("serviceOrderId","technicalPartId") WHERE "state" IN ('RESERVED','CONSUMED');
CREATE INDEX "ServiceOrderPart_reservedAt_idx" ON "ServiceOrderPart"("reservedAt");
CREATE INDEX "ServiceOrderPart_consumedAt_idx" ON "ServiceOrderPart"("consumedAt");
CREATE INDEX "ServiceOrderPart_responsibleUserId_idx" ON "ServiceOrderPart"("responsibleUserId");
CREATE INDEX "TechnicalPartMovement_part_created_idx" ON "TechnicalPartMovement"("technicalPartId","createdAt");
CREATE INDEX "TechnicalPartMovement_item_created_idx" ON "TechnicalPartMovement"("serviceOrderPartId","createdAt");
CREATE INDEX "TechnicalPartMovement_type_created_idx" ON "TechnicalPartMovement"("type","createdAt");
CREATE INDEX "TechnicalPartMovement_operatorId_idx" ON "TechnicalPartMovement"("operatorId");

CREATE TRIGGER "TechnicalPart_normalize_sku_insert" AFTER INSERT ON "TechnicalPart"
WHEN NEW."sku" IS NOT NULL AND NEW."sku" <> trim(NEW."sku") OR NEW."sku" = ''
BEGIN UPDATE "TechnicalPart" SET "sku"=NULLIF(trim(NEW."sku"),'') WHERE "id"=NEW."id"; END;
CREATE TRIGGER "TechnicalPart_normalize_sku_update" AFTER UPDATE OF "sku" ON "TechnicalPart"
WHEN NEW."sku" IS NOT NULL AND (NEW."sku" <> trim(NEW."sku") OR NEW."sku" = '')
BEGIN UPDATE "TechnicalPart" SET "sku"=NULLIF(trim(NEW."sku"),'') WHERE "id"=NEW."id"; END;
```

Observação de precedência: na implementação, envolver a condição `WHEN` do trigger de insert em parênteses para legibilidade; SQLite avalia `AND` antes de `OR`. O SQL acima continua funcional.

## 5. Metadados do manifesto

- `id`: `20260804_001_technical_parts`.
- `appVersion`: a versão de aplicação da entrega 3B, atualizada uma única vez no manifesto.
- `ownedTables`: `TechnicalPart`, `ServiceOrderPart`, `TechnicalPartMovement`. `Product` não é “owned”, pois é tabela da baseline alterada.
- `requiredTables`: `Product`, `ProductSaleItem`, `StockMovement`, `ServiceOrder`, `SystemUser` (e, por validação global, todas as tabelas da baseline continuam obrigatórias).
- `schemaChecks`: todas as colunas das três tabelas novas e o estado pós-migração de `Product.stockQuantity = ["INTEGER", false]`. O verificador atual fixa `Product.stockQuantity` como `NOT NULL` na baseline e revalida essa expectativa mesmo após migrações; 3B deverá aceitar sobreposição evolutiva de checks de tabelas-base (por exemplo `alteredTables`/checks efetivos por prefixo) e ampliar checks pós-aplicação para `sqlite_master`, `PRAGMA foreign_key_list` e `PRAGMA index_list/index_xinfo`.
- `checksum`: não fixar manualmente neste documento. Será calculado deterministicamente por `defineMigration` após o SQL final, pela função existente `migrationChecksum`; qualquer byte lógico alterado muda o SHA-256.

## 6. Aplicação, validação e banco já atualizado

O migrador aplica a baseline primeiro quando necessário, depois a nova migração, no mesmo `BEGIN IMMEDIATE`. Após cada SQL, insere uma única linha em `NioSchemaMigration`, revalida sequência/checksum/schema e, ao final, roda integridade e FKs antes do commit. Qualquer falha causa rollback integral. Em banco já atualizado, o histórico é prefixo completo, `pending=[]` e apply é no-op; checksum divergente falha, nunca reaplica.

Validação adicional obrigatória: tabelas/colunas, defaults, checks presentes no SQL normalizado de `sqlite_master`, três FKs do item, três FKs do movimento, índice parcial de SKU, índice parcial de item ativo, triggers, tentativa controlada de inserções inválidas em banco descartável, `foreign_key_check` e `integrity_check`.

## 7. Estratégia Prisma e criação limpa

1. 3B atualiza `schema.prisma` com modelos/enums/relações/índices expressáveis e atualiza o manifesto SQL na mesma mudança.
2. `prisma generate` ocorre apenas no desenvolvimento/empacotamento controlado, nunca durante a inicialização produtiva.
3. O `db push` existente no build deve apontar somente para banco descartável de desenvolvimento, protegido por checagem explícita de ambiente e caminho. Produção/LAN/instalador executa exclusivamente o migrador interno contra backup verificado.
4. CI compara schema esperado e manifesto: banco temporário criado pelo Prisma para compatibilidade do Client e banco temporário criado pelo artefato SQL/migrações devem convergir nas tabelas/colunas; checks extras pertencem ao SQL.
5. Banco limpo futuro: criar um artefato versionado de schema vazio (baseline estrutural completa ou sequência bootstrap + migrações), aplicar transacionalmente e criar somente configuração/ADMIN por onboarding. Seed nunca contém clientes, OS, peças, movimentos, pagamentos ou outros dados operacionais.

## 8. Revisão 3A.1 — regra unificada de estoque

### Modelos revisados

```prisma
model Product {
  // campos existentes preservados
  stockQuantity Int?
}

model TechnicalPart {
  // campos descritos neste documento
  quantityOnHand   Int?
  quantityReserved Int @default(0)
}
```

`NULL` é ilimitado, `0` é esgotado e positivo é controlado. Não existe coluna `isUnlimited`. A resposta pode derivar `isUnlimited = stockQuantity === null` ou `quantityOnHand === null`.

### Necessidade de reconstrução de `Product`

Sim. O schema atual declara `stockQuantity Int @default(0)`, materializado como `INTEGER NOT NULL DEFAULT 0`. SQLite não oferece `ALTER COLUMN ... DROP NOT NULL`. Para torná-la nullable e remover o default ambíguo, é necessário reconstruir `Product`.

Como `ProductSaleItem.productId` e `StockMovement.productId` referenciam `Product`, não se deve executar `DROP TABLE Product` com `foreign_keys=ON`: isso pode bloquear ou acionar ações referenciais. A conexão do migrador deve executar `PRAGMA foreign_keys=OFF` **antes** de `BEGIN IMMEDIATE`, reconstruir/copiar/renomear dentro da transação, executar `PRAGMA foreign_key_check` ainda dentro dela, fazer commit e reativar `foreign_keys=ON` fora da transação. O executor atual liga FKs antes do begin; portanto 3B precisa de suporte explícito e restrito a rebuild, sem mudar essa configuração nesta etapa documental.

### SQL planejado para reconstrução de `Product`

O executor, e não o corpo do manifesto, controla `PRAGMA foreign_keys` e `BEGIN/COMMIT`. Este bloco integra o SQL de `20260804_001_technical_parts` **antes** da criação das tabelas técnicas:

```sql
CREATE TEMP TABLE "_ProductMigrationCount" (
  "beforeCount" INTEGER NOT NULL,
  "beforeSaleRefs" INTEGER NOT NULL,
  "beforeMovementRefs" INTEGER NOT NULL
);
INSERT INTO "_ProductMigrationCount"
SELECT
  (SELECT count(*) FROM "Product"),
  (SELECT count(*) FROM "ProductSaleItem" WHERE "productId" IS NOT NULL),
  (SELECT count(*) FROM "StockMovement");

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
  "minStock" INTEGER NOT NULL DEFAULT 0 CHECK ("minStock" >= 0),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Product" (
  "id","name","sku","category","description","imageUrl",
  "salePrice","costPrice","taxPercent","stockQuantity","minStock",
  "isActive","createdAt","updatedAt"
)
SELECT
  "id","name","sku","category","description","imageUrl",
  "salePrice","costPrice","taxPercent",
  CASE WHEN "stockQuantity" = 0 THEN NULL ELSE "stockQuantity" END,
  "minStock","isActive","createdAt","updatedAt"
FROM "Product";

CREATE TEMP TABLE "_ProductMigrationGuard" (
  "ok" INTEGER NOT NULL CHECK ("ok" = 1)
);
INSERT INTO "_ProductMigrationGuard" ("ok")
SELECT CASE WHEN
  (SELECT count(*) FROM "new_Product") = (SELECT "beforeCount" FROM "_ProductMigrationCount")
  AND NOT EXISTS (SELECT 1 FROM "new_Product" WHERE "stockQuantity" IS NOT NULL AND "stockQuantity" < 0)
THEN 1 ELSE 0 END;

DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";

CREATE INDEX "Product_name_idx" ON "Product"("name");
CREATE INDEX "Product_sku_idx" ON "Product"("sku");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");
CREATE INDEX "Product_stockQuantity_idx" ON "Product"("stockQuantity");

INSERT INTO "_ProductMigrationGuard" ("ok")
SELECT CASE WHEN
  (SELECT count(*) FROM "Product") = (SELECT "beforeCount" FROM "_ProductMigrationCount")
  AND (SELECT count(*) FROM "ProductSaleItem" WHERE "productId" IS NOT NULL) = (SELECT "beforeSaleRefs" FROM "_ProductMigrationCount")
  AND (SELECT count(*) FROM "StockMovement") = (SELECT "beforeMovementRefs" FROM "_ProductMigrationCount")
  AND NOT EXISTS (
    SELECT 1 FROM "ProductSaleItem" i
    WHERE i."productId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Product" p WHERE p."id"=i."productId")
  )
  AND NOT EXISTS (
    SELECT 1 FROM "StockMovement" m
    WHERE NOT EXISTS (SELECT 1 FROM "Product" p WHERE p."id"=m."productId")
  )
THEN 1 ELSE 0 END;

DROP TABLE "_ProductMigrationGuard";
DROP TABLE "_ProductMigrationCount";
```

Valores zero são convertidos antes de qualquer release interpretar zero como esgotado; positivos são copiados sem alteração. A contagem de produtos e referências é preservada. Após o bloco, o executor exige `PRAGMA foreign_key_check` vazio, integridade `ok`, colunas/índices esperados e então permite commit.

### Constraints e snapshots ilimitados

- `Product`: `stockQuantity IS NULL OR stockQuantity >= 0`.
- `TechnicalPart`: `quantityOnHand IS NULL OR quantityOnHand >= 0`; `quantityReserved >= 0`; `quantityOnHand IS NULL OR quantityReserved <= quantityOnHand`.
- Movimentos técnicos usam `onHandBefore/onHandAfter=NULL` quando ilimitados. Reserva aumenta reservado; consumo/liberação diminuem reservado; estorno mantém reservado; nenhum deles materializa físico.
- `ENTRY` e ajustes físicos rejeitam peça ilimitada. `STOCK_MODE_CHANGE` é a operação separada e auditável para trocar modo.
