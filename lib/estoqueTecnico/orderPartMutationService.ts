import { createHash } from "node:crypto";
import { validateCommandContext } from "./commands";
import {
  __withImmediateTransactionForTests,
  withImmediateTransaction,
} from "./db";
import { stockError, validationError } from "./errors";
import { buildPersistedIdempotencyKey, hashIdempotentPayload } from "./idempotency";
import {
  findMovementByLogicalKey,
  insertTechnicalPartMovement,
} from "./movementRepository";
import {
  findOrderPartById,
  releaseReservedOrderPart,
  updateReservedOrderPartQuantity,
} from "./orderPartRepository";
import {
  findTechnicalServiceOrder,
  insertOrderPartMutationHistory,
} from "./orderRepository";
import {
  decreaseTechnicalPartReservation,
  findTechnicalPartById,
  increaseTechnicalPartReservation,
} from "./partRepository";
import { recalculateTechnicalPartsOrderTotals } from "./recalculateOrder";
import {
  sanitizeServiceOrderPart,
  sanitizeTechnicalPartMovement,
} from "./sanitize";
import type {
  InternalCommandContext,
  ReserveTechnicalPartResult,
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
type FailurePoint = "after_part" | "after_item" | "after_movement";
type WriteRunner = <T>(
  operation: string,
  callback: (database: StockDatabase) => T,
) => TransactionResult<T>;

type ChangeQuantityCommand = {
  technicalPartVersion: number;
  expectedQuantity: number;
  newQuantity: number;
  reason: string;
};

type ReleaseCommand = {
  technicalPartVersion: number;
  expectedQuantity: number;
  reason: string;
};

const MUTABLE_STATUSES = new Set([
  "RECEBIDO",
  "EM_ANALISE",
  "AGUARDANDO_PECA",
  "EM_REPARO",
]);

function requireResourceId(value: unknown, field: string): string {
  return requireNonEmptyString(value, field, STOCK_TEXT_LIMITS.ID);
}

function validateChangeCommand(value: unknown): ChangeQuantityCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, [
    "technicalPartVersion",
    "expectedQuantity",
    "newQuantity",
    "reason",
  ]);
  const expectedQuantity = requirePositiveInteger(input.expectedQuantity, "expectedQuantity");
  const newQuantity = requirePositiveInteger(input.newQuantity, "newQuantity");
  if (expectedQuantity === newQuantity) {
    throw validationError("Informe uma quantidade diferente da atual.", { field: "newQuantity" });
  }
  return {
    technicalPartVersion: requireVersion(input.technicalPartVersion, "technicalPartVersion"),
    expectedQuantity,
    newQuantity,
    reason: requireNonEmptyString(input.reason, "reason", STOCK_TEXT_LIMITS.REASON),
  };
}

function validateReleaseCommand(value: unknown): ReleaseCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, ["technicalPartVersion", "expectedQuantity", "reason"]);
  return {
    technicalPartVersion: requireVersion(input.technicalPartVersion, "technicalPartVersion"),
    expectedQuantity: requirePositiveInteger(input.expectedQuantity, "expectedQuantity"),
    reason: requireNonEmptyString(input.reason, "reason", STOCK_TEXT_LIMITS.REASON),
  };
}

