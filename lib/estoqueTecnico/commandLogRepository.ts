import { randomUUID } from "node:crypto";
import type {
  StockDatabase,
  TechnicalPartCommandLogRecord,
} from "./types";

const COMMAND_COLUMNS = `
  "id", "logicalKey", "payloadHash", "operation", "technicalPartId",
  "operatorId", "operatorNameSnapshot", "reason", "resultVersion", "createdAt"
`;

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toCommandLog(row: Record<string, unknown>): TechnicalPartCommandLogRecord {
  return {
    id: String(row.id),
    logicalKey: String(row.logicalKey),
    payloadHash: String(row.payloadHash),
    operation: String(row.operation) as TechnicalPartCommandLogRecord["operation"],
    technicalPartId: String(row.technicalPartId),
    operatorId: nullableString(row.operatorId),
    operatorNameSnapshot: String(row.operatorNameSnapshot),
    reason: nullableString(row.reason),
    resultVersion: Number(row.resultVersion),
    createdAt: String(row.createdAt),
  };
}

export function findTechnicalPartCommandLog(
  database: StockDatabase,
  logicalKey: string,
): TechnicalPartCommandLogRecord | null {
  const row = database.prepare(`SELECT ${COMMAND_COLUMNS}
    FROM "TechnicalPartCommandLog" WHERE "logicalKey" = ?`).get(logicalKey);
  return row ? toCommandLog(row) : null;
}

export function insertTechnicalPartCommandLog(
  database: StockDatabase,
  input: Omit<TechnicalPartCommandLogRecord, "id" | "createdAt">,
): TechnicalPartCommandLogRecord {
  const id = randomUUID();
  database.prepare(`INSERT INTO "TechnicalPartCommandLog" (
    "id", "logicalKey", "payloadHash", "operation", "technicalPartId",
    "operatorId", "operatorNameSnapshot", "reason", "resultVersion", "createdAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .run(
      id,
      input.logicalKey,
      input.payloadHash,
      input.operation,
      input.technicalPartId,
      input.operatorId,
      input.operatorNameSnapshot,
      input.reason,
      input.resultVersion,
    );
  const row = database.prepare(`SELECT ${COMMAND_COLUMNS}
    FROM "TechnicalPartCommandLog" WHERE "id" = ?`).get(id);
  return toCommandLog(row!);
}

