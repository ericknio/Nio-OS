/**
 * @file lib/estoqueTecnico/orderRepository.ts
 * @description Repositório SQL para consulta e atualização de totais financeiros de Ordens de Serviço sob o ponto de vista do Estoque Técnico.
 * 
 * Responsável por:
 * - Consultar a O.S. com verificações de integridade (`hasFinalization`, `paymentCount`, `technicianProfitPercentSnapshot`).
 * - Atualizar totais financeiros da O.S. (`partsCost`, `totalAmount`, `paymentPercent`).
 * - Inspecionar configurações de comissão do técnico responsável.
 */

import { randomUUID } from "node:crypto";
import type {
  ProfitShareTechnicianRecord,
  StockDatabase,
  TechnicalServiceOrderRecord,
} from "./types";

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function findTechnicalServiceOrder(
  database: StockDatabase,
  serviceOrderId: string,
): TechnicalServiceOrderRecord | null {
  const row = database.prepare(`SELECT
    o."id", o."status", o."partsCost", o."laborCost", o."discount", o."totalAmount",
    o."paidAmount", o."paymentPercent", o."paymentReceivedAt", o."finalizedAt",
    o."requiredParts", o."technicianResponsible", o."technicianUserId",
    o."technicianProfitPercentSnapshot",
    EXISTS(SELECT 1 FROM "OrderFinalization" f WHERE f."serviceOrderId" = o."id") AS "hasFinalization",
    (SELECT COUNT(*) FROM "ServiceOrderPayment" p WHERE p."serviceOrderId" = o."id") AS "paymentCount"
    FROM "ServiceOrder" o WHERE o."id" = ?`).get(serviceOrderId);
  if (!row) return null;
  return {
    id: String(row.id),
    status: String(row.status),
    partsCost: Number(row.partsCost),
    laborCost: Number(row.laborCost),
    discount: Number(row.discount),
    totalAmount: Number(row.totalAmount),
    technicianResponsible: nullableString(row.technicianResponsible),
    technicianUserId: nullableString(row.technicianUserId),
    technicianProfitPercentSnapshot:
      row.technicianProfitPercentSnapshot === null || row.technicianProfitPercentSnapshot === undefined
        ? null
        : Number(row.technicianProfitPercentSnapshot),
    paidAmount: Number(row.paidAmount),
    paymentPercent: Number(row.paymentPercent),
    paymentReceivedAt: nullableString(row.paymentReceivedAt),
    finalizedAt: nullableString(row.finalizedAt),
    requiredParts: nullableString(row.requiredParts),
    hasFinalization: Boolean(row.hasFinalization),
    paymentCount: Number(row.paymentCount),
  };
}



export function findActiveTechnicianForReady(
  database: StockDatabase,
  technicianUserId: string,
): ProfitShareTechnicianRecord | null {
  const row = database.prepare(`SELECT
    "id", "name", "profitShareEnabled", "profitSharePercent"
    FROM "SystemUser"
    WHERE "id" = ? AND "role" = 'TECNICO' AND "status" = 'ATIVO'`)
    .get(technicianUserId);

  if (!row) return null;

  return {
    id: String(row.id),
    name: String(row.name),
    profitShareEnabled: Boolean(row.profitShareEnabled),
    profitSharePercent: Number(row.profitSharePercent),
  };
}

export function markTechnicalServiceOrderReady(
  database: StockDatabase,
  input: {
    id: string;
    expectedStatus: string;
    technicianResponsible: string;
    technicianUserId: string | null;
    technicianProfitPercentSnapshot: number | null;
  },
): number {
  return Number(database.prepare(`UPDATE "ServiceOrder" SET
    "status" = 'PRONTO',
    "technicianResponsible" = ?,
    "technicianUserId" = ?,
    "technicianProfitPercentSnapshot" = ?,
    "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "status" = ?
      AND "status" IN ('RECEBIDO', 'EM_ANALISE', 'AGUARDANDO_PECA', 'EM_REPARO')
      AND "finalizedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "OrderFinalization" f WHERE f."serviceOrderId" = "ServiceOrder"."id")`)
    .run(
      input.technicianResponsible,
      input.technicianUserId,
      input.technicianProfitPercentSnapshot,
      input.id,
      input.expectedStatus,
    ).changes);
}

