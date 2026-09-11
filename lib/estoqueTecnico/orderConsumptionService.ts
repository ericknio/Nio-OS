/**
 * @file lib/estoqueTecnico/orderConsumptionService.ts
 * @description Serviço de transição atômica de status para PRONTO (`markServiceOrderReadyAndConsumeTechnicalParts`).
 * 
 * Executa a baixa definitiva em lote:
 * 1. Converte todas as peças com status `RESERVED` na O.S. para `CONSUMED`.
 * 2. Baixa a reserva e o saldo físico em estoque de cada peça (`quantityOnHand - qty` e `quantityReserved - qty`).
 * 3. Cria registros de movimentação do tipo `ORDER_CONSUMPTION` com snapshots do custo de aquisição.
 * 4. Captura o snapshot do percentual de participação nos lucros do técnico (`technicianProfitPercentSnapshot`).
 * 5. Atualiza o status da O.S. para `PRONTO`.
 */

import { createHash } from "node:crypto";
import { validateCommandContext } from "./commands";
import { __withImmediateTransactionForTests, withImmediateTransaction } from "./db";
import { stockError, validationError } from "./errors";
import { buildPersistedIdempotencyKey, hashIdempotentPayload } from "./idempotency";
import {
  findConsumptionMovementForItem,
  insertTechnicalPartMovement,
  countConsumptionMovementsForItem,
  listConsumptionMovementsForCommand,
} from "./movementRepository";
import {
  consumeReservedOrderPart,
  findOrderPartById,
  listReservedOrderParts,
} from "./orderPartRepository";
import {
  findActiveTechnicianForReady,
  findTechnicalServiceOrder,
  insertReadyStatusHistory,
  insertTechnicalConsumptionHistory,
  markTechnicalServiceOrderReady,
} from "./orderRepository";
import {
  findServiceOrderTechnicalCommand,
  insertServiceOrderTechnicalCommand,
} from "./orderTechnicalCommandRepository";
import {
  consumeTechnicalPartReservation,
  findTechnicalPartById,
} from "./partRepository";
import { recalculateTechnicalPartsOrderTotals } from "./recalculateOrder";
import { sanitizeServiceOrderPart, sanitizeTechnicalPartMovement } from "./sanitize";
import type {
  ConsumeReadyResult,
  InternalCommandContext,
  ServiceOrderPartRecord,
  StockDatabase,
  TechnicalPartMovementRecord,
  TechnicalPartRecord,
  TechnicalServiceOrderRecord,
  TransactionResult,
} from "./types";
import {
  STOCK_NUMERIC_LIMITS,
  STOCK_TEXT_LIMITS,
  assertAllowedKeys,
  assertTechnicalMovementInvariant,
  requireBoolean,
  requireNonEmptyString,
  requirePlainRecord,
  requirePositiveInteger,
} from "./validation";

type TestLocation = { runtimeRoot: string; databasePath: string };
type FailurePoint =
  | "after_first_part"
  | "after_first_item"
  | "after_first_movement"
  | "after_all_items"
  | "after_status"
  | "after_history"
  | "before_command_log";
type WriteRunner = <T>(operation: string, callback: (database: StockDatabase) => T) => TransactionResult<T>;

type ReadyCommand = {
  expectedCurrentStatus: "RECEBIDO" | "EM_ANALISE" | "AGUARDANDO_PECA" | "EM_REPARO";
  confirmation: true;
  technicianResponsible?: string;
  technicianUserId?: string;
};

const STATUS_LABELS: Record<ReadyCommand["expectedCurrentStatus"], string> = {
  RECEBIDO: "Recebido",
  EM_ANALISE: "Em análise",
  AGUARDANDO_PECA: "Aguardando peça",
  EM_REPARO: "Em reparo",
};

function validateReadyCommand(value: unknown): ReadyCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, [
    "expectedCurrentStatus",
    "confirmation",
    "technicianResponsible",
    "technicianUserId",
  ]);
  const status = requireNonEmptyString(input.expectedCurrentStatus, "expectedCurrentStatus", 40);
  if (!(status in STATUS_LABELS)) {
    throw validationError("O status atual esperado é inválido.", { field: "expectedCurrentStatus" });
  }
  if (requireBoolean(input.confirmation, "confirmation") !== true) {
    throw validationError("Confirme a conclusão do reparo.", { field: "confirmation" });
  }

  const hasTechnicianUserId = input.technicianUserId !== undefined;
  const hasLegacyTechnician = input.technicianResponsible !== undefined;
  if (hasTechnicianUserId === hasLegacyTechnician) {
    throw validationError(
      "Informe exatamente um técnico responsável.",
      { field: "technicianUserId" },
    );
  }

  return {
    expectedCurrentStatus: status as ReadyCommand["expectedCurrentStatus"],
    confirmation: true,
    ...(hasTechnicianUserId
      ? {
          technicianUserId: requireNonEmptyString(
            input.technicianUserId,
            "technicianUserId",
            STOCK_TEXT_LIMITS.ID,
          ),
        }
      : {
          technicianResponsible: requireNonEmptyString(
            input.technicianResponsible,
            "technicianResponsible",
            120,
          ),
        }),
  };
}

