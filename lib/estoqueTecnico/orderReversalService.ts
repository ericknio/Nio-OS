import { createHash } from "node:crypto";
import { validateCommandContext } from "./commands";
import {
  __withImmediateTransactionForTests,
  withImmediateTransaction,
} from "./db";
import { stockError, validationError } from "./errors";
import {
  buildPersistedIdempotencyKey,
  hashIdempotentPayload,
} from "./idempotency";
import {
  countMovementsForItemType,
  findConsumptionMovementForItem,
  findMovementByLogicalKey,
  insertTechnicalPartMovement,
} from "./movementRepository";
import {
  findOrderPartById,
  reverseConsumedOrderPart,
} from "./orderPartRepository";
import {
  findTechnicalServiceOrder,
  insertOrderPartMutationHistory,
} from "./orderRepository";
import {
  findServiceOrderTechnicalCommand,
  insertServiceOrderTechnicalCommand,
} from "./orderTechnicalCommandRepository";
import {
  findTechnicalPartById,
  reverseTechnicalPartConsumption,
} from "./partRepository";
import { recalculateTechnicalPartsOrderTotals } from "./recalculateOrder";
import {
  sanitizeServiceOrderPart,
  sanitizeTechnicalPartMovement,
} from "./sanitize";
import type {
  InternalCommandContext,
  ManualReversalResult,
  ServiceOrderPartRecord,
  StockDatabase,
  TechnicalOrderTotals,
  TechnicalPartMovementRecord,
  TechnicalPartRecord,
  TechnicalServiceOrderRecord,
  TransactionResult,
} from "./types";
import {
  STOCK_TEXT_LIMITS,
  assertAllowedKeys,
  assertTechnicalMovementInvariant,
  assertVersionCanIncrement,
  requireNonEmptyString,
  requirePlainRecord,
  requirePositiveInteger,
  requireVersion,
  roundMoney,
} from "./validation";

type TestLocation = { runtimeRoot: string; databasePath: string };
type FailurePoint =
  | "after_part"
  | "after_item"
  | "after_movement"
  | "after_totals"
  | "after_history";
type WriteRunner = <T>(
  operation: string,
  callback: (database: StockDatabase) => T,
) => TransactionResult<T>;

type ManualReversalCommand = {
  technicalPartVersion: number;
  expectedQuantity: number;
  physicalReturnConfirmed: true;
  confirmation: true;
  reason: string;
};

function invariant(message: string): never {
  throw stockError("STOCK_INVARIANT_VIOLATION", 409, message);
}

function stableScope(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function operatorScope(context: InternalCommandContext): string {
  return context.operatorId
    ? `user_${stableScope(context.operatorId)}`
    : "system";
}

function logicalKey(
  itemId: string,
  context: InternalCommandContext,
): string {
  return buildPersistedIdempotencyKey({
    namespace: "sop",
    operation: "manual-reversal",
    version: "v1",
    resources: [operatorScope(context), stableScope(itemId)],
    requestKey: context.idempotencyKey,
  });
}

function validateCommand(value: unknown): ManualReversalCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, [
    "technicalPartVersion",
    "expectedQuantity",
    "physicalReturnConfirmed",
    "confirmation",
    "reason",
  ]);

  if (input.physicalReturnConfirmed !== true) {
    throw validationError(
      "Confirme que a peça retornou fisicamente ao estoque.",
      { field: "physicalReturnConfirmed" },
    );
  }

  if (input.confirmation !== true) {
    throw validationError(
      "Confirme o estorno manual da peça.",
      { field: "confirmation" },
    );
  }

  const reason = requireNonEmptyString(
    input.reason,
    "reason",
    STOCK_TEXT_LIMITS.REASON,
  );

  if (reason.length < 10) {
    throw validationError(
      "Descreva melhor o motivo do estorno manual.",
      { field: "reason" },
    );
  }

  return {
    technicalPartVersion: requireVersion(
      input.technicalPartVersion,
      "technicalPartVersion",
    ),
    expectedQuantity: requirePositiveInteger(
      input.expectedQuantity,
      "expectedQuantity",
    ),
    physicalReturnConfirmed: true,
    confirmation: true,
    reason,
  };
}

function requireItem(
  database: StockDatabase,
  id: string,
): ServiceOrderPartRecord {
  const item = findOrderPartById(database, id);
  if (!item) {
    throw stockError(
      "SERVICE_ORDER_PART_NOT_FOUND",
      404,
      "O item técnico não foi encontrado.",
    );
  }
  return item;
}

function requireOrder(
  database: StockDatabase,
  id: string,
): TechnicalServiceOrderRecord {
  const order = findTechnicalServiceOrder(database, id);
  if (!order) {
    throw stockError(
      "SERVICE_ORDER_NOT_FOUND",
      404,
      "A ordem de serviço não foi encontrada.",
    );
  }
  return order;
}