export function markTechnicalServiceOrderCancelled(
  database: StockDatabase,
  input: { id: string; expectedStatus: string },
): number {
  database.prepare(`DELETE FROM "OrderFinalization" WHERE "serviceOrderId" = ?`).run(input.id);

  return Number(database.prepare(`UPDATE "ServiceOrder" SET
    "status" = 'CANCELADO', "finalizedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "status" = ?
      AND "status" != 'CANCELADO'`)
    .run(input.id, input.expectedStatus).changes);
}

export function insertCancellationHistory(
  database: StockDatabase,
  input: { serviceOrderId: string; userName: string; reason: string },
): void {
  database.prepare(`INSERT INTO "OrderHistory" (
    "id", "serviceOrderId", "userName", "action", "description", "oldValue", "newValue", "createdAt"
  ) VALUES (?, ?, ?, 'CANCELAMENTO_OS', ?, NULL, NULL, CURRENT_TIMESTAMP)`)
    .run(randomUUID(), input.serviceOrderId, input.userName,
      `Ordem de serviço cancelada por ${input.userName}. Motivo: ${input.reason}`);
}

export function insertTechnicalCancellationReleaseHistory(
  database: StockDatabase,
  input: { serviceOrderId: string; userName: string; affectedItems: number; affectedUnits: number },
): void {
  database.prepare(`INSERT INTO "OrderHistory" (
    "id", "serviceOrderId", "userName", "action", "description", "oldValue", "newValue", "createdAt"
  ) VALUES (?, ?, ?, 'PECAS_TECNICAS_LIBERADAS_CANCELAMENTO', ?, NULL, NULL, CURRENT_TIMESTAMP)`)
    .run(randomUUID(), input.serviceOrderId, input.userName,
      `Cancelamento liberou ${input.affectedItems} tipo(s) de peça e ${input.affectedUnits} unidade(s).`);
}

export function insertReadyStatusHistory(
  database: StockDatabase,
  input: { serviceOrderId: string; userName: string; previousStatusLabel: string; technicianResponsible: string },
): void {
  database.prepare(`INSERT INTO "OrderHistory" (
    "id", "serviceOrderId", "userName", "action", "description", "oldValue", "newValue", "createdAt"
  ) VALUES (?, ?, ?, 'ALTERACAO_STATUS', ?, NULL, NULL, CURRENT_TIMESTAMP)`)
    .run(
      randomUUID(), input.serviceOrderId, input.userName,
      `Status alterado de ${input.previousStatusLabel} para Pronto. Técnico responsável pelo serviço: ${input.technicianResponsible}.`,
    );
}

export function insertTechnicalConsumptionHistory(
  database: StockDatabase,
  input: { serviceOrderId: string; userName: string; affectedItems: number; affectedUnits: number },
): void {
  database.prepare(`INSERT INTO "OrderHistory" (
    "id", "serviceOrderId", "userName", "action", "description", "oldValue", "newValue", "createdAt"
  ) VALUES (?, ?, ?, 'PECAS_TECNICAS_CONSUMIDAS', ?, NULL, NULL, CURRENT_TIMESTAMP)`)
    .run(
      randomUUID(), input.serviceOrderId, input.userName,
      `Consumo técnico concluído: ${input.affectedItems} tipo(s) de peça e ${input.affectedUnits} unidade(s).`,
    );
}

export function insertTechnicalPartOrderHistory(
  database: StockDatabase,
  input: {
    serviceOrderId: string;
    userName: string;
    description: string;
  },
): void {
  database.prepare(`INSERT INTO "OrderHistory" (
    "id", "serviceOrderId", "userName", "action", "description", "oldValue", "newValue", "createdAt"
  ) VALUES (?, ?, ?, 'PECA_TECNICA_RESERVADA', ?, NULL, NULL, CURRENT_TIMESTAMP)`)
    .run(randomUUID(), input.serviceOrderId, input.userName, input.description);
}

export function insertOrderPartMutationHistory(
  database: StockDatabase,
  input: {
    serviceOrderId: string;
    userName: string;
    action: "PECA_TECNICA_RESERVA_AUMENTADA" | "PECA_TECNICA_RESERVA_REDUZIDA" | "PECA_TECNICA_LIBERADA" | "PECA_TECNICA_ESTORNO_MANUAL";
    description: string;
  },
): void {
  database.prepare(`INSERT INTO "OrderHistory" (
    "id", "serviceOrderId", "userName", "action", "description", "oldValue", "newValue", "createdAt"
  ) VALUES (?, ?, ?, ?, ?, NULL, NULL, CURRENT_TIMESTAMP)`)
    .run(randomUUID(), input.serviceOrderId, input.userName, input.action, input.description);
}
