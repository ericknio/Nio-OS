import { createHash } from "node:crypto";
import type { ServiceOrderPartState } from "@prisma/client";
import { validateCommandContext } from "./commands";
import {
  __withImmediateTransactionForTests,
  __withStockDatabaseForTests,
  withImmediateTransaction,
  withStockDatabase,
} from "./db";
import { stockError, validationError } from "./errors";
import { buildPersistedIdempotencyKey, hashIdempotentPayload } from "./idempotency";
import {
  insertTechnicalPartMovement,
  listMovementsForOrderPartIds,
} from "./movementRepository";
import {
  countActiveOrderParts,
  findActiveOrderPart,
  findOrderPartByLogicalKey,
  findReservationMovementForItem,
  insertReservedOrderPart,
  listOrderPartRows,
} from "./orderPartRepository";
import {
  findTechnicalServiceOrder,
  insertTechnicalPartOrderHistory,
} from "./orderRepository";
import { findTechnicalPartById, reserveTechnicalPartStock } from "./partRepository";
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
  TechnicalPartsForOrderResult,
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
  requireBoolean,
  requireFiniteMoney,
  requireNonEmptyString,
  requirePlainRecord,
  requirePositiveInteger,
  requireVersion,
  roundMoney,
} from "./validation";

type TestLocation = { runtimeRoot: string; databasePath: string };
type FailurePoint = "after_reserve" | "after_item" | "after_movement";
type WriteRunner = <T>(
  operation: string,
  callback: (database: StockDatabase) => T,
) => TransactionResult<T>;
type ReadRunner = <T>(callback: (database: StockDatabase) => T) => T;

type ReserveCommand = {
  technicalPartId: string;
  technicalPartVersion: number;
  quantity: number;
  unitPrice: number;
  confirmReplaceLegacyPartsCost: boolean;
};

const MUTABLE_STATUSES = new Set([
  "RECEBIDO",
  "EM_ANALISE",
  "AGUARDANDO_PECA",
  "EM_REPARO",
]);
const ITEM_STATES = new Set<ServiceOrderPartState>([
  "RESERVED",
  "CONSUMED",
  "RELEASED",
  "REVERSED",
]);

function requireResourceId(value: unknown, field: string): string {
  return requireNonEmptyString(value, field, STOCK_TEXT_LIMITS.ID);
}

function validateReserveCommand(value: unknown): ReserveCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, [
    "technicalPartId",
    "technicalPartVersion",
    "quantity",
    "unitPrice",
    "confirmReplaceLegacyPartsCost",
  ]);
  return {
    technicalPartId: requireResourceId(input.technicalPartId, "technicalPartId"),
    technicalPartVersion: requireVersion(input.technicalPartVersion, "technicalPartVersion"),
    quantity: requirePositiveInteger(input.quantity, "quantity"),
    unitPrice: requireFiniteMoney(input.unitPrice, "unitPrice"),
    confirmReplaceLegacyPartsCost:
      input.confirmReplaceLegacyPartsCost === undefined
        ? false
        : requireBoolean(
          input.confirmReplaceLegacyPartsCost,
          "confirmReplaceLegacyPartsCost",
        ),
  };
}

