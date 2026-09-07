# Etapa 2A — Modelos propostos para estoque de peças técnicas

Esta é apenas uma proposta. Nenhuma alteração foi aplicada ao Prisma ou ao SQLite.

## Enums

```prisma
enum ServiceOrderPartStatus {
  RESERVED
  CONSUMED
  RELEASED
  REVERSED
}

enum TechnicalPartMovementType {
  ENTRY
  ADJUSTMENT_IN
  ADJUSTMENT_OUT
  RESERVATION
  RESERVATION_RELEASE
  CONSUMPTION
  MANUAL_REVERSAL
}
```

`RESERVED` representa quantidade separada para uma OS. `CONSUMED` representa saída física ao marcar a OS como `PRONTO`. `RELEASED` preserva o histórico de uma reserva liberada antes do consumo. `REVERSED` representa consumo estornado manualmente.

## TechnicalPart

```prisma
model TechnicalPart {
  id          String  @id @default(cuid())
  name        String
  sku         String?
  category    String?
  description String?

  quantityOnHand  Int @default(0)
  quantityReserved Int @default(0)
  minStock        Int @default(0)

  defaultSalePrice Decimal @default(0)
  currentCostPrice Decimal @default(0)
  isActive         Boolean @default(true)

  version   Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  serviceOrderParts ServiceOrderPart[]
  movements        TechnicalPartMovement[]

  @@index([name])
  @@index([sku])
  @@index([category])
  @@index([isActive])
  @@index([quantityOnHand])
  @@index([quantityReserved])
}
```

Regras SQL adicionais necessárias:

- `CHECK (quantityOnHand >= 0)`;
- `CHECK (quantityReserved >= 0)`;
- `CHECK (quantityReserved <= quantityOnHand)`;
- `CHECK (minStock >= 0)`;
- `CHECK (defaultSalePrice >= 0)`;
- `CHECK (currentCostPrice >= 0)`;
- índice único parcial opcional para SKU não nulo: `UNIQUE(sku) WHERE sku IS NOT NULL`.

Quantidade disponível é derivada, não armazenada:

`quantityAvailable = quantityOnHand - quantityReserved`

Isso evita três fontes de verdade.

## ServiceOrderPart

```prisma
model ServiceOrderPart {
  id             String                 @id @default(cuid())
  serviceOrderId String
  technicalPartId String

  quantity Int
  status   ServiceOrderPartStatus @default(RESERVED)

  unitCostSnapshot  Decimal
  unitPriceSnapshot Decimal
  totalCostSnapshot Decimal
  totalPriceSnapshot Decimal

  reservedAt DateTime @default(now())
  consumedAt DateTime?
  releasedAt DateTime?
  reversedAt DateTime?

  createdBy String
  updatedBy String?
  idempotencyKey String @unique

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  serviceOrder ServiceOrder  @relation(fields: [serviceOrderId], references: [id], onDelete: Restrict)
  technicalPart TechnicalPart @relation(fields: [technicalPartId], references: [id], onDelete: Restrict)
  movements TechnicalPartMovement[]

  @@index([serviceOrderId])
  @@index([technicalPartId])
  @@index([status])
  @@index([serviceOrderId, status])
  @@index([technicalPartId, status])
}
```

Constraints:

- `CHECK (quantity > 0)`;
- snapshots e totais não negativos;
- `totalCostSnapshot = unitCostSnapshot * quantity`;
- `totalPriceSnapshot = unitPriceSnapshot * quantity`;
- timestamps coerentes com o estado;
- `ON DELETE RESTRICT` para preservar histórico.

O preço padrão é copiado para `unitPriceSnapshot` ao adicionar, mas pode ser alterado na OS. O custo real atual é copiado para `unitCostSnapshot`. Mudanças futuras no cadastro não alteram o histórico.

## TechnicalPartMovement