function validateOrder(order: TechnicalServiceOrderRecord): void {
  if (
    order.status === "ENTREGUE" ||
    order.hasFinalization ||
    order.finalizedAt !== null
  ) {
    throw stockError(
      "ORDER_NOT_MUTABLE",
      409,
      "Esta OS está finalizada/entregue e não permite estorno técnico.",
    );
  }

  if (
    order.paidAmount > 0 ||
    order.paymentPercent > 0 ||
    order.paymentReceivedAt !== null ||
    order.paymentCount > 0
  ) {
    throw stockError(
      "ORDER_HAS_PAYMENTS",
      409,
      "Esta OS possui pagamento registrado e não permite estorno técnico.",
    );
  }
}

function totalsFromOrder(order: TechnicalServiceOrderRecord): TechnicalOrderTotals {
  return {
    partsCost: roundMoney(order.partsCost),
    laborCost: roundMoney(order.laborCost),
    discount: roundMoney(order.discount),
    totalAmount: roundMoney(order.totalAmount),
  };
}

function projectResult(
  item: ServiceOrderPartRecord,
  movement: TechnicalPartMovementRecord,
  totals: TechnicalOrderTotals,
  context: InternalCommandContext,
  replay: boolean,
): ManualReversalResult {
  return {
    item: sanitizeServiceOrderPart(item, context.canViewFinancialData),
    movement: sanitizeTechnicalPartMovement(
      movement,
      context.canViewFinancialData,
    ),
    totals,
    idempotentReplay: replay,
  };
}

function requireConsumedItem(
  item: ServiceOrderPartRecord,
  expectedQuantity: number,
): void {
  if (item.state !== "CONSUMED") {
    throw stockError(
      "SERVICE_ORDER_PART_NOT_CONSUMED",
      409,
      "Somente uma peça consumida pode ser estornada manualmente.",
    );
  }

  if (item.consumedAt === null) {
    invariant("O item consumido não possui data de consumo.");
  }

  if (item.quantity !== expectedQuantity) {
    throw stockError(
      "ORDER_PART_QUANTITY_CONFLICT",
      409,
      "A quantidade da peça foi alterada por outra operação.",
    );
  }
}

function requirePart(
  part: TechnicalPartRecord | null,
  version: number,
): TechnicalPartRecord {
  if (!part) {
    throw stockError(
      "TECHNICAL_PART_NOT_FOUND",
      404,
      "A peça técnica não foi encontrada.",
    );
  }

  if (part.version !== version) {
    throw stockError(
      "VERSION_CONFLICT",
      409,
      "A peça técnica foi alterada por outra operação.",
    );
  }

  try {
    assertVersionCanIncrement(part.version);
  } catch {
    invariant("A versão da peça técnica está inconsistente.");
  }

  return part;
}

function validateConsumptionHistory(
  database: StockDatabase,
  item: ServiceOrderPartRecord,
): TechnicalPartMovementRecord {
  const movement = findConsumptionMovementForItem(database, item.id);

  if (
    !movement ||
    movement.type !== "CONSUMPTION" ||
    movement.serviceOrderPartId !== item.id ||
    movement.technicalPartId !== item.technicalPartId ||
    movement.quantity !== item.quantity ||
    countMovementsForItemType(database, item.id, "CONSUMPTION") !== 1 ||
    countMovementsForItemType(database, item.id, "MANUAL_REVERSAL") !== 0
  ) {
    invariant("O histórico de consumo da peça está inconsistente.");
  }

  assertTechnicalMovementInvariant({
    type: movement.type,
    quantity: movement.quantity,
    onHandBefore: movement.onHandBefore,
    onHandAfter: movement.onHandAfter,
    reservedBefore: movement.reservedBefore,
    reservedAfter: movement.reservedAfter,
  });

  return movement;
}

function historyDescription(
  item: ServiceOrderPartRecord,
  reason: string,
): string {
  return (
    `${item.partNameSnapshot}: estorno manual de ${item.quantity} unidade(s) ` +
    `após confirmação de retorno físico. Motivo: ${reason}`
  ).slice(0, STOCK_TEXT_LIMITS.DESCRIPTION);
}

