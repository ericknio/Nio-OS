/**
 * @file lib/estoqueTecnico/sanitize.ts
 * @description Sanitização e mascaramento de campos financeiros sensíveis (Preço de Custo, Lucro Bruto e Margens).
 * 
 * Garante que operadores sem a permissão `dashboard.ver` ou perfil financeiro/admin não recebam
 * valores confidenciais de custo de aquisição de peças nas respostas de API e projeções públicas.
 */

import type {
  ServiceOrderPartRecord,
  ServiceOrderPartPublicProjection,
  TechnicalPartMovementRecord,
  TechnicalPartMovementPublicProjection,
  TechnicalPartPublicProjection,
} from "./types";

const FINANCIAL_FIELDS = new Set([
  "currentcostprice",
  "unitcostsnapshot",
  "totalcostsnapshot",
  "stockcostvalue",
  "grossprofit",
  "grossmargin",
  "grossmarginpercent",
  "historicalconsumedcost",
]);

function isFinancialField(key: string): boolean {
  const normalized = key.replace(/[_-]/g, "").toLowerCase();
  return (
    FINANCIAL_FIELDS.has(normalized) ||
    normalized.includes("costprice") ||
    normalized.includes("costsnapshot") ||
    normalized.endsWith("costvalue") ||
    normalized.includes("grossprofit") ||
    normalized.includes("grossmargin") ||
    normalized.includes("consumedcost")
  );
}

function sanitizeValue(value: unknown, canViewFinancial: boolean): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, canViewFinancial));
  }
  if (typeof value !== "object" || value === null) return undefined;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    if (!canViewFinancial && isFinancialField(key)) continue;
    const sanitized = sanitizeValue(entry, canViewFinancial);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function sanitizeObject(value: unknown, canViewFinancial: boolean): Record<string, unknown> {
  const sanitized = sanitizeValue(value, canViewFinancial);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

export function sanitizeTechnicalPart(
  value: unknown,
  canViewFinancial: boolean,
): TechnicalPartPublicProjection {
  return sanitizeObject(value, canViewFinancial);
}

export function sanitizeServiceOrderPart(
  value: unknown,
  canViewFinancial: boolean,
): ServiceOrderPartPublicProjection {
  const item = value as ServiceOrderPartRecord;
  const projection: ServiceOrderPartPublicProjection = {
    id: item.id,
    serviceOrderId: item.serviceOrderId,
    technicalPartId: item.technicalPartId,
    partNameSnapshot: item.partNameSnapshot,
    partSkuSnapshot: item.partSkuSnapshot,
    unitPriceSnapshot: item.unitPriceSnapshot,
    quantity: item.quantity,
    totalPriceSnapshot: item.totalPriceSnapshot,
    state: item.state,
    reservedAt: item.reservedAt,
    consumedAt: item.consumedAt,
    releasedAt: item.releasedAt,
    reversedAt: item.reversedAt,
    responsibleUserNameSnapshot: item.responsibleUserNameSnapshot,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    subtotal: item.totalPriceSnapshot,
  };
  if (canViewFinancial) {
    projection.unitCostSnapshot = item.unitCostSnapshot;
    projection.totalCostSnapshot = item.totalCostSnapshot;
  }
  return projection;
}

export function sanitizeTechnicalPartMovement(
  value: unknown,
  canViewFinancial: boolean,
): TechnicalPartMovementPublicProjection {
  const movement = value as TechnicalPartMovementRecord;
  const projection: TechnicalPartMovementPublicProjection = {
    id: movement.id,
    technicalPartId: movement.technicalPartId,
    serviceOrderPartId: movement.serviceOrderPartId,
    type: movement.type,
    quantity: movement.quantity,
    onHandBefore: movement.onHandBefore,
    onHandAfter: movement.onHandAfter,
    reservedBefore: movement.reservedBefore,
    reservedAfter: movement.reservedAfter,
    reason: movement.reason,
    operatorNameSnapshot: movement.operatorNameSnapshot,
    createdAt: movement.createdAt,
  };
  if (canViewFinancial) projection.unitCostSnapshot = movement.unitCostSnapshot;
  return projection;
}

export function sanitizeTechnicalStockList(
  values: readonly unknown[],
  canViewFinancial: boolean,
): Array<Record<string, unknown>> {
  return values.map((value) => sanitizeObject(value, canViewFinancial));
}

export function sanitizeTechnicalStockPayload(
  value: unknown,
  canViewFinancial: boolean,
): unknown {
  return sanitizeValue(value, canViewFinancial);
}
