/**
 * @file lib/estoqueTecnico/orderCancellationService.ts
 * @description Serviço de cancelamento de Ordens de Serviço com liberação ou devolução de peças técnicas.
 * 
 * Regras de execução:
 * - Libera peças que estavam reservadas (`RESERVED` -> `RELEASED`), restaurando o saldo disponível.
 * - Opcionalmente reverte peças já consumidas (`returnConsumedParts: true`), devolvendo-as ao saldo físico.
 * - Atualiza o status da O.S. para `CANCELADO` e recalcula os totais.
 * - Não permite cancelamento se houver pagamentos ativos não estornados (exige estorno financeiro prévio).
 */

import { createHash, randomUUID } from "node:crypto";
import { validateCancelServiceOrderCommand, validateCommandContext } from "./commands";
import { __withImmediateTransactionForTests, withImmediateTransaction } from "./db";
import { stockError, validationError } from "./errors";
import { buildPersistedIdempotencyKey, hashIdempotentPayload } from "./idempotency";
import {
  countMovementsForItemType,
  insertTechnicalPartMovement,
  listReleaseMovementsForCommand,
} from "./movementRepository";
import {
  findOrderPartById,
  findReservationMovementForItem,
  listReservedOrderParts,
  listConsumedOrderParts,
  releaseReservedOrderPart,
  reverseConsumedOrderPart,
} from "./orderPartRepository";
import {
  findTechnicalServiceOrder,
  insertCancellationHistory,
  insertTechnicalCancellationReleaseHistory,
  markTechnicalServiceOrderCancelled,
} from "./orderRepository";
import { findServiceOrderTechnicalCommand, insertServiceOrderTechnicalCommand } from "./orderTechnicalCommandRepository";
import { decreaseTechnicalPartReservation, findTechnicalPartById, reverseTechnicalPartConsumption } from "./partRepository";
import { recalculateTechnicalPartsOrderTotals } from "./recalculateOrder";
import { sanitizeServiceOrderPart, sanitizeTechnicalPartMovement } from "./sanitize";
import type {
  CancelTechnicalResult,
  InternalCommandContext,
  ServiceOrderPartRecord,
  StockDatabase,
  TechnicalPartMovementRecord,
  TechnicalServiceOrderRecord,
  TransactionResult,
} from "./types";
import {
  STOCK_TEXT_LIMITS,
  assertTechnicalMovementInvariant,
  assertVersionCanIncrement,
  requireNonEmptyString,
  requirePositiveInteger,
} from "./validation";

type TestLocation = { runtimeRoot: string; databasePath: string };
type FailurePoint = "after_part" | "after_item" | "after_movement" | "after_status" | "after_history";
type WriteRunner = <T>(operation: string, callback: (database: StockDatabase) => T) => TransactionResult<T>;

const TERMINAL_STATUSES = new Set(["CANCELADO"]);

