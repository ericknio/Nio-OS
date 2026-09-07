import type {
  StockDatabase,
  TechnicalOrderTotals,
} from "./types";
import { STOCK_NUMERIC_LIMITS, roundMoney } from "./validation";
import { stockError } from "./errors";

export function recalculateTechnicalPartsOrderTotals(
  database: StockDatabase,
  serviceOrderId: string,
): TechnicalOrderTotals {
  const row = database.prepare(`SELECT
    ROUND(COALESCE(SUM(CASE WHEN p."state" IN ('RESERVED', 'CONSUMED')
      THEN p."totalPriceSnapshot" ELSE 0 END), 0), 2) AS "partsCost",
    o."laborCost" AS "laborCost",
    o."discount" AS "discount"
    FROM "ServiceOrder" o
    LEFT JOIN "ServiceOrderPart" p ON p."serviceOrderId" = o."id"
    WHERE o."id" = ?
    GROUP BY o."id", o."laborCost", o."discount"`).get(serviceOrderId);
  if (!row) {
    throw stockError("SERVICE_ORDER_NOT_FOUND", 404, "A ordem de serviço não foi encontrada.");
  }
  const partsCost = roundMoney(Number(row.partsCost));
  const laborCost = roundMoney(Number(row.laborCost));
  const discount = roundMoney(Number(row.discount));
  const totalAmount = roundMoney(Math.max(partsCost + laborCost - discount, 0));
  for (const value of [partsCost, laborCost, discount, totalAmount]) {
    if (!Number.isFinite(value) || value < 0 || value > STOCK_NUMERIC_LIMITS.MAX_MONEY) {
      throw stockError(
        "STOCK_INVARIANT_VIOLATION",
        409,
        "Os totais da ordem de serviço estão inconsistentes.",
      );
    }
  }
  const updated = database.prepare(`UPDATE "ServiceOrder" SET
    "partsCost" = ?, "totalAmount" = ?, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ?`).run(partsCost, totalAmount, serviceOrderId);
  if (Number(updated.changes) !== 1) {
    throw stockError("SERVICE_ORDER_NOT_FOUND", 404, "A ordem de serviço não foi encontrada.");
  }
  return { partsCost, laborCost, discount, totalAmount };
}
