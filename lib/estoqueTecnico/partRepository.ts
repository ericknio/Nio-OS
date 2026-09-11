/**
 * @file lib/estoqueTecnico/partRepository.ts
 * @description Camada de persistência (Repositório SQL nativo) para a tabela `TechnicalPart`.
 * 
 * Executa queries parametrizadas de alta performance no SQLite:
 * - Listagem paginada com filtros dinâmicos de texto, categoria, marca, saldo esgotado ou abaixo do mínimo.
 * - Lock otimista com verificação de coluna `version` em cada update (`version = version + 1`).
 * - Mutação de saldos físicos (`quantityOnHand`) e saldos reservados (`quantityReserved`).
 */

import type { StockDatabase, TechnicalPartRecord } from "./types";
import type { TechnicalPartMetadata } from "./commands";

const PART_COLUMNS = `
  "id", "name", "sku", "category", "brand", "compatibleModel", "description",
  "location", "notes", "quantityOnHand", "quantityReserved", "minStock",
  "currentCostPrice", "defaultSalePrice", "isActive", "version", "createdAt", "updatedAt"
`;

export type TechnicalPartListFilters = {
  q?: string;
  active?: boolean;
  unlimited?: boolean;
  outOfStock?: boolean;
  belowMin?: boolean;
  category?: string;
  brand?: string;
  page: number;
  pageSize: number;
  sort: "name_asc" | "name_desc" | "updated_desc" | "updated_asc";
};

export type TechnicalPartListResult = {
  items: TechnicalPartRecord[];
  total: number;
  page: number;
  pageSize: number;
};

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toPart(row: Record<string, unknown>): TechnicalPartRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    sku: nullableString(row.sku),
    category: nullableString(row.category),
    brand: nullableString(row.brand),
    compatibleModel: nullableString(row.compatibleModel),
    description: nullableString(row.description),
    location: nullableString(row.location),
    notes: nullableString(row.notes),
    quantityOnHand: row.quantityOnHand === null ? null : Number(row.quantityOnHand),
    quantityReserved: Number(row.quantityReserved),
    minStock: Number(row.minStock),
    currentCostPrice: Number(row.currentCostPrice),
    defaultSalePrice: Number(row.defaultSalePrice),
    isActive: Boolean(row.isActive),
    version: Number(row.version),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export function findTechnicalPartById(
  database: StockDatabase,
  id: string,
): TechnicalPartRecord | null {
  const row = database
    .prepare(`SELECT ${PART_COLUMNS} FROM "TechnicalPart" WHERE "id" = ?`)
    .get(id);
  return row ? toPart(row) : null;
}

export function findTechnicalPartBySku(
  database: StockDatabase,
  sku: string,
): TechnicalPartRecord | null {
  const row = database
    .prepare(`SELECT ${PART_COLUMNS} FROM "TechnicalPart" WHERE "sku" = ? COLLATE NOCASE`)
    .get(sku);
  return row ? toPart(row) : null;
}

