/**
 * @file lib/estoqueTecnico/movementRepository.ts
 * @description Repositório SQL para persistência e consulta do razão imutável de movimentações de estoque (`TechnicalPartMovement`).
 * 
 * Cada movimentação registra:
 * - Snapshots de saldo anterior e posterior (`onHandBefore`, `onHandAfter`, `reservedBefore`, `reservedAfter`).
 * - Snapshot de custo unitário (`unitCostSnapshot`) na data do movimento.
 * - Auditoria do operador (`operatorId`, `operatorNameSnapshot`) e chave de idempotência.
 */

import { randomUUID } from "node:crypto";
import type {
  StockDatabase,
  TechnicalPartMovementRecord,
} from "./types";

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toMovement(row: Record<string, unknown>): TechnicalPartMovementRecord {
  return {
    id: String(row.id),
    technicalPartId: String(row.technicalPartId),
    serviceOrderPartId: nullableString(row.serviceOrderPartId),
    type: String(row.type) as TechnicalPartMovementRecord["type"],
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

const MOVEMENT_COLUMNS = `
  "id", "technicalPartId", "serviceOrderPartId", "type", "quantity",
  "onHandBefore", "onHandAfter", "reservedBefore", "reservedAfter",
  "unitCostSnapshot", "reason", "operatorId", "operatorNameSnapshot",
  "idempotencyKey", "createdAt"
`;
const QUALIFIED_MOVEMENT_COLUMNS = MOVEMENT_COLUMNS.replace(/"([^"]+)"/g, 'm."$1"');

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function findMovementByLogicalKey(
  database: StockDatabase,
  logicalKey: string,
): TechnicalPartMovementRecord | null {
  const pattern = `${escapeLike(logicalKey)}:%`;
  const row = database.prepare(`SELECT ${MOVEMENT_COLUMNS}
    FROM "TechnicalPartMovement" WHERE "idempotencyKey" LIKE ? ESCAPE '\\'
    ORDER BY "createdAt" ASC LIMIT 1`).get(pattern);
  return row ? toMovement(row) : null;
}

export function insertTechnicalPartMovement(
  database: StockDatabase,
  movement: Omit<TechnicalPartMovementRecord, "id" | "createdAt" | "serviceOrderPartId"> & {
    serviceOrderPartId?: string | null;
  },
): TechnicalPartMovementRecord {
  const id = randomUUID();
  database.prepare(`INSERT INTO "TechnicalPartMovement" (
    "id", "technicalPartId", "serviceOrderPartId", "type", "quantity",
    "onHandBefore", "onHandAfter", "reservedBefore", "reservedAfter",
    "unitCostSnapshot", "reason", "operatorId", "operatorNameSnapshot",
    "idempotencyKey", "createdAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .run(
      id, movement.technicalPartId, movement.serviceOrderPartId ?? null,
      movement.type, movement.quantity,
      movement.onHandBefore, movement.onHandAfter, movement.reservedBefore,
      movement.reservedAfter, movement.unitCostSnapshot, movement.reason,
      movement.operatorId, movement.operatorNameSnapshot, movement.idempotencyKey,
    );
  const row = database.prepare(`SELECT ${MOVEMENT_COLUMNS}
    FROM "TechnicalPartMovement" WHERE "id" = ?`).get(id);
  return toMovement(row!);
}

export function listMovementsForOrderPartIds(
  database: StockDatabase,
  itemIds: readonly string[],
): TechnicalPartMovementRecord[] {
  if (itemIds.length === 0) return [];
  const placeholders = itemIds.map(() => "?").join(", ");
  const rows = database.prepare(`SELECT ${MOVEMENT_COLUMNS}
    FROM "TechnicalPartMovement"
    WHERE "serviceOrderPartId" IN (${placeholders})
    ORDER BY "createdAt" ASC, "id" ASC`).all(...itemIds);
  return rows.map(toMovement);
}

export function findConsumptionMovementForItem(
  database: StockDatabase,
  serviceOrderPartId: string,
): TechnicalPartMovementRecord | null {
  const row = database.prepare(`SELECT ${MOVEMENT_COLUMNS}
    FROM "TechnicalPartMovement"
    WHERE "serviceOrderPartId" = ? AND "type" = 'CONSUMPTION'
    ORDER BY "createdAt" ASC, "id" ASC LIMIT 1`).get(serviceOrderPartId);
  return row ? toMovement(row) : null;
}

export function listConsumptionMovementsForCommand(
  database: StockDatabase,
  input: { serviceOrderId: string; movementPattern: string },
): TechnicalPartMovementRecord[] {
  const rows = database.prepare(`SELECT ${QUALIFIED_MOVEMENT_COLUMNS}
    FROM "TechnicalPartMovement" m
    INNER JOIN "ServiceOrderPart" i ON i."id" = m."serviceOrderPartId"
    WHERE m."type" = 'CONSUMPTION'
      AND m."serviceOrderPartId" IS NOT NULL
      AND i."serviceOrderId" = ?
      AND m."idempotencyKey" LIKE ? ESCAPE '\\'
    ORDER BY m."createdAt" ASC, m."id" ASC`)
    .all(input.serviceOrderId, input.movementPattern);
  return rows.map(toMovement);
}

export function countConsumptionMovementsForItem(
  database: StockDatabase,
  serviceOrderPartId: string,
): number {
  return Number(database.prepare(`SELECT COUNT(*) AS "total"
    FROM "TechnicalPartMovement"
    WHERE "serviceOrderPartId" = ? AND "type" = 'CONSUMPTION'`)
    .get(serviceOrderPartId)?.total ?? 0);
}

export function listReleaseMovementsForCommand(
  database: StockDatabase,
  input: { serviceOrderId: string; movementPattern: string },
): TechnicalPartMovementRecord[] {
  const rows = database.prepare(`SELECT ${QUALIFIED_MOVEMENT_COLUMNS}
    FROM "TechnicalPartMovement" m
    INNER JOIN "ServiceOrderPart" i ON i."id" = m."serviceOrderPartId"
    WHERE m."type" = 'RELEASE'
      AND m."serviceOrderPartId" IS NOT NULL
      AND i."serviceOrderId" = ?
      AND m."idempotencyKey" LIKE ? ESCAPE '\\'
    ORDER BY m."createdAt" ASC, m."id" ASC`)
    .all(input.serviceOrderId, input.movementPattern);
  return rows.map(toMovement);
}


export function listTechnicalPartMovementRows(
  database: StockDatabase,
  input: { technicalPartId: string; page: number; pageSize: number },
): {
  items: TechnicalPartMovementRecord[];
  total: number;
  page: number;
  pageSize: number;
} {
  const total = Number(
    database.prepare(`SELECT COUNT(*) AS "total"
      FROM "TechnicalPartMovement" WHERE "technicalPartId" = ?`)
      .get(input.technicalPartId)?.total ?? 0,
  );
  const offset = (input.page - 1) * input.pageSize;
  const rows = database.prepare(`SELECT ${MOVEMENT_COLUMNS}
    FROM "TechnicalPartMovement"
    WHERE "technicalPartId" = ?
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT ? OFFSET ?`)
    .all(input.technicalPartId, input.pageSize, offset);

  return {
    items: rows.map(toMovement),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export function countMovementsForItemType(
  database: StockDatabase,
  serviceOrderPartId: string,
  type: string,
): number {
  return Number(database.prepare(`SELECT COUNT(*) AS "total"
    FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ? AND "type" = ?`)
    .get(serviceOrderPartId, type)?.total ?? 0);
}