function stableScope(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function operatorScope(context: InternalCommandContext): string {
  return context.operatorId ? `user_${stableScope(context.operatorId)}` : "system";
}

function commandLogicalKey(
  orderId: string,
  context: InternalCommandContext,
): string {
  return buildPersistedIdempotencyKey({
    namespace: "so",
    operation: "consume-ready",
    version: "v1",
    resources: [operatorScope(context), stableScope(orderId)],
    requestKey: context.idempotencyKey,
  });
}

function movementKey(
  orderId: string,
  itemId: string,
  context: InternalCommandContext,
  payloadHash: string,
): string {
  return `${buildPersistedIdempotencyKey({
    namespace: "sop",
    operation: "consume",
    version: "v1",
    resources: [operatorScope(context), stableScope(orderId), stableScope(itemId)],
    requestKey: context.idempotencyKey,
  })}:${payloadHash}`;
}

function movementCommandPattern(
  orderId: string,
  context: InternalCommandContext,
  payloadHash: string,
): string {
  const escapeLike = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  // Movimento: sop:consume:v1:{operator}:{order}:{item}:{requestKey}:{hash}.
  // O item varia entre os movimentos do mesmo comando; a chave externa e o
  // hash permanecem fixos e são delimitados para não aceitar outro comando.
  const commandPrefix = [
    "sop",
    "consume",
    "v1",
    operatorScope(context),
    stableScope(orderId),
  ].join(":");
  return `${escapeLike(commandPrefix)}:%:${escapeLike(context.idempotencyKey)}:${escapeLike(payloadHash)}`;
}

function requireOrder(database: StockDatabase, id: string): TechnicalServiceOrderRecord {
  const order = findTechnicalServiceOrder(database, id);
  if (!order) throw stockError("SERVICE_ORDER_NOT_FOUND", 404, "A ordem de serviço não foi encontrada.");
  return order;
}

function project(
  order: TechnicalServiceOrderRecord,
  items: ServiceOrderPartRecord[],
  movements: TechnicalPartMovementRecord[],
  context: InternalCommandContext,
  replay: boolean,
): ConsumeReadyResult {
  return {
    order: {
      id: order.id,
      status: order.status,
      technicianResponsible: order.technicianResponsible,
      technicianUserId: order.technicianUserId,
      ...(context.canViewFinancialData
        ? { technicianProfitPercentSnapshot: order.technicianProfitPercentSnapshot }
        : {}),
      partsCost: order.partsCost,
      laborCost: order.laborCost,
      discount: order.discount,
      totalAmount: order.totalAmount,
    },
    consumedItems: items.map((item) => sanitizeServiceOrderPart(item, context.canViewFinancialData)),
    movements: movements.map((movement) => sanitizeTechnicalPartMovement(movement, context.canViewFinancialData)),
    affectedItems: items.length,
    affectedUnits: items.reduce((total, item) => total + item.quantity, 0),
    idempotentReplay: replay,
  };
}

function invariant(message: string): never {
  throw stockError("STOCK_INVARIANT_VIOLATION", 409, message);
}

function validatePair(item: ServiceOrderPartRecord, part: TechnicalPartRecord | null): TechnicalPartRecord {
  if (!part) throw stockError("TECHNICAL_PART_NOT_FOUND", 404, "A peça técnica não foi encontrada.");
  if (item.technicalPartId !== part.id) invariant("O vínculo do item técnico está inconsistente.");
  try {
    requirePositiveInteger(item.quantity, "quantity");
  } catch {
    invariant("A quantidade do item técnico está inconsistente.");
  }
  if (!Number.isSafeInteger(part.version) || part.version >= STOCK_NUMERIC_LIMITS.MAX_VERSION) {
    invariant("A versão da peça técnica está inconsistente.");
  }
  if (part.quantityReserved < item.quantity) invariant("O saldo reservado está inconsistente.");
  if (part.quantityOnHand !== null && part.quantityOnHand < item.quantity) {
    invariant("O saldo físico está inconsistente.");
  }
  return part;
}

function makeServices(write: WriteRunner, failAfter?: FailurePoint) {
  function markServiceOrderReadyAndConsumeTechnicalParts(
    serviceOrderIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): ConsumeReadyResult {
    const serviceOrderId = requireNonEmptyString(serviceOrderIdValue, "serviceOrderId", STOCK_TEXT_LIMITS.ID);
    const input = validateReadyCommand(inputValue);
    const context = validateCommandContext(contextValue);
    const logicalKey = commandLogicalKey(serviceOrderId, context);
    const payloadHash = hashIdempotentPayload(input);

    return write("service-order-ready-consume", (database) => {
      const priorCommand = findServiceOrderTechnicalCommand(database, logicalKey);
      if (priorCommand) {
        if (
          priorCommand.operation !== "CONSUME_ON_READY" ||
          priorCommand.serviceOrderId !== serviceOrderId ||
          priorCommand.payloadHash !== payloadHash
        ) {
          throw stockError("IDEMPOTENCY_KEY_REUSED", 409, "A chave de idempotência já foi usada com dados diferentes.");
        }
        const replayMovements = listConsumptionMovementsForCommand(database, {
          serviceOrderId,
          movementPattern: movementCommandPattern(serviceOrderId, context, payloadHash),
        });
        const replayItems: ServiceOrderPartRecord[] = [];
        const itemIds = new Set<string>();
        for (const movement of replayMovements) {
          if (!movement.serviceOrderPartId || itemIds.has(movement.serviceOrderPartId)) {
            invariant("O histórico do consumo técnico está inconsistente.");
          }
          const item = findOrderPartById(database, movement.serviceOrderPartId);
          if (!item || item.serviceOrderId !== serviceOrderId) {
            invariant("O vínculo do consumo técnico está inconsistente.");
          }
          if (item.state !== "CONSUMED" && item.state !== "REVERSED") {
            invariant("O estado atual do item técnico está inconsistente.");
          }
          if (
            movement.type !== "CONSUMPTION" ||
            movement.technicalPartId !== item.technicalPartId ||
            movement.quantity !== item.quantity ||
            movement.idempotencyKey !== movementKey(serviceOrderId, item.id, context, payloadHash)
          ) {
            invariant("O histórico do consumo técnico está inconsistente.");
          }
          if (countConsumptionMovementsForItem(database, item.id) !== 1) {
            invariant("Existem múltiplos movimentos de consumo para o item técnico.");
          }
          itemIds.add(item.id);
          replayItems.push(item);
        }
        if (replayItems.length !== priorCommand.affectedItems) {
          invariant("A auditoria do consumo técnico está inconsistente.");
        }
        return project(requireOrder(database, serviceOrderId), replayItems, replayMovements, context, true);
      }

      const order = requireOrder(database, serviceOrderId);
      if (order.status !== input.expectedCurrentStatus) {
        throw stockError("ORDER_STATUS_CONFLICT", 409, "A ordem de serviço foi alterada por outra operação.");
      }
      if (order.hasFinalization || order.finalizedAt !== null) {
        throw stockError("ORDER_NOT_MUTABLE", 409, "Esta ordem de serviço não pode ser marcada como pronta.");
      }



      let technicianResponsible: string;
      let technicianUserId: string | null = null;
      let technicianProfitPercentSnapshot: number | null = null;

      if (input.technicianUserId) {
        const technician = findActiveTechnicianForReady(database, input.technicianUserId);
        if (!technician) {
          throw validationError(
            "Selecione um técnico ativo cadastrado no sistema.",
            { field: "technicianUserId" },
          );
        }
        if (!technician.name.trim()) {
          invariant("O cadastro do técnico está inconsistente.");
        }
        if (
          !Number.isFinite(technician.profitSharePercent) ||
          technician.profitSharePercent < 0 ||
          technician.profitSharePercent > 100
        ) {
          invariant("O percentual de participação do técnico está inconsistente.");
        }

        technicianResponsible = technician.name.trim();
        technicianUserId = technician.id;
        technicianProfitPercentSnapshot = technician.profitShareEnabled
          ? Math.round((technician.profitSharePercent + Number.EPSILON) * 100) / 100
          : 0;
      } else {
        technicianResponsible = input.technicianResponsible!;
      }

      const items = listReservedOrderParts(database, serviceOrderId);
      const pairs = items.map((item) => {
        if (findConsumptionMovementForItem(database, item.id)) {
          invariant("O item técnico já possui consumo registrado.");
        }
        return { item, part: validatePair(item, findTechnicalPartById(database, item.technicalPartId)) };
      });

      const movements: TechnicalPartMovementRecord[] = [];
      for (let index = 0; index < pairs.length; index += 1) {
        const { item, part } = pairs[index];
        if (consumeTechnicalPartReservation(database, {
          id: part.id,
          version: part.version,
          quantity: item.quantity,
          unlimited: part.quantityOnHand === null,
        }) !== 1) invariant("Não foi possível consumir o saldo técnico.");
        if (index === 0 && failAfter === "after_first_part") throw new Error("laboratory failure");

        if (consumeReservedOrderPart(database, {
          id: item.id,
          serviceOrderId,
          technicalPartId: part.id,
          quantity: item.quantity,
        }) !== 1) invariant("Não foi possível consumir o item técnico.");
        if (index === 0 && failAfter === "after_first_item") throw new Error("laboratory failure");

        const after = findTechnicalPartById(database, part.id)!;
        assertTechnicalMovementInvariant({
          type: "CONSUMPTION",
          quantity: item.quantity,
          onHandBefore: part.quantityOnHand,
          onHandAfter: after.quantityOnHand,
          reservedBefore: part.quantityReserved,
          reservedAfter: after.quantityReserved,
        });
        const movement = insertTechnicalPartMovement(database, {
          technicalPartId: part.id,
          serviceOrderPartId: item.id,
          type: "CONSUMPTION",
          quantity: item.quantity,
          onHandBefore: part.quantityOnHand,
          onHandAfter: after.quantityOnHand,
          reservedBefore: part.quantityReserved,
          reservedAfter: after.quantityReserved,
          unitCostSnapshot: item.unitCostSnapshot,
          reason: "Consumo ao concluir reparo da ordem de serviço",
          operatorId: context.operatorId,
          operatorNameSnapshot: context.operatorName,
          idempotencyKey: movementKey(serviceOrderId, item.id, context, payloadHash),
        });
        movements.push(movement);
        if (index === 0 && failAfter === "after_first_movement") throw new Error("laboratory failure");
      }
      if (failAfter === "after_all_items") throw new Error("laboratory failure");

      if (markTechnicalServiceOrderReady(database, {
        id: serviceOrderId,
        expectedStatus: input.expectedCurrentStatus,
        technicianResponsible,
        technicianUserId,
        technicianProfitPercentSnapshot,
      }) !== 1) {
        const current = requireOrder(database, serviceOrderId);
        if (current.status !== input.expectedCurrentStatus) {
          throw stockError("ORDER_STATUS_CONFLICT", 409, "A ordem de serviço foi alterada por outra operação.");
        }
        throw stockError("ORDER_NOT_MUTABLE", 409, "Esta ordem de serviço não pode ser marcada como pronta.");
      }
      if (failAfter === "after_status") throw new Error("laboratory failure");

      recalculateTechnicalPartsOrderTotals(database, serviceOrderId);
      insertReadyStatusHistory(database, {
        serviceOrderId,
        userName: context.operatorName,
        previousStatusLabel: STATUS_LABELS[input.expectedCurrentStatus],
        technicianResponsible,
      });
      const affectedUnits = items.reduce((total, item) => total + item.quantity, 0);
      if (items.length > 0) {
        insertTechnicalConsumptionHistory(database, {
          serviceOrderId,
          userName: context.operatorName,
          affectedItems: items.length,
          affectedUnits,
        });
      }
      if (failAfter === "after_history") throw new Error("laboratory failure");
      if (failAfter === "before_command_log") throw new Error("laboratory failure");

      insertServiceOrderTechnicalCommand(database, {
        logicalKey,
        payloadHash,
        operation: "CONSUME_ON_READY",
        serviceOrderId,
        operatorId: context.operatorId,
        operatorNameSnapshot: context.operatorName,
        affectedItems: items.length,
        resultOrderStatus: "PRONTO",
      });
      return project(requireOrder(database, serviceOrderId), items.map((item) => ({
        ...item,
        state: "CONSUMED",
        consumedAt: findConsumptionMovementForItem(database, item.id)!.createdAt,
      })), movements, context, false);
    }).value;
  }

  return { markServiceOrderReadyAndConsumeTechnicalParts };
}

const productionServices = makeServices(
  (operation, callback) => withImmediateTransaction(operation, callback),
);

export const markServiceOrderReadyAndConsumeTechnicalParts =
  productionServices.markServiceOrderReadyAndConsumeTechnicalParts;

/** @internal Somente para bancos descartáveis de laboratório. */
export function __createOrderConsumptionServicesForTests(
  location: TestLocation,
  options?: { failAfter?: FailurePoint },
) {
  return makeServices(
    (operation, callback) => __withImmediateTransactionForTests(location, operation, callback),
    options?.failAfter,
  );
}