function stableScope(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function operatorScope(context: InternalCommandContext): string {
  return context.operatorId ? `user_${stableScope(context.operatorId)}` : "system";
}

function commandKey(orderId: string, context: InternalCommandContext): string {
  return buildPersistedIdempotencyKey({
    namespace: "so",
    operation: "release-cancel",
    version: "v1",
    resources: [operatorScope(context), stableScope(orderId)],
    requestKey: context.idempotencyKey,
  });
}

function movementKey(orderId: string, itemId: string, context: InternalCommandContext, payloadHash: string): string {
  return `${buildPersistedIdempotencyKey({
    namespace: "sop",
    operation: "release-cancel",
    version: "v1",
    resources: [operatorScope(context), stableScope(orderId), stableScope(itemId)],
    requestKey: context.idempotencyKey,
  })}:${payloadHash}`;
}

function movementPattern(orderId: string, context: InternalCommandContext, payloadHash: string): string {
  const escapeLike = (value: string) => value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const prefix = ["sop", "release-cancel", "v1", operatorScope(context), stableScope(orderId)].join(":");
  return `${escapeLike(prefix)}:%:${escapeLike(context.idempotencyKey)}:${escapeLike(payloadHash)}`;
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
): CancelTechnicalResult {
  return {
    order: {
      id: order.id,
      status: order.status,
      technicianResponsible: order.technicianResponsible,
      technicianUserId: order.technicianUserId,
      ...(context.canViewFinancialData
        ? {
            technicianProfitPercentSnapshot:
              order.technicianProfitPercentSnapshot,
          }
        : {}),
      partsCost: order.partsCost,
      laborCost: order.laborCost,
      discount: order.discount,
      totalAmount: order.totalAmount,
    },
    releasedItems: items.map((item) => sanitizeServiceOrderPart(item, context.canViewFinancialData)),
    movements: movements.map((movement) => sanitizeTechnicalPartMovement(movement, context.canViewFinancialData)),
    affectedItems: items.length,
    affectedUnits: items.reduce((total, item) => total + item.quantity, 0),
    idempotentReplay: replay,
  };
}

function invariant(message: string): never {
  throw stockError("STOCK_INVARIANT_VIOLATION", 409, message);
}

function makeServices(write: WriteRunner, failAfter?: FailurePoint) {
  function cancelServiceOrderAndReleaseReservedTechnicalParts(
    serviceOrderIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): CancelTechnicalResult {
    const serviceOrderId = requireNonEmptyString(serviceOrderIdValue, "serviceOrderId", STOCK_TEXT_LIMITS.ID);
    const input = validateCancelServiceOrderCommand(inputValue);
    if (input.reason.length < 10) throw validationError("Descreva melhor o motivo do cancelamento.");
    const context = validateCommandContext(contextValue);
    const logicalKey = commandKey(serviceOrderId, context);
    const payloadHash = hashIdempotentPayload(input);

    return write("service-order-cancel-release", (database) => {
      const prior = findServiceOrderTechnicalCommand(database, logicalKey);
      if (prior) {
        if (prior.operation !== "RELEASE_ON_CANCEL" || prior.serviceOrderId !== serviceOrderId || prior.payloadHash !== payloadHash) {
          throw stockError("IDEMPOTENCY_KEY_REUSED", 409, "A chave de idempotência já foi usada com dados diferentes.");
        }
        const movements = listReleaseMovementsForCommand(database, {
          serviceOrderId,
          movementPattern: movementPattern(serviceOrderId, context, payloadHash),
        });
        if (movements.length !== prior.affectedItems) invariant("A auditoria do cancelamento técnico está inconsistente.");
        const items: ServiceOrderPartRecord[] = [];
        const seen = new Set<string>();
        for (const movement of movements) {
          if (!movement.serviceOrderPartId || seen.has(movement.serviceOrderPartId)) invariant("Existem liberações duplicadas no cancelamento.");
          const item = findOrderPartById(database, movement.serviceOrderPartId);
          if (!item || item.serviceOrderId !== serviceOrderId || item.state !== "RELEASED") invariant("O item liberado está inconsistente.");
          if (movement.type !== "RELEASE" || movement.technicalPartId !== item.technicalPartId || movement.quantity !== item.quantity || movement.idempotencyKey !== movementKey(serviceOrderId, item.id, context, payloadHash)) {
            invariant("O movimento de liberação está inconsistente.");
          }
          if (countMovementsForItemType(database, item.id, "RELEASE") !== 1) invariant("Existem múltiplas liberações para o item.");
          seen.add(item.id);
          items.push(item);
        }
        return project(requireOrder(database, serviceOrderId), items, movements, context, true);
      }

      const order = requireOrder(database, serviceOrderId);
      if (order.status !== input.expectedCurrentStatus) {
        throw stockError("ORDER_STATUS_CONFLICT", 409, "A ordem de serviço foi alterada por outra operação.");
      }
      if (TERMINAL_STATUSES.has(order.status)) {
        throw stockError("ORDER_NOT_MUTABLE", 409, "Esta ordem de serviço já está cancelada.");
      }

      const reserved = listReservedOrderParts(database, serviceOrderId);
      const pairs = reserved.map((item) => {
        if (item.serviceOrderId !== serviceOrderId) invariant("O vínculo do item técnico está inconsistente.");

        // A relação atual do ServiceOrderPart não é suficiente como fonte de verdade:
        // se o banco sofrer corrupção ou alteração indevida, o item poderia apontar
        // para outra TechnicalPart válida. O movimento RESERVATION é o vínculo
        // histórico imutável criado no momento da reserva.
        const reservationMovement = findReservationMovementForItem(database, item.id);
        if (
          !reservationMovement ||
          reservationMovement.serviceOrderPartId !== item.id ||
          reservationMovement.technicalPartId !== item.technicalPartId ||
          countMovementsForItemType(database, item.id, "RESERVATION") !== 1
        ) {
          invariant("O vínculo histórico da reserva técnica está inconsistente.");
        }

        const part = findTechnicalPartById(database, item.technicalPartId);
        if (!part) throw stockError("TECHNICAL_PART_NOT_FOUND", 404, "A peça técnica não foi encontrada.");
        if (item.technicalPartId !== part.id) invariant("O vínculo do item técnico está inconsistente.");
        try { requirePositiveInteger(item.quantity, "quantity"); } catch { invariant("A quantidade reservada está inconsistente."); }
        if (part.quantityReserved < item.quantity) invariant("O saldo reservado está inconsistente.");
        try { assertVersionCanIncrement(part.version); } catch { invariant("A versão da peça técnica está inconsistente."); }
        return { item, part };
      });

      const movements: TechnicalPartMovementRecord[] = [];
      for (const { item, part } of pairs) {
        if (decreaseTechnicalPartReservation(database, { id: part.id, version: part.version, quantity: item.quantity }) !== 1) invariant("Não foi possível liberar a reserva técnica.");
        if (failAfter === "after_part") throw new Error("laboratory failure");
        if (releaseReservedOrderPart(database, { id: item.id, expectedQuantity: item.quantity, serviceOrderId, technicalPartId: part.id }) !== 1) invariant("Não foi possível liberar o item técnico.");
        if (failAfter === "after_item") throw new Error("laboratory failure");
        const after = findTechnicalPartById(database, part.id)!;
        assertTechnicalMovementInvariant({ type: "RELEASE", quantity: item.quantity, onHandBefore: part.quantityOnHand, onHandAfter: after.quantityOnHand, reservedBefore: part.quantityReserved, reservedAfter: after.quantityReserved });
        const movement = insertTechnicalPartMovement(database, {
          technicalPartId: part.id,
          serviceOrderPartId: item.id,
          type: "RELEASE",
          quantity: item.quantity,
          onHandBefore: part.quantityOnHand,
          onHandAfter: after.quantityOnHand,
          reservedBefore: part.quantityReserved,
          reservedAfter: after.quantityReserved,
          unitCostSnapshot: item.unitCostSnapshot,
          reason: input.reason,
          operatorId: context.operatorId,
          operatorNameSnapshot: context.operatorName,
          idempotencyKey: movementKey(serviceOrderId, item.id, context, payloadHash),
        });
        movements.push(movement);
        if (failAfter === "after_movement") throw new Error("laboratory failure");
      }

      const consumed = listConsumedOrderParts(database, serviceOrderId);
      if (input.returnConsumedParts !== false && consumed.length > 0) {
        for (const item of consumed) {
          const part = findTechnicalPartById(database, item.technicalPartId);
          if (!part) continue;

          reverseTechnicalPartConsumption(database, {
            id: part.id,
            version: part.version,
            quantity: item.quantity,
            unlimited: part.quantityOnHand === null,
          });

          reverseConsumedOrderPart(database, {
            id: item.id,
            serviceOrderId,
            technicalPartId: part.id,
            expectedQuantity: item.quantity,
          });

          const after = findTechnicalPartById(database, part.id)!;
          const movement = insertTechnicalPartMovement(database, {
            technicalPartId: part.id,
            serviceOrderPartId: item.id,
            type: "MANUAL_REVERSAL",
            quantity: item.quantity,
            onHandBefore: part.quantityOnHand,
            onHandAfter: after.quantityOnHand,
            reservedBefore: part.quantityReserved,
            reservedAfter: after.quantityReserved,
            unitCostSnapshot: item.unitCostSnapshot,
            reason: input.reason,
            operatorId: context.operatorId,
            operatorNameSnapshot: context.operatorName,
            idempotencyKey: movementKey(serviceOrderId, item.id, context, payloadHash),
          });
          movements.push(movement);
        }
      }

      if (markTechnicalServiceOrderCancelled(database, { id: serviceOrderId, expectedStatus: input.expectedCurrentStatus }) !== 1) invariant("Não foi possível cancelar a ordem de serviço.");
      if (failAfter === "after_status") throw new Error("laboratory failure");
      recalculateTechnicalPartsOrderTotals(database, serviceOrderId);
      insertCancellationHistory(database, { serviceOrderId, userName: context.operatorName, reason: input.reason });

      // Estorno / Devolução de pagamentos se a OS possuía valores pagos
      const pagamentosAtuais = database.prepare(`
        SELECT COALESCE(SUM("amount"), 0) AS "totalPago"
        FROM "ServiceOrderPayment"
        WHERE "serviceOrderId" = ?
      `).get(serviceOrderId) as { totalPago: number } | undefined;

      const totalPago = Number(pagamentosAtuais?.totalPago ?? 0);
      const paidAmountOrder = Number(order.paidAmount ?? 0);
      const valorDevolucao = totalPago > 0 ? totalPago : paidAmountOrder;

      if (valorDevolucao > 0) {
        const ultimoPagamento = database.prepare(`
          SELECT "paymentMethod"
          FROM "ServiceOrderPayment"
          WHERE "serviceOrderId" = ? AND "amount" > 0
          ORDER BY "createdAt" DESC
          LIMIT 1
        `).get(serviceOrderId) as { paymentMethod: string } | undefined;

        const formaDevolucao = ultimoPagamento?.paymentMethod || "DINHEIRO";
        const estornoPaymentId = `estorno_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

        database.prepare(`
          INSERT INTO "ServiceOrderPayment" (
            "id", "serviceOrderId", "amount", "percent", "paymentMethod", "note", "userName", "createdAt"
          ) VALUES (?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          estornoPaymentId,
          serviceOrderId,
          -valorDevolucao,
          formaDevolucao,
          `Estorno / Devolução ao cliente por cancelamento da OS. Motivo: ${input.reason}`,
          context.operatorName,
        );

        database.prepare(`
          UPDATE "ServiceOrder"
          SET "paidAmount" = 0, "paymentPercent" = 0, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ?
        `).run(serviceOrderId);

        const valorFormatado = valorDevolucao.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        database.prepare(`
          INSERT INTO "OrderHistory" (
            "id", "serviceOrderId", "userName", "action", "description", "oldValue", "newValue", "createdAt"
          ) VALUES (?, ?, ?, 'ESTORNO_PAGAMENTO', ?, NULL, NULL, CURRENT_TIMESTAMP)
        `).run(
          randomUUID(),
          serviceOrderId,
          context.operatorName,
          `Estorno de pagamento realizado por cancelamento da OS. Valor devolvido ao cliente no caixa: ${valorFormatado} (${formaDevolucao}).`,
        );
      }

      if (reserved.length > 0) {
        insertTechnicalCancellationReleaseHistory(database, { serviceOrderId, userName: context.operatorName, affectedItems: reserved.length, affectedUnits: reserved.reduce((total, item) => total + item.quantity, 0) });
      }
      if (consumed.length > 0 && input.returnConsumedParts !== false) {
        database.prepare(`INSERT INTO "OrderHistory" (
          "id", "serviceOrderId", "userName", "action", "description", "oldValue", "newValue", "createdAt"
        ) VALUES (?, ?, ?, 'PECA_TECNICA_ESTORNO_MANUAL', ?, NULL, NULL, CURRENT_TIMESTAMP)`)
          .run(randomUUID(), serviceOrderId, context.operatorName,
            `Cancelamento estornou ${consumed.length} tipo(s) de peça(s) consumida(s) de volta ao estoque técnico.`);
      }
      if (failAfter === "after_history") throw new Error("laboratory failure");
      insertServiceOrderTechnicalCommand(database, {
        logicalKey,
        payloadHash,
        operation: "RELEASE_ON_CANCEL",
        serviceOrderId,
        operatorId: context.operatorId,
        operatorNameSnapshot: context.operatorName,
        affectedItems: reserved.length + consumed.length,
        resultOrderStatus: "CANCELADO",
      });
      const allParts = [
        ...reserved.map((item) => findOrderPartById(database, item.id)!),
        ...consumed.map((item) => findOrderPartById(database, item.id)!),
      ];
      return project(requireOrder(database, serviceOrderId), allParts, movements, context, false);
    }).value;
  }

  return { cancelServiceOrderAndReleaseReservedTechnicalParts };
}

const productionServices = makeServices((operation, callback) => withImmediateTransaction(operation, callback));
export const cancelServiceOrderAndReleaseReservedTechnicalParts = productionServices.cancelServiceOrderAndReleaseReservedTechnicalParts;

/** @internal Exclusivo para bancos descartáveis de laboratório. */
export function __createOrderCancellationServicesForTests(location: TestLocation, options?: { failAfter?: FailurePoint }) {
  return makeServices((operation, callback) => __withImmediateTransactionForTests(location, operation, callback), options?.failAfter);
}