export function insertTechnicalPart(
  database: StockDatabase,
  input: TechnicalPartMetadata & { id: string; quantityOnHand: number | null },
): TechnicalPartRecord {
  database.prepare(`INSERT INTO "TechnicalPart" (
    "id", "name", "sku", "category", "brand", "compatibleModel", "description",
    "location", "notes", "quantityOnHand", "quantityReserved", "minStock",
    "currentCostPrice", "defaultSalePrice", "isActive", "version", "createdAt", "updatedAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
    .run(
      input.id, input.name, input.sku, input.category, input.brand,
      input.compatibleModel, input.description, input.location, input.notes,
      input.quantityOnHand, input.minStock, input.currentCostPrice, input.defaultSalePrice,
    );
  return findTechnicalPartById(database, input.id)!;
}

export function updateTechnicalPartMetadataRow(
  database: StockDatabase,
  id: string,
  version: number,
  metadata: TechnicalPartMetadata,
): number {
  const result = database.prepare(`UPDATE "TechnicalPart" SET
    "name" = ?, "sku" = ?, "category" = ?, "brand" = ?, "compatibleModel" = ?,
    "description" = ?, "location" = ?, "notes" = ?, "minStock" = ?,
    "currentCostPrice" = ?, "defaultSalePrice" = ?, "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "version" = ?`)
    .run(
      metadata.name, metadata.sku, metadata.category, metadata.brand,
      metadata.compatibleModel, metadata.description, metadata.location, metadata.notes,
      metadata.minStock, metadata.currentCostPrice, metadata.defaultSalePrice, id, version,
    );
  return Number(result.changes);
}

export function updateTechnicalPartActiveState(
  database: StockDatabase,
  id: string,
  version: number,
  active: boolean,
  requireNoReservation: boolean,
): number {
  const statement = requireNoReservation
    ? `UPDATE "TechnicalPart" SET "isActive" = ?, "version" = "version" + 1,
       "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "version" = ? AND "quantityReserved" = 0`
    : `UPDATE "TechnicalPart" SET "isActive" = ?, "version" = "version" + 1,
       "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "version" = ?`;
  return Number(database.prepare(statement).run(active ? 1 : 0, id, version).changes);
}

export function incrementTechnicalPartStock(
  database: StockDatabase,
  input: {
    id: string;
    version: number;
    quantity: number;
    unitCost: number | null;
    updateCost: boolean;
  },
): number {
  const sql = input.updateCost
    ? `UPDATE "TechnicalPart" SET "quantityOnHand" = "quantityOnHand" + ?,
       "currentCostPrice" = ?, "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "isActive" = 1 AND "quantityOnHand" IS NOT NULL AND "version" = ?`
    : `UPDATE "TechnicalPart" SET "quantityOnHand" = "quantityOnHand" + ?,
       "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "isActive" = 1 AND "quantityOnHand" IS NOT NULL AND "version" = ?`;
  const params = input.updateCost
    ? [input.quantity, input.unitCost, input.id, input.version] as const
    : [input.quantity, input.id, input.version] as const;
  return Number(database.prepare(sql).run(...params).changes);
}

export function decrementTechnicalPartAvailableStock(
  database: StockDatabase,
  input: { id: string; version: number; quantity: number },
): number {
  return Number(database.prepare(`UPDATE "TechnicalPart" SET
    "quantityOnHand" = "quantityOnHand" - ?, "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "isActive" = 1 AND "quantityOnHand" IS NOT NULL
      AND "version" = ? AND "quantityOnHand" - "quantityReserved" >= ?`)
    .run(input.quantity, input.id, input.version, input.quantity).changes);
}

export function reserveTechnicalPartStock(
  database: StockDatabase,
  input: { id: string; version: number; quantity: number },
): number {
  return Number(database.prepare(`UPDATE "TechnicalPart" SET
    "quantityReserved" = "quantityReserved" + ?,
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "isActive" = 1 AND "version" = ?
      AND "version" < 2147483647
      AND "quantityReserved" <= 1000000000 - ?
      AND (
        "quantityOnHand" IS NULL
        OR "quantityOnHand" - "quantityReserved" >= ?
      )`)
    .run(input.quantity, input.id, input.version, input.quantity, input.quantity).changes);
}

export function increaseTechnicalPartReservation(
  database: StockDatabase,
  input: { id: string; version: number; quantity: number },
): number {
  return Number(database.prepare(`UPDATE "TechnicalPart" SET
    "quantityReserved" = "quantityReserved" + ?, "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "isActive" = 1 AND "version" = ?
      AND "version" < 2147483647
      AND "quantityReserved" <= 1000000000 - ?
      AND ("quantityOnHand" IS NULL OR "quantityOnHand" - "quantityReserved" >= ?)`)
    .run(input.quantity, input.id, input.version, input.quantity, input.quantity).changes);
}

export function decreaseTechnicalPartReservation(
  database: StockDatabase,
  input: { id: string; version: number; quantity: number },
): number {
  return Number(database.prepare(`UPDATE "TechnicalPart" SET
    "quantityReserved" = "quantityReserved" - ?, "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "version" = ? AND "version" < 2147483647
      AND "quantityReserved" >= ?`)
    .run(input.quantity, input.id, input.version, input.quantity).changes);
}

export function consumeTechnicalPartReservation(
  database: StockDatabase,
  input: { id: string; version: number; quantity: number; unlimited: boolean },
): number {
  const sql = input.unlimited
    ? `UPDATE "TechnicalPart" SET
       "quantityReserved" = "quantityReserved" - ?, "version" = "version" + 1,
       "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "quantityOnHand" IS NULL AND "version" = ?
         AND "version" < 2147483647 AND "quantityReserved" >= ?`
    : `UPDATE "TechnicalPart" SET
       "quantityOnHand" = "quantityOnHand" - ?,
       "quantityReserved" = "quantityReserved" - ?, "version" = "version" + 1,
       "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "quantityOnHand" IS NOT NULL AND "version" = ?
         AND "version" < 2147483647
         AND "quantityOnHand" >= ? AND "quantityReserved" >= ?`;
  const result = input.unlimited
    ? database.prepare(sql).run(input.quantity, input.id, input.version, input.quantity)
    : database.prepare(sql).run(
      input.quantity, input.quantity, input.id, input.version, input.quantity, input.quantity,
    );
  return Number(result.changes);
}


export function reverseTechnicalPartConsumption(
  database: StockDatabase,
  input: { id: string; version: number; quantity: number; unlimited: boolean },
): number {
  const sql = input.unlimited
    ? `UPDATE "TechnicalPart" SET
       "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "quantityOnHand" IS NULL AND "version" = ?
         AND "version" < 2147483647`
    : `UPDATE "TechnicalPart" SET
       "quantityOnHand" = "quantityOnHand" + ?,
       "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "quantityOnHand" IS NOT NULL AND "version" = ?
         AND "version" < 2147483647
         AND "quantityOnHand" <= 1000000000 - ?`;

  const result = input.unlimited
    ? database.prepare(sql).run(input.id, input.version)
    : database.prepare(sql).run(
        input.quantity,
        input.id,
        input.version,
        input.quantity,
      );

  return Number(result.changes);
}

export function changeTechnicalPartToControlledRow(
  database: StockDatabase,
  input: { id: string; version: number; initialQuantity: number },
): number {
  return Number(database.prepare(`UPDATE "TechnicalPart" SET
    "quantityOnHand" = ?, "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "quantityOnHand" IS NULL AND "quantityReserved" = 0
      AND "version" = ?`)
    .run(input.initialQuantity, input.id, input.version).changes);
}

export function changeTechnicalPartToUnlimitedRow(
  database: StockDatabase,
  input: { id: string; version: number },
): number {
  return Number(database.prepare(`UPDATE "TechnicalPart" SET
    "quantityOnHand" = NULL, "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ? AND "quantityOnHand" IS NOT NULL AND "quantityReserved" = 0
      AND "version" = ?`)
    .run(input.id, input.version).changes);
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function listTechnicalPartRows(
  database: StockDatabase,
  filters: TechnicalPartListFilters,
): TechnicalPartListResult {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters.q) {
    clauses.push(`("name" LIKE ? ESCAPE '\\' OR "sku" LIKE ? ESCAPE '\\'
      OR "compatibleModel" LIKE ? ESCAPE '\\')`);
    const term = `%${escapeLike(filters.q)}%`;
    params.push(term, term, term);
  }
  if (filters.active !== undefined) {
    clauses.push(`"isActive" = ?`);
    params.push(filters.active ? 1 : 0);
  }
  if (filters.unlimited !== undefined) {
    clauses.push(filters.unlimited ? `"quantityOnHand" IS NULL` : `"quantityOnHand" IS NOT NULL`);
  }
  if (filters.outOfStock) {
    clauses.push(`"quantityOnHand" IS NOT NULL AND "quantityOnHand" - "quantityReserved" = 0`);
  }
  if (filters.belowMin) {
    clauses.push(`"quantityOnHand" IS NOT NULL AND "quantityOnHand" - "quantityReserved" < "minStock"`);
  }
  if (filters.category) {
    clauses.push(`"category" = ?`);
    params.push(filters.category);
  }
  if (filters.brand) {
    clauses.push(`"brand" = ?`);
    params.push(filters.brand);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sortAllowlist = {
    name_asc: `"name" COLLATE NOCASE ASC, "id" ASC`,
    name_desc: `"name" COLLATE NOCASE DESC, "id" ASC`,
    updated_desc: `"updatedAt" DESC, "id" ASC`,
    updated_asc: `"updatedAt" ASC, "id" ASC`,
  } as const;
  const total = Number(
    database.prepare(`SELECT COUNT(*) AS "total" FROM "TechnicalPart" ${where}`)
      .get(...params)?.total ?? 0,
  );
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = database.prepare(`SELECT ${PART_COLUMNS} FROM "TechnicalPart" ${where}
    ORDER BY ${sortAllowlist[filters.sort]} LIMIT ? OFFSET ?`)
    .all(...params, filters.pageSize, offset);
  return {
    items: rows.map(toPart),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}
