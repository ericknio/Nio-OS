/**
 * @file lib/estoqueTecnico/orderPartRepository.ts
 * @description Repositório SQL para persistência e ciclo de vida de itens de peças em O.S. (`ServiceOrderPart`).
 * 
 * Gerencia a máquina de estados das peças vinculadas à Ordem de Serviço:
 * - `RESERVED`: Peça separada no estoque aguardando conserto ou aprovação.
 * - `CONSUMED`: Peça consumida e instalada no aparelho na entrega/conclusão da O.S.
 * - `RELEASED`: Peça liberada de volta para o saldo disponível por cancelamento ou remoção.
 * - `REVERSED`: Peça consumida cujo estorno foi executado manualmente com devolução ao estoque.
 */

import { randomUUID } from "node:crypto";
import type {
  ServiceOrderPartRecord,
  StockDatabase,
  TechnicalPartMovementRecord,
} from "./types";

const ITEM_COLUMNS = `
  "id", "serviceOrderId", "technicalPartId", "partNameSnapshot", "partSkuSnapshot",
  "unitCostSnapshot", "unitPriceSnapshot", "quantity", "totalCostSnapshot",
  "totalPriceSnapshot", "state", "reservedAt", "consumedAt", "releasedAt",
  "reversedAt", "responsibleUserId", "responsibleUserNameSnapshot",
  "idempotencyKey", "createdAt", "updatedAt"
`;

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toOrderPart(row: Record<string, unknown>): ServiceOrderPartRecord {
  return {
    id: String(row.id),
    serviceOrderId: String(row.serviceOrderId),
    technicalPartId: String(row.technicalPartId),
    partNameSnapshot: String(row.partNameSnapshot),
    partSkuSnapshot: nullableString(row.partSkuSnapshot),
    unitCostSnapshot: Number(row.unitCostSnapshot),
    unitPriceSnapshot: Number(row.unitPriceSnapshot),
    quantity: Number(row.quantity),
    totalCostSnapshot: Number(row.totalCostSnapshot),
    totalPriceSnapshot: Number(row.totalPriceSnapshot),
    state: String(row.state) as ServiceOrderPartRecord["state"],
    reservedAt: String(row.reservedAt),
    consumedAt: nullableString(row.consumedAt),
    releasedAt: nullableString(row.releasedAt),
    reversedAt: nullableString(row.reversedAt),
    responsibleUserId: nullableString(row.responsibleUserId),
    responsibleUserNameSnapshot: String(row.responsibleUserNameSnapshot),
    idempotencyKey: String(row.idempotencyKey),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function findOrderPartByLogicalKey(
  database: StockDatabase,
  logicalKey: string,
): ServiceOrderPartRecord | null {
  const row = database.prepare(`SELECT ${ITEM_COLUMNS} FROM "ServiceOrderPart"
    WHERE "idempotencyKey" LIKE ? ESCAPE '\\'
    ORDER BY "createdAt" ASC, "id" ASC LIMIT 1`)
    .get(`${escapeLike(logicalKey)}:%`);
  return row ? toOrderPart(row) : null;
}

export function findActiveOrderPart(
  database: StockDatabase,
  serviceOrderId: string,
  technicalPartId: string,
): ServiceOrderPartRecord | null {
  const row = database.prepare(`SELECT ${ITEM_COLUMNS} FROM "ServiceOrderPart"
    WHERE "serviceOrderId" = ? AND "technicalPartId" = ?
      AND "state" IN ('RESERVED', 'CONSUMED')
    ORDER BY "createdAt" ASC, "id" ASC LIMIT 1`)
    .get(serviceOrderId, technicalPartId);
  return row ? toOrderPart(row) : null;
}

export function findOrderPartById(
  database: StockDatabase,
  id: string,
): ServiceOrderPartRecord | null {
  const row = database.prepare(`SELECT ${ITEM_COLUMNS} FROM "ServiceOrderPart"
    WHERE "id" = ?`).get(id);
  return row ? toOrderPart(row) : null;
}

export function updateReservedOrderPartQuantity(
  database: StockDatabase,
  input: { id: string; expectedQuantity: number; newQuantity: number },
): number {
  const result = database.prepare(`UPDATE "ServiceOrderPart" SET
    "quantity" = ?,
    "totalCostSnapshot" = ROUND("unitCostSnapshot" * ?, 2),
    "totalPriceSnapshot" = ROUND("unitPriceSnapshot" * ?, 2),
    "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "state" = 'RESERVED' AND "quantity" = ?`)
    .run(
      input.newQuantity,
      input.newQuantity,
      input.newQuantity,
      input.id,
      input.expectedQuantity,
    );
  return Number(result.changes);
}

export function releaseReservedOrderPart(
  database: StockDatabase,
  input: { id: string; expectedQuantity: number; serviceOrderId?: string; technicalPartId?: string },
): number {
  const scoped = input.serviceOrderId !== undefined && input.technicalPartId !== undefined;
  const result = scoped
    ? database.prepare(`UPDATE "ServiceOrderPart" SET
    "state" = 'RELEASED', "releasedAt" = CURRENT_TIMESTAMP,
    "consumedAt" = NULL, "reversedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "state" = 'RESERVED' AND "quantity" = ?
      AND "serviceOrderId" = ? AND "technicalPartId" = ?`)
      .run(input.id, input.expectedQuantity, input.serviceOrderId!, input.technicalPartId!).changes
    : database.prepare(`UPDATE "ServiceOrderPart" SET
    "state" = 'RELEASED', "releasedAt" = CURRENT_TIMESTAMP,
    "consumedAt" = NULL, "reversedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "state" = 'RESERVED' AND "quantity" = ?`)
      .run(input.id, input.expectedQuantity).changes;
  return Number(result);
}

export function countActiveOrderParts(
  database: StockDatabase,
  serviceOrderId: string,
): number {
  return Number(database.prepare(`SELECT COUNT(*) AS "total" FROM "ServiceOrderPart"
    WHERE "serviceOrderId" = ? AND "state" IN ('RESERVED', 'CONSUMED')`)
    .get(serviceOrderId)?.total ?? 0);
}

export function insertReservedOrderPart(
  database: StockDatabase,
  input: Omit<ServiceOrderPartRecord,
    "id" | "state" | "reservedAt" | "consumedAt" | "releasedAt" |
    "reversedAt" | "createdAt" | "updatedAt">,
): ServiceOrderPartRecord {
  const id = randomUUID();
  database.prepare(`INSERT INTO "ServiceOrderPart" (
    "id", "serviceOrderId", "technicalPartId", "partNameSnapshot", "partSkuSnapshot",
    "unitCostSnapshot", "unitPriceSnapshot", "quantity", "totalCostSnapshot",
    "totalPriceSnapshot", "state", "reservedAt", "consumedAt", "releasedAt",
    "reversedAt", "responsibleUserId", "responsibleUserNameSnapshot",
    "idempotencyKey", "createdAt", "updatedAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESERVED', CURRENT_TIMESTAMP,
    NULL, NULL, NULL, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
    .run(
      id, input.serviceOrderId, input.technicalPartId, input.partNameSnapshot,
      input.partSkuSnapshot, input.unitCostSnapshot, input.unitPriceSnapshot,
      input.quantity, input.totalCostSnapshot, input.totalPriceSnapshot,
      input.responsibleUserId, input.responsibleUserNameSnapshot,
      input.idempotencyKey,
    );
  const row = database.prepare(`SELECT ${ITEM_COLUMNS} FROM "ServiceOrderPart" WHERE "id" = ?`)
    .get(id);
  return toOrderPart(row!);
}

export function findReservationMovementForItem(
  database: StockDatabase,
  serviceOrderPartId: string,
): TechnicalPartMovementRecord | null {
  const row = database.prepare(`SELECT
    "id", "technicalPartId", "serviceOrderPartId", "type", "quantity",
    "onHandBefore", "onHandAfter", "reservedBefore", "reservedAfter",
    "unitCostSnapshot", "reason", "operatorId", "operatorNameSnapshot",
    "idempotencyKey", "createdAt"
    FROM "TechnicalPartMovement"
    WHERE "serviceOrderPartId" = ? AND "type" = 'RESERVATION'
    ORDER BY "createdAt" ASC, "id" ASC LIMIT 1`).get(serviceOrderPartId);
  if (!row) return null;
  return {
    id: String(row.id),
    technicalPartId: String(row.technicalPartId),
    serviceOrderPartId: nullableString(row.serviceOrderPartId),
    type: "RESERVATION",
    quantity: Number(row.quantity),
    onHandBefore: row.onHandBefore === null ? null : Number(row.onHandBefore),
    onHandAfter: row.onHandAfter === null ? null : Number(row.onHandAfter),
    reservedBefore: Number(row.reservedBefore),
    reservedAfter: Number(row.reservedAfter),
    unitCostSnapshot: row.unitCostSnapshot === null ? null : Number(row.unitCostSnapshot),
    reason: nullableString(row.reason),
    operatorId: nullableString(row.operatorId),
    operatorNameSnapshot: String(row.operatorNameSnapshot),
    idempotencyKey: String(row.idempotencyKey),
    createdAt: String(row.createdAt),
  };
}

export function listOrderPartRows(
  database: StockDatabase,
  serviceOrderId: string,
  states: readonly ServiceOrderPartRecord["state"][],
): ServiceOrderPartRecord[] {
  const placeholders = states.map(() => "?").join(", ");
  const rows = database.prepare(`SELECT ${ITEM_COLUMNS} FROM "ServiceOrderPart"
    WHERE "serviceOrderId" = ? AND "state" IN (${placeholders})
    ORDER BY "createdAt" ASC, "id" ASC`).all(serviceOrderId, ...states);
  return rows.map(toOrderPart);
}

export function listReservedOrderParts(
  database: StockDatabase,
  serviceOrderId: string,
): ServiceOrderPartRecord[] {
  const rows = database.prepare(`SELECT ${ITEM_COLUMNS} FROM "ServiceOrderPart"
    WHERE "serviceOrderId" = ? AND "state" = 'RESERVED'
    ORDER BY "createdAt" ASC, "id" ASC`).all(serviceOrderId);
  return rows.map(toOrderPart);
}

export function listConsumedOrderParts(
  database: StockDatabase,
  serviceOrderId: string,
): ServiceOrderPartRecord[] {
  const rows = database.prepare(`SELECT ${ITEM_COLUMNS} FROM "ServiceOrderPart"
    WHERE "serviceOrderId" = ? AND "state" = 'CONSUMED'
    ORDER BY "createdAt" ASC, "id" ASC`).all(serviceOrderId);
  return rows.map(toOrderPart);
}


export function reverseConsumedOrderPart(
  database: StockDatabase,
  input: {
    id: string;
    serviceOrderId: string;
    technicalPartId: string;
    expectedQuantity: number;
  },
): number {
  return Number(database.prepare(`UPDATE "ServiceOrderPart" SET
    "state" = 'REVERSED', "reversedAt" = CURRENT_TIMESTAMP,
    "releasedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "serviceOrderId" = ? AND "technicalPartId" = ?
      AND "state" = 'CONSUMED' AND "consumedAt" IS NOT NULL
      AND "quantity" = ?`)
    .run(
      input.id,
      input.serviceOrderId,
      input.technicalPartId,
      input.expectedQuantity,
    ).changes);
}

export function consumeReservedOrderPart(
  database: StockDatabase,
  input: { id: string; serviceOrderId: string; technicalPartId: string; quantity: number },
): number {
  return Number(database.prepare(`UPDATE "ServiceOrderPart" SET
    "state" = 'CONSUMED', "consumedAt" = CURRENT_TIMESTAMP,
    "releasedAt" = NULL, "reversedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "serviceOrderId" = ? AND "technicalPartId" = ?
      AND "state" = 'RESERVED' AND "quantity" = ?`)
    .run(input.id, input.serviceOrderId, input.technicalPartId, input.quantity).changes);
}