```prisma
model TechnicalPartMovement {
  id              String @id @default(cuid())
  technicalPartId String
  serviceOrderPartId String?

  type     TechnicalPartMovementType
  quantity Int

  onHandBefore   Int
  onHandAfter    Int
  reservedBefore Int
  reservedAfter  Int

  unitCostSnapshot Decimal?
  reason           String?
  performedBy      String
  idempotencyKey   String @unique
  createdAt        DateTime @default(now())

  technicalPart TechnicalPart @relation(fields: [technicalPartId], references: [id], onDelete: Restrict)
  serviceOrderPart ServiceOrderPart? @relation(fields: [serviceOrderPartId], references: [id], onDelete: Restrict)

  @@index([technicalPartId])
  @@index([serviceOrderPartId])
  @@index([type])
  @@index([createdAt])
  @@index([technicalPartId, createdAt])
}
```

Constraints:

- `CHECK (quantity > 0)`;
- todos os saldos anteriores e posteriores não negativos;
- reservado posterior nunca maior que saldo físico posterior;
- `serviceOrderPartId` obrigatório para reserva, liberação, consumo e estorno ligados a OS;
- movimentos são imutáveis; correção cria novo movimento, nunca edita o anterior.

## Regras de transição

| Evento | Item | Físico | Reservado | Movimento |
|---|---|---:|---:|---|
| Adicionar peça à OS | `RESERVED` | mantém | `+qtd` | `RESERVATION` |
| Remover antes de consumir | `RELEASED` | mantém | `-qtd` | `RESERVATION_RELEASE` |
| Cancelar OS antes de consumir | `RELEASED` | mantém | `-qtd` | `RESERVATION_RELEASE` |
| Marcar OS `PRONTO` | `CONSUMED` | `-qtd` | `-qtd` | `CONSUMPTION` |
| Cancelar após consumo | mantém `CONSUMED` | mantém | mantém | nenhum automático |
| Estorno manual | `REVERSED` | `+qtd` | mantém | `MANUAL_REVERSAL` |
| Reabrir OS | mantém estados | mantém | mantém | nenhum |
| Duplicar OS | nenhum item copiado | mantém | mantém | nenhum |

`ENTREGUE` não deve consumir novamente uma peça já consumida em `PRONTO`.

## Idempotência

Cada comando externo recebe chave estável:

- reserva: `reserve:<orderId>:<clientCommandId>`;
- consumo: `consume:<serviceOrderPartId>`;
- liberação: `release:<serviceOrderPartId>`;
- estorno: `reverse:<serviceOrderPartId>:<clientCommandId>`.

As chaves únicas em item e movimento transformam repetição de requisição em leitura do resultado anterior, impedindo dupla reserva ou duplo consumo.

## Concorrência e saldo negativo no SQLite

Cada alteração deve ocorrer em uma única transação `BEGIN IMMEDIATE`:

1. ler peça e versão;
2. validar inteiros positivos;
3. validar disponível para reserva ou físico para saída;
4. atualizar com predicado atômico;
5. exigir exatamente uma linha alterada;
6. criar/atualizar item;
7. criar movimento e snapshots;
8. confirmar invariantes;
9. commit.

Exemplo conceitual de reserva atômica:

```sql
UPDATE TechnicalPart
SET quantityReserved = quantityReserved + :quantity,
    version = version + 1,
    updatedAt = CURRENT_TIMESTAMP
WHERE id = :id
  AND isActive = 1
  AND quantityOnHand - quantityReserved >= :quantity;
```

Se `changes() != 1`, retornar conflito/estoque insuficiente. O servidor deve configurar `busy_timeout`, limitar duração da transação e nunca manter transação aberta durante chamadas HTTP externas.

## Compatibilidade com legado e permissões

- `requiredParts`, `replacedParts` e `partsCost` permanecem.
- Nenhum texto histórico será convertido automaticamente.
- `partsCost` continua sendo o valor operacional cobrado.
- Usuários operacionais veem quantidade, preço cobrado, totais e disponibilidade.
- `relatorios.financeiro` controla `currentCostPrice`, snapshots de custo, custo total, lucro e margem.
- APIs sem permissão sensível devem omitir ou retornar `null` para custos, sem depender apenas do frontend.

## Relações a acrescentar futuramente

Quando a implementação for autorizada:

```prisma
model ServiceOrder {
  // campos existentes
  technicalParts ServiceOrderPart[]
}
```

Os modelos comerciais `Product`, `ProductSaleItem` e `StockMovement` não devem receber relações com o estoque técnico. A separação física e contábil permanece explícita.