function stableScope(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function logicalKey(
  operation: "change-quantity" | "release",
  itemId: string,
  context: InternalCommandContext,
): string {
  return buildPersistedIdempotencyKey({
    namespace: "sop",
    operation,
    version: "v1",
    resources: [context.operatorId ? `user_${stableScope(context.operatorId)}` : "system", stableScope(itemId)],
    requestKey: context.idempotencyKey,
  });
}

function requireItem(database: StockDatabase, id: string): ServiceOrderPartRecord {
  const item = findOrderPartById(database, id);
  if (!item) {
    throw stockError("SERVICE_ORDER_PART_NOT_FOUND", 404, "O item técnico não foi encontrado.");
  }
  return item;
}

function requireOrder(database: StockDatabase, id: string): TechnicalServiceOrderRecord {
  const order = findTechnicalServiceOrder(database, id);
  if (!order) {
    throw stockError("SERVICE_ORDER_NOT_FOUND", 404, "A ordem de serviço não foi encontrada.");
  }
  return order;
}

function validateMutableOrder(order: TechnicalServiceOrderRecord): void {
  if (!MUTABLE_STATUSES.has(order.status) || order.hasFinalization || order.finalizedAt !== null) {
    throw stockError("ORDER_NOT_MUTABLE", 409, "Esta ordem de serviço não permite alteração de peças.");
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
      "Esta OS possui pagamento registrado e não pode ter suas peças alteradas.",
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
): ReserveTechnicalPartResult {
  return {
    item: sanitizeServiceOrderPart(item, context.canViewFinancialData),
    movement: sanitizeTechnicalPartMovement(movement, context.canViewFinancialData),
    totals,
    idempotentReplay: replay,
  };
}

function requireReservedItem(item: ServiceOrderPartRecord, expectedQuantity: number): void {
  if (item.state !== "RESERVED") {
    throw stockError(
      "SERVICE_ORDER_PART_NOT_RESERVED",
      409,
      "O item técnico não está reservado.",
    );
  }
  if (item.quantity !== expectedQuantity) {
    throw stockError(
      "ORDER_PART_QUANTITY_CONFLICT",
      409,
      "O item reservado foi alterado por outra operação.",
    );
  }
}

function diagnosePart(
  part: TechnicalPartRecord | null,
  version: number,
  delta: number,
  increase: boolean,
): TechnicalPartRecord {
  if (!part) {
    throw stockError("TECHNICAL_PART_NOT_FOUND", 404, "A peça técnica não foi encontrada.");
  }
  if (part.version !== version) {
    throw stockError("VERSION_CONFLICT", 409, "A peça técnica foi alterada por outra operação.");
  }
  assertVersionCanIncrement(part.version);
  if (increase) {
    if (!part.isActive) {
      throw stockError("TECHNICAL_PART_INACTIVE", 409, "A peça técnica está inativa.");
    }
    if (part.quantityOnHand !== null && part.quantityOnHand - part.quantityReserved < delta) {
      throw stockError("INSUFFICIENT_AVAILABLE_STOCK", 409, "O estoque disponível é insuficiente.");
    }
  } else if (part.quantityReserved < delta) {
    throw stockError("STOCK_INVARIANT_VIOLATION", 409, "O saldo reservado está inconsistente.");
  }
  return part;
}

function historyDescription(value: string): string {
  return value.slice(0, STOCK_TEXT_LIMITS.DESCRIPTION);
}

function makeServices(write: WriteRunner, failAfter?: FailurePoint) {
  function changeReservedTechnicalPartQuantity(
    serviceOrderPartIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): ReserveTechnicalPartResult {
    const itemId = requireResourceId(serviceOrderPartIdValue, "serviceOrderPartId");
    const input = validateChangeCommand(inputValue);
    const context = validateCommandContext(contextValue);
    const increase = input.newQuantity > input.expectedQuantity;
    const delta = Math.abs(input.newQuantity - input.expectedQuantity);
    const expectedType = increase ? "RESERVATION_INCREASE" : "RESERVATION_DECREASE";
    const logical = logicalKey("change-quantity", itemId, context);
    const payloadHash = hashIdempotentPayload(input);
    const persistedKey = `${logical}:${payloadHash}`;

    return write("service-order-part-change-quantity", (database) => {
      const replayMovement = findMovementByLogicalKey(database, logical);
      if (replayMovement) {
        if (replayMovement.idempotencyKey !== persistedKey) {
          throw stockError("IDEMPOTENCY_KEY_REUSED", 409, "A chave de idempotência já foi usada com dados diferentes.");
        }
        const replayItem = requireItem(database, itemId);
        if (
          replayMovement.type !== expectedType ||
          replayMovement.quantity !== delta ||
          replayMovement.serviceOrderPartId !== replayItem.id ||
          replayMovement.technicalPartId !== replayItem.technicalPartId
        ) {
          throw stockError("STOCK_INVARIANT_VIOLATION", 409, "O histórico da alteração está inconsistente.");
        }
        return projectResult(
          replayItem,
          replayMovement,
          totalsFromOrder(requireOrder(database, replayItem.serviceOrderId)),
          context,
          true,
        );
      }

      const item = requireItem(database, itemId);
      requireReservedItem(item, input.expectedQuantity);
      validateMutableOrder(requireOrder(database, item.serviceOrderId));
      const before = diagnosePart(
        findTechnicalPartById(database, item.technicalPartId),
        input.technicalPartVersion,
        delta,
        increase,
      );
      const changed = increase
        ? increaseTechnicalPartReservation(database, { id: before.id, version: before.version, quantity: delta })
        : decreaseTechnicalPartReservation(database, { id: before.id, version: before.version, quantity: delta });
      if (changed !== 1) {
        diagnosePart(findTechnicalPartById(database, before.id), before.version, delta, increase);
        throw stockError("STOCK_INVARIANT_VIOLATION", 409, "Não foi possível alterar a reserva técnica.");
      }
      if (failAfter === "after_part") throw new Error("laboratory failure");

      if (updateReservedOrderPartQuantity(database, {
        id: item.id,
        expectedQuantity: input.expectedQuantity,
        newQuantity: input.newQuantity,
      }) !== 1) {
        requireReservedItem(requireItem(database, item.id), input.expectedQuantity);
        throw stockError("STOCK_INVARIANT_VIOLATION", 409, "Não foi possível alterar o item reservado.");
      }
      if (failAfter === "after_item") throw new Error("laboratory failure");

      const after = findTechnicalPartById(database, before.id)!;
      assertTechnicalMovementInvariant({
        type: expectedType,
        quantity: delta,
        onHandBefore: before.quantityOnHand,
        onHandAfter: after.quantityOnHand,
        reservedBefore: before.quantityReserved,
        reservedAfter: after.quantityReserved,
      });
      const movement = insertTechnicalPartMovement(database, {
        technicalPartId: before.id,
        serviceOrderPartId: item.id,
        type: expectedType,
        quantity: delta,
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
      if (failAfter === "after_movement") throw new Error("laboratory failure");

      const totals = recalculateTechnicalPartsOrderTotals(database, item.serviceOrderId);
      insertOrderPartMutationHistory(database, {
        serviceOrderId: item.serviceOrderId,
        userName: context.operatorName,
        action: increase
          ? "PECA_TECNICA_RESERVA_AUMENTADA"
          : "PECA_TECNICA_RESERVA_REDUZIDA",
        description: historyDescription(
          `${item.partNameSnapshot}: quantidade alterada de ${input.expectedQuantity} para ${input.newQuantity}.`,
        ),
      });
      return projectResult(requireItem(database, item.id), movement, totals, context, false);
    }).value;
  }

  function releaseTechnicalPartFromOrder(
    serviceOrderPartIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): ReserveTechnicalPartResult {
    const itemId = requireResourceId(serviceOrderPartIdValue, "serviceOrderPartId");
    const input = validateReleaseCommand(inputValue);
    const context = validateCommandContext(contextValue);
    const logical = logicalKey("release", itemId, context);
    const payloadHash = hashIdempotentPayload(input);
    const persistedKey = `${logical}:${payloadHash}`;

    return write("service-order-part-release", (database) => {
      const replayMovement = findMovementByLogicalKey(database, logical);
      if (replayMovement) {
        if (replayMovement.idempotencyKey !== persistedKey) {
          throw stockError("IDEMPOTENCY_KEY_REUSED", 409, "A chave de idempotência já foi usada com dados diferentes.");
        }
        const replayItem = requireItem(database, itemId);
        if (
          replayMovement.type !== "RELEASE" ||
          replayMovement.quantity !== input.expectedQuantity ||
          replayMovement.serviceOrderPartId !== replayItem.id ||
          replayMovement.technicalPartId !== replayItem.technicalPartId
        ) {
          throw stockError("STOCK_INVARIANT_VIOLATION", 409, "O histórico da liberação está inconsistente.");
        }
        return projectResult(
          replayItem,
          replayMovement,
          totalsFromOrder(requireOrder(database, replayItem.serviceOrderId)),
          context,
          true,
        );
      }

      const item = requireItem(database, itemId);
      requireReservedItem(item, input.expectedQuantity);
      validateMutableOrder(requireOrder(database, item.serviceOrderId));
      const before = diagnosePart(
        findTechnicalPartById(database, item.technicalPartId),
        input.technicalPartVersion,
        item.quantity,
        false,
      );
      if (decreaseTechnicalPartReservation(database, {
        id: before.id,
        version: before.version,
        quantity: item.quantity,
      }) !== 1) {
        diagnosePart(findTechnicalPartById(database, before.id), before.version, item.quantity, false);
        throw stockError("STOCK_INVARIANT_VIOLATION", 409, "Não foi possível liberar a reserva técnica.");
      }
      if (failAfter === "after_part") throw new Error("laboratory failure");

      if (releaseReservedOrderPart(database, { id: item.id, expectedQuantity: item.quantity }) !== 1) {
        requireReservedItem(requireItem(database, item.id), item.quantity);
        throw stockError("STOCK_INVARIANT_VIOLATION", 409, "Não foi possível liberar o item técnico.");
      }
      if (failAfter === "after_item") throw new Error("laboratory failure");

      const after = findTechnicalPartById(database, before.id)!;
      assertTechnicalMovementInvariant({
        type: "RELEASE",
        quantity: item.quantity,
        onHandBefore: before.quantityOnHand,
        onHandAfter: after.quantityOnHand,
        reservedBefore: before.quantityReserved,
        reservedAfter: after.quantityReserved,
      });
      const movement = insertTechnicalPartMovement(database, {
        technicalPartId: before.id,
        serviceOrderPartId: item.id,
        type: "RELEASE",
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
      if (failAfter === "after_movement") throw new Error("laboratory failure");

      const totals = recalculateTechnicalPartsOrderTotals(database, item.serviceOrderId);
      insertOrderPartMutationHistory(database, {
        serviceOrderId: item.serviceOrderId,
        userName: context.operatorName,
        action: "PECA_TECNICA_LIBERADA",
        description: historyDescription(
          `${item.partNameSnapshot}: ${item.quantity} unidade(s) liberada(s). Motivo: ${input.reason}`,
        ),
      });
      return projectResult(requireItem(database, item.id), movement, totals, context, false);
    }).value;
  }

  return { changeReservedTechnicalPartQuantity, releaseTechnicalPartFromOrder };
}

const productionServices = makeServices(
  (operation, callback) => withImmediateTransaction(operation, callback),
);

export const changeReservedTechnicalPartQuantity =
  productionServices.changeReservedTechnicalPartQuantity;
export const releaseTechnicalPartFromOrder = productionServices.releaseTechnicalPartFromOrder;

/** @internal Somente para bancos descartáveis de laboratório. */
export function __createOrderPartMutationServicesForTests(
  location: TestLocation,
  options?: { failAfter?: FailurePoint },
) {
  return makeServices(
    (operation, callback) => __withImmediateTransactionForTests(location, operation, callback),
    options?.failAfter,
  );
}