function makeServices(write: WriteRunner, failAfter?: FailurePoint) {
  function reverseConsumedTechnicalPartManually(
    serviceOrderPartIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): ManualReversalResult {
    const itemId = requireNonEmptyString(
      serviceOrderPartIdValue,
      "serviceOrderPartId",
      STOCK_TEXT_LIMITS.ID,
    );
    const input = validateCommand(inputValue);
    const context = validateCommandContext(contextValue);
    const logical = logicalKey(itemId, context);
    const payloadHash = hashIdempotentPayload(input);
    const persistedKey = `${logical}:${payloadHash}`;

    return write("service-order-part-manual-reversal", (database) => {
      const item = requireItem(database, itemId);
      const order = requireOrder(database, item.serviceOrderId);
      const prior = findServiceOrderTechnicalCommand(database, logical);

      if (prior) {
        if (
          prior.operation !== "MANUAL_REVERSAL" ||
          prior.serviceOrderId !== item.serviceOrderId ||
          prior.payloadHash !== payloadHash ||
          prior.affectedItems !== 1
        ) {
          throw stockError(
            "IDEMPOTENCY_KEY_REUSED",
            409,
            "A chave de idempotência já foi usada com dados diferentes.",
          );
        }

        const movement = findMovementByLogicalKey(database, logical);

        if (
          !movement ||
          movement.idempotencyKey !== persistedKey ||
          movement.type !== "MANUAL_REVERSAL" ||
          movement.serviceOrderPartId !== item.id ||
          movement.technicalPartId !== item.technicalPartId ||
          movement.quantity !== input.expectedQuantity ||
          item.state !== "REVERSED" ||
          item.reversedAt === null ||
          countMovementsForItemType(database, item.id, "MANUAL_REVERSAL") !== 1
        ) {
          invariant("A auditoria do estorno manual está inconsistente.");
        }

        return projectResult(
          item,
          movement,
          totalsFromOrder(order),
          context,
          true,
        );
      }

      if (findMovementByLogicalKey(database, logical)) {
        invariant("Existe movimento de estorno sem comando de auditoria.");
      }

      validateOrder(order);
      requireConsumedItem(item, input.expectedQuantity);
      validateConsumptionHistory(database, item);

      const before = requirePart(
        findTechnicalPartById(database, item.technicalPartId),
        input.technicalPartVersion,
      );
      const unlimited = before.quantityOnHand === null;

      if (
        reverseTechnicalPartConsumption(database, {
          id: before.id,
          version: before.version,
          quantity: item.quantity,
          unlimited,
        }) !== 1
      ) {
        const current = findTechnicalPartById(database, before.id);
        if (!current) {
          throw stockError(
            "TECHNICAL_PART_NOT_FOUND",
            404,
            "A peça técnica não foi encontrada.",
          );
        }
        if (current.version !== before.version) {
          throw stockError(
            "VERSION_CONFLICT",
            409,
            "A peça técnica foi alterada por outra operação.",
          );
        }
        invariant("Não foi possível devolver a peça ao estoque técnico.");
      }

      if (failAfter === "after_part") {
        throw new Error("laboratory failure");
      }

      if (
        reverseConsumedOrderPart(database, {
          id: item.id,
          serviceOrderId: item.serviceOrderId,
          technicalPartId: item.technicalPartId,
          expectedQuantity: item.quantity,
        }) !== 1
      ) {
        requireConsumedItem(requireItem(database, item.id), item.quantity);
        invariant("Não foi possível marcar o item técnico como estornado.");
      }

      if (failAfter === "after_item") {
        throw new Error("laboratory failure");
      }

      const after = findTechnicalPartById(database, before.id);
      if (!after) {
        invariant("A peça técnica desapareceu durante o estorno.");
      }

      assertTechnicalMovementInvariant({
        type: "MANUAL_REVERSAL",
        quantity: item.quantity,
        onHandBefore: before.quantityOnHand,
        onHandAfter: after.quantityOnHand,
        reservedBefore: before.quantityReserved,
        reservedAfter: after.quantityReserved,
      });

      const movement = insertTechnicalPartMovement(database, {
        technicalPartId: item.technicalPartId,
        serviceOrderPartId: item.id,
        type: "MANUAL_REVERSAL",
        quantity: item.quantity,
        onHandBefore: before.quantityOnHand,
        onHandAfter: after.quantityOnHand,
        reservedBefore: before.quantityReserved,
        reservedAfter: after.quantityReserved,
        unitCostSnapshot: item.unitCostSnapshot,
        reason: input.reason,
        operatorId: context.operatorId,
        operatorNameSnapshot: context.operatorName,
        idempotencyKey: persistedKey,
      });

      if (failAfter === "after_movement") {
        throw new Error("laboratory failure");
      }

      const totals = recalculateTechnicalPartsOrderTotals(
        database,
        item.serviceOrderId,
      );

      if (failAfter === "after_totals") {
        throw new Error("laboratory failure");
      }

      insertOrderPartMutationHistory(database, {
        serviceOrderId: item.serviceOrderId,
        userName: context.operatorName,
        action: "PECA_TECNICA_ESTORNO_MANUAL",
        description: historyDescription(item, input.reason),
      });

      if (failAfter === "after_history") {
        throw new Error("laboratory failure");
      }

      insertServiceOrderTechnicalCommand(database, {
        logicalKey: logical,
        payloadHash,
        operation: "MANUAL_REVERSAL",
        serviceOrderId: item.serviceOrderId,
        operatorId: context.operatorId,
        operatorNameSnapshot: context.operatorName,
        affectedItems: 1,
        resultOrderStatus: order.status,
      });

      return projectResult(
        requireItem(database, item.id),
        movement,
        totals,
        context,
        false,
      );
    }).value;
  }

  return { reverseConsumedTechnicalPartManually };
}

const productionServices = makeServices(
  (operation, callback) => withImmediateTransaction(operation, callback),
);

export const reverseConsumedTechnicalPartManually =
  productionServices.reverseConsumedTechnicalPartManually;

/** @internal Somente para bancos descartáveis de laboratório. */
export function __createOrderReversalServicesForTests(
  location: TestLocation,
  options?: { failAfter?: FailurePoint },
) {
  return makeServices(
    (operation, callback) =>
      __withImmediateTransactionForTests(location, operation, callback),
    options?.failAfter,
  );
}