function stableScope(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function operatorScope(context: InternalCommandContext): string {
  return context.operatorId
    ? `user_${stableScope(context.operatorId)}`
    : "system";
}

function resourceScope(value: string): string {
  return stableScope(value);
}

function logicalKey(
  operation: string,
  serviceOrderId: string,
  partId: string,
  context: InternalCommandContext,
): string {
  return buildPersistedIdempotencyKey({
    namespace: "sop",
    operation,
    version: "v1",
    resources: [
      operatorScope(context),
      resourceScope(serviceOrderId),
      resourceScope(partId),
    ],
    requestKey: context.idempotencyKey,
  });
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
  idempotentReplay: boolean,
): ReserveTechnicalPartResult {
  return {
    item: sanitizeServiceOrderPart(item, context.canViewFinancialData),
    movement: sanitizeTechnicalPartMovement(movement, context.canViewFinancialData),
    totals,
    idempotentReplay,
  };
}

function requireOrder(
  database: StockDatabase,
  serviceOrderId: string,
): TechnicalServiceOrderRecord {
  const order = findTechnicalServiceOrder(database, serviceOrderId);
  if (!order) {
    throw stockError("SERVICE_ORDER_NOT_FOUND", 404, "A ordem de serviço não foi encontrada.");
  }
  return order;
}

function validateMutableOrder(order: TechnicalServiceOrderRecord): void {
  if (
    !MUTABLE_STATUSES.has(order.status) ||
    order.hasFinalization ||
    order.finalizedAt !== null
  ) {
    throw stockError(
      "ORDER_NOT_MUTABLE",
      409,
      "Esta ordem de serviço não permite alteração de peças.",
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
      "Esta OS possui pagamento registrado e não pode ter suas peças alteradas.",
    );
  }
}

function diagnosePart(
  part: TechnicalPartRecord | null,
  version: number,
  quantity: number,
): TechnicalPartRecord {
  if (!part) {
    throw stockError("TECHNICAL_PART_NOT_FOUND", 404, "A peça técnica não foi encontrada.");
  }
  if (!part.isActive) {
    throw stockError("TECHNICAL_PART_INACTIVE", 409, "A peça técnica está inativa.");
  }
  if (part.version !== version) {
    throw stockError("VERSION_CONFLICT", 409, "A peça técnica foi alterada por outra operação.");
  }
  assertVersionCanIncrement(part.version);
  if (part.quantityOnHand !== null) {
    if (part.quantityReserved > part.quantityOnHand) {
      throw stockError(
        "STOCK_INVARIANT_VIOLATION",
        409,
        "O saldo técnico está inconsistente.",
      );
    }
    if (part.quantityOnHand - part.quantityReserved < quantity) {
      throw stockError(
        "INSUFFICIENT_AVAILABLE_STOCK",
        409,
        "O estoque disponível é insuficiente.",
      );
    }
  }
  return part;
}

function activeItemConflict(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (/ServiceOrderPart_active_order_part_key/i.test(message)) {
    throw stockError(
      "PART_ALREADY_ACTIVE_ON_ORDER",
      409,
      "Esta peça já possui um item ativo na ordem de serviço.",
      { internalCause: error },
    );
  }
  throw error;
}

function makeServices(
  write: WriteRunner,
  read: ReadRunner,
  failAfter?: FailurePoint,
) {
  function reserveTechnicalPartForOrder(
    serviceOrderIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): ReserveTechnicalPartResult {
    const serviceOrderId = requireResourceId(serviceOrderIdValue, "serviceOrderId");
    const context = validateCommandContext(contextValue);
    const input = validateReserveCommand(inputValue);
    const itemLogical = logicalKey(
      "reserve",
      serviceOrderId,
      input.technicalPartId,
      context,
    );
    const movementLogical = logicalKey(
      "reservation",
      serviceOrderId,
      input.technicalPartId,
      context,
    );
    const payloadHash = hashIdempotentPayload(input);
    const itemKey = `${itemLogical}:${payloadHash}`;
    const movementKey = `${movementLogical}:${payloadHash}`;

    return write("service-order-part-reserve", (database) => {
      const replayItem = findOrderPartByLogicalKey(database, itemLogical);
      if (replayItem) {
        if (
          replayItem.idempotencyKey !== itemKey ||
          replayItem.serviceOrderId !== serviceOrderId ||
          replayItem.technicalPartId !== input.technicalPartId
        ) {
          throw stockError(
            "IDEMPOTENCY_KEY_REUSED",
            409,
            "A chave de idempotência já foi usada com dados diferentes.",
          );
        }
        const replayMovement = findReservationMovementForItem(database, replayItem.id);
        if (
          !replayMovement ||
          replayMovement.idempotencyKey !== movementKey ||
          replayMovement.serviceOrderPartId !== replayItem.id ||
          replayMovement.technicalPartId !== replayItem.technicalPartId ||
          replayMovement.quantity !== replayItem.quantity
        ) {
          throw stockError(
            "STOCK_INVARIANT_VIOLATION",
            409,
            "O histórico da reserva está inconsistente.",
          );
        }
        return projectResult(
          replayItem,
          replayMovement,
          totalsFromOrder(requireOrder(database, serviceOrderId)),
          context,
          true,
        );
      }

      const order = requireOrder(database, serviceOrderId);
      validateMutableOrder(order);
      const before = diagnosePart(
        findTechnicalPartById(database, input.technicalPartId),
        input.technicalPartVersion,
        input.quantity,
      );
      if (findActiveOrderPart(database, serviceOrderId, input.technicalPartId)) {
        throw stockError(
          "PART_ALREADY_ACTIVE_ON_ORDER",
          409,
          "Esta peça já possui um item ativo na ordem de serviço.",
        );
      }
      const replacingLegacy =
        countActiveOrderParts(database, serviceOrderId) === 0 && order.partsCost > 0;
      if (replacingLegacy && !input.confirmReplaceLegacyPartsCost) {
        throw stockError(
          "LEGACY_PARTS_COST_CONFIRMATION_REQUIRED",
          409,
          "Confirme a substituição do valor manual pela soma dos itens técnicos.",
        );
      }
      if (reserveTechnicalPartStock(database, {
        id: before.id,
        version: input.technicalPartVersion,
        quantity: input.quantity,
      }) !== 1) {
        diagnosePart(
          findTechnicalPartById(database, input.technicalPartId),
          input.technicalPartVersion,
          input.quantity,
        );
        throw stockError(
          "STOCK_INVARIANT_VIOLATION",
          409,
          "Não foi possível reservar a peça técnica.",
        );
      }
      if (failAfter === "after_reserve") throw new Error("laboratory failure");

      const after = findTechnicalPartById(database, before.id)!;
      const totalCostSnapshot = requireFiniteMoney(
        roundMoney(before.currentCostPrice * input.quantity),
        "totalCostSnapshot",
      );
      const totalPriceSnapshot = requireFiniteMoney(
        roundMoney(input.unitPrice * input.quantity),
        "totalPriceSnapshot",
      );
      let item: ServiceOrderPartRecord;
      try {
        item = insertReservedOrderPart(database, {
          serviceOrderId,
          technicalPartId: before.id,
          partNameSnapshot: before.name,
          partSkuSnapshot: before.sku,
          unitCostSnapshot: before.currentCostPrice,
          unitPriceSnapshot: input.unitPrice,
          quantity: input.quantity,
          totalCostSnapshot,
          totalPriceSnapshot,
          responsibleUserId: context.operatorId,
          responsibleUserNameSnapshot: context.operatorName,
          idempotencyKey: itemKey,
        });
      } catch (error) {
        activeItemConflict(error);
      }
      if (failAfter === "after_item") throw new Error("laboratory failure");

      assertTechnicalMovementInvariant({
        type: "RESERVATION",
        quantity: input.quantity,
        onHandBefore: before.quantityOnHand,
        onHandAfter: after.quantityOnHand,
        reservedBefore: before.quantityReserved,
        reservedAfter: after.quantityReserved,
      });
      const movement = insertTechnicalPartMovement(database, {
        technicalPartId: before.id,
        serviceOrderPartId: item.id,
        type: "RESERVATION",
        quantity: input.quantity,
        onHandBefore: before.quantityOnHand,
        onHandAfter: after.quantityOnHand,
        reservedBefore: before.quantityReserved,
        reservedAfter: after.quantityReserved,
        unitCostSnapshot: before.currentCostPrice,
        reason: "Reserva para ordem de serviço",
        operatorId: context.operatorId,
        operatorNameSnapshot: context.operatorName,
        idempotencyKey: movementKey,
      });
      if (failAfter === "after_movement") throw new Error("laboratory failure");

      const totals = recalculateTechnicalPartsOrderTotals(database, serviceOrderId);
      insertTechnicalPartOrderHistory(database, {
        serviceOrderId,
        userName: context.operatorName,
        description: replacingLegacy
          ? `Peça técnica reservada: ${before.name}; quantidade ${input.quantity}. A cobrança manual de peças foi substituída pelos itens técnicos.`
          : `Peça técnica reservada: ${before.name}; quantidade ${input.quantity}.`,
      });
      return projectResult(item, movement, totals, context, false);
    }).value;
  }

  function listTechnicalPartsForOrder(
    serviceOrderIdValue: unknown,
    optionsValue?: unknown,
  ): TechnicalPartsForOrderResult {
    const serviceOrderId = requireResourceId(serviceOrderIdValue, "serviceOrderId");
    const options = optionsValue === undefined ? {} : requirePlainRecord(optionsValue);
    assertAllowedKeys(options, ["canViewFinancialData", "states", "includeHistory"]);
    const canViewFinancialData = options.canViewFinancialData === undefined
      ? false
      : requireBoolean(options.canViewFinancialData, "canViewFinancialData");
    const includeHistory = options.includeHistory === undefined
      ? false
      : requireBoolean(options.includeHistory, "includeHistory");
    let states: ServiceOrderPartState[];
    if (options.states === undefined) {
      states = ["RESERVED", "CONSUMED"];
    } else {
      if (!Array.isArray(options.states) || options.states.length === 0) {
        throw validationError("Informe estados válidos.", { field: "states" });
      }
      states = options.states.map((state) => {
        if (typeof state !== "string" || !ITEM_STATES.has(state as ServiceOrderPartState)) {
          throw validationError("Informe estados válidos.", { field: "states" });
        }
        return state as ServiceOrderPartState;
      });
      states = [...new Set(states)];
    }
    return read((database) => {
      const order = requireOrder(database, serviceOrderId);
      const items = listOrderPartRows(database, serviceOrderId, states).map((item) =>
        sanitizeServiceOrderPart(
          { ...item, subtotal: item.totalPriceSnapshot },
          canViewFinancialData,
        ));
      const result: TechnicalPartsForOrderResult = {
        items,
        totals: totalsFromOrder(order),
      };
      if (includeHistory) {
        result.movements = listMovementsForOrderPartIds(
          database,
          items.map((item) => item.id),
        ).map((movement) =>
          sanitizeTechnicalPartMovement(movement, canViewFinancialData));
      }
      return result;
    });
  }

  return { reserveTechnicalPartForOrder, listTechnicalPartsForOrder };
}

const productionServices = makeServices(
  (operation, callback) => withImmediateTransaction(operation, callback),
  (callback) => withStockDatabase(callback),
);

export const reserveTechnicalPartForOrder = productionServices.reserveTechnicalPartForOrder;
export const listTechnicalPartsForOrder = productionServices.listTechnicalPartsForOrder;

/** @internal Somente para bancos descartáveis de laboratório. */
export function __createOrderPartServicesForTests(
  location: TestLocation,
  options?: { failAfter?: FailurePoint },
) {
  return makeServices(
    (operation, callback) =>
      __withImmediateTransactionForTests(location, operation, callback),
    (callback) => __withStockDatabaseForTests(location, callback),
    options?.failAfter,
  );
}
