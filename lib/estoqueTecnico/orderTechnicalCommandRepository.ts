/**
 * @file lib/estoqueTecnico/orderTechnicalCommandRepository.ts
 * @description Repositório SQL para persistência do log de comandos em O.S. (`ServiceOrderTechnicalCommandLog`).
 * 
 * Registra o histórico idempotente de comandos executados sobre a Ordem de Serviço
 * (consumo em lote na finalização, liberação no cancelamento, etc.).
 */

import { randomUUID } from "node:crypto";
import type {
  ServiceOrderTechnicalCommandLogRecord,
  StockDatabase,
} from "./types";

const COLUMNS = `
  "id", "logicalKey", "payloadHash", "operation", "serviceOrderId",
  "operatorId", "operatorNameSnapshot", "affectedItems", "resultOrderStatus", "createdAt"
`;

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toRecord(row: Record<string, unknown>): ServiceOrderTechnicalCommandLogRecord {
  return {
    id: String(row.id),
    logicalKey: String(row.logicalKey),
    payloadHash: String(row.payloadHash),
    operation: String(row.operation) as ServiceOrderTechnicalCommandLogRecord["operation"],
    serviceOrderId: String(row.serviceOrderId),
    operatorId: nullableString(row.operatorId),
    operatorNameSnapshot: String(row.operatorNameSnapshot),
    affectedItems: Number(row.affectedItems),
    resultOrderStatus: String(row.resultOrderStatus),
    createdAt: String(row.createdAt),
  };
}

export function findServiceOrderTechnicalCommand(
  database: StockDatabase,
  logicalKey: string,
): ServiceOrderTechnicalCommandLogRecord | null {
  const row = database.prepare(`SELECT ${COLUMNS} FROM "ServiceOrderTechnicalCommandLog"
    WHERE "logicalKey" = ?`).get(logicalKey);
  return row ? toRecord(row) : null;
}

export function insertServiceOrderTechnicalCommand(
  database: StockDatabase,
  input: Omit<ServiceOrderTechnicalCommandLogRecord, "id" | "createdAt">,
): ServiceOrderTechnicalCommandLogRecord {
  const id = randomUUID();
  database.prepare(`INSERT INTO "ServiceOrderTechnicalCommandLog" (
    "id", "logicalKey", "payloadHash", "operation", "serviceOrderId", "operatorId",
    "operatorNameSnapshot", "affectedItems", "resultOrderStatus", "createdAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .run(
      id, input.logicalKey, input.payloadHash, input.operation, input.serviceOrderId,
      input.operatorId, input.operatorNameSnapshot, input.affectedItems, input.resultOrderStatus,
    );
  return toRecord(database.prepare(`SELECT ${COLUMNS} FROM "ServiceOrderTechnicalCommandLog"
    WHERE "id" = ?`).get(id)!);
}
