/**
 * @file lib/estoqueTecnico/validation.ts
 * @description Validadores de esquema, limites numéricos, sanitização de strings e checagem de invariantes de estoque.
 * 
 * Define:
 * - Limites de tamanho para campos de texto (SKU, nomes, observações).
 * - Validação rigorosa de chaves UUID e formatos de chave de idempotência.
 * - Checagem matemática dos invariantes de estoque (`quantityOnHand`, `quantityReserved`, `quantityAvailable`).
 */

import type {
  TechnicalPartMovementInvariant,
  TechnicalStockBalance,
} from "./types";
import { stockError, validationError } from "./errors";

export const STOCK_NUMERIC_LIMITS = Object.freeze({
  MAX_STOCK_QUANTITY: 1_000_000_000,
  MAX_VERSION: 2_147_483_647,
  MAX_MONEY: 999_999_999.99,
  MAX_PAGE: 100_000,
});

export const STOCK_TEXT_LIMITS = Object.freeze({
  DEFAULT: 255,
  ID: 191,
  NAME: 160,
  SKU: 120,
  CATEGORY: 120,
  DESCRIPTION: 4_000,
  NOTES: 8_000,
  REASON: 1_000,
  LOCATION: 240,
  OPERATOR_NAME: 160,
  BRAND: 120,
  COMPATIBLE_MODEL: 160,
  IDEMPOTENCY_KEY: 36,
});

export function requirePlainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validationError("Informe um objeto válido.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw validationError("Informe um objeto válido.");
  }
  return value as Record<string, unknown>;
}

export function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowlist = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowlist.has(key));
  if (unexpected) {
    throw validationError("O campo informado não é permitido.", { field: unexpected });
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fieldDetails(field: string) {
  return { field };
}

export function requireNonEmptyString(
  value: unknown,
  field: string,
  maxLength: number = STOCK_TEXT_LIMITS.DEFAULT,
): string {
  if (typeof value !== "string") {
    throw validationError("Informe um texto válido.", fieldDetails(field));
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw validationError("Informe um texto válido.", fieldDetails(field));
  }
  return normalized;
}

export function optionalTrimmedString(
  value: unknown,
  field: string,
  maxLength: number = STOCK_TEXT_LIMITS.DEFAULT,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw validationError("Informe um texto válido.", fieldDetails(field));
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw validationError("Informe um texto válido.", fieldDetails(field));
  }
  return normalized;
}

function requireInteger(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value)
  ) {
    throw validationError("Informe uma quantidade inteira válida.", fieldDetails(field));
  }
  return value;
}

export function requirePositiveInteger(value: unknown, field: string): number {
  const parsed = requireInteger(value, field);
  if (parsed <= 0) {
    throw validationError("Informe uma quantidade maior que zero.", fieldDetails(field));
  }
  if (parsed > STOCK_NUMERIC_LIMITS.MAX_STOCK_QUANTITY) {
    throw validationError("A quantidade excede o limite permitido.", fieldDetails(field));
  }
  return parsed;
}

export function requireNonNegativeInteger(value: unknown, field: string): number {
  const parsed = requireInteger(value, field);
  if (parsed < 0) {
    throw validationError("Informe uma quantidade igual ou maior que zero.", fieldDetails(field));
  }
  if (parsed > STOCK_NUMERIC_LIMITS.MAX_STOCK_QUANTITY) {
    throw validationError("A quantidade excede o limite permitido.", fieldDetails(field));
  }
  return parsed;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw validationError("Informe um valor monetário válido.");
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function requireFiniteMoney(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > STOCK_NUMERIC_LIMITS.MAX_MONEY
  ) {
    throw validationError("Informe um valor monetário válido.", fieldDetails(field));
  }
  return roundMoney(value);
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw validationError("Informe um valor booleano válido.", fieldDetails(field));
  }
  return value;
}

export function requireVersion(value: unknown, field = "version"): number {
  const parsed = requireInteger(value, field);
  if (parsed < 0 || parsed > STOCK_NUMERIC_LIMITS.MAX_VERSION) {
    throw validationError("A versão informada é inválida.", fieldDetails(field));
  }
  return parsed;
}

export function requirePage(value: unknown, field = "page"): number {
  const parsed = requireInteger(value, field);
  if (parsed <= 0 || parsed > STOCK_NUMERIC_LIMITS.MAX_PAGE) {
    throw validationError("A página informada é inválida.", fieldDetails(field));
  }
  return parsed;
}

export function assertVersionCanIncrement(version: number): void {
  if (version >= STOCK_NUMERIC_LIMITS.MAX_VERSION) {
    throw validationError("A versão atingiu o limite permitido.", { field: "version" });
  }
}

export function requireIdempotencyKey(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    throw stockError("IDEMPOTENCY_KEY_REQUIRED", 400, "Informe a chave de idempotência.");
  }
  if (
    typeof value !== "string" ||
    value.length > STOCK_TEXT_LIMITS.IDEMPOTENCY_KEY ||
    !UUID_PATTERN.test(value)
  ) {
    throw stockError("IDEMPOTENCY_KEY_INVALID", 422, "A chave de idempotência é inválida.");
  }
  return value.toLowerCase();
}

export function normalizeSku(value: unknown): string | null {
  return optionalTrimmedString(value, "sku", STOCK_TEXT_LIMITS.SKU);
}

export function deriveTechnicalStockBalance(
  quantityOnHand: unknown,
  quantityReserved: unknown,
): TechnicalStockBalance {
  const reserved = requireNonNegativeInteger(quantityReserved, "quantityReserved");
  if (quantityOnHand === null) {
    return {
      mode: "unlimited",
      quantityOnHand: null,
      quantityReserved: reserved,
      quantityAvailable: null,
    };
  }
  const onHand = requireNonNegativeInteger(quantityOnHand, "quantityOnHand");
  if (reserved > onHand) {
    throw stockError(
      "STOCK_INVARIANT_VIOLATION",
      409,
      "O saldo técnico está inconsistente.",
    );
  }
  return {
    mode: "controlled",
    quantityOnHand: onHand,
    quantityReserved: reserved,
    quantityAvailable: onHand - reserved,
  };
}

export function assertTechnicalStockInvariant(
  quantityOnHand: unknown,
  quantityReserved: unknown,
): void {
  try {
    deriveTechnicalStockBalance(quantityOnHand, quantityReserved);
  } catch (error) {
    if (error instanceof Error && error.name === "StockDomainError") throw error;
    throw stockError(
      "STOCK_INVARIANT_VIOLATION",
      409,
      "O saldo técnico está inconsistente.",
      { internalCause: error },
    );
  }
}

export function assertNonNegativePrices(...prices: unknown[]): void {
  try {
    prices.forEach((price, index) => requireFiniteMoney(price, `price${index + 1}`));
  } catch (error) {
    throw stockError(
      "STOCK_INVARIANT_VIOLATION",
      409,
      "Os valores financeiros estão inconsistentes.",
      { internalCause: error },
    );
  }
}

export function assertCommandQuantity(quantity: unknown): number {
  return requirePositiveInteger(quantity, "quantity");
}

export function assertRoundedTotal(
  unitValue: unknown,
  quantity: unknown,
  totalValue: unknown,
): void {
  const unit = requireFiniteMoney(unitValue, "unitValue");
  const amount = requirePositiveInteger(quantity, "quantity");
  const total = requireFiniteMoney(totalValue, "totalValue");
  if (total !== roundMoney(unit * amount)) {
    throw stockError(
      "STOCK_INVARIANT_VIOLATION",
      409,
      "O total financeiro está inconsistente.",
    );
  }
}

export function assertTechnicalMovementInvariant(
  movement: TechnicalPartMovementInvariant,
): void {
  const quantity = movement.type === "STOCK_MODE_CHANGE"
    ? requireNonNegativeInteger(movement.quantity, "quantity")
    : requirePositiveInteger(movement.quantity, "quantity");
  const before = deriveTechnicalStockBalance(movement.onHandBefore, movement.reservedBefore);
  const after = deriveTechnicalStockBalance(movement.onHandAfter, movement.reservedAfter);
  const sameMode = before.mode === after.mode;
  let valid = false;

  switch (movement.type) {
    case "POSITIVE_ADJUSTMENT":
    case "ENTRY":
      valid =
        before.mode === "controlled" &&
        after.mode === "controlled" &&
        after.quantityOnHand - before.quantityOnHand === quantity &&
        before.quantityReserved === after.quantityReserved;
      break;
    case "MANUAL_REVERSAL":
      valid =
        sameMode &&
        (before.mode === "unlimited" ||
          (after.mode === "controlled" &&
            after.quantityOnHand - before.quantityOnHand === quantity)) &&
        before.quantityReserved === after.quantityReserved;
      break;
    case "NEGATIVE_ADJUSTMENT":
      valid =
        before.mode === "controlled" &&
        after.mode === "controlled" &&
        before.quantityOnHand - after.quantityOnHand === quantity &&
        before.quantityReserved === after.quantityReserved;
      break;
    case "RESERVATION":
    case "RESERVATION_INCREASE":
      valid =
        sameMode &&
        before.quantityReserved + quantity === after.quantityReserved &&
        before.quantityOnHand === after.quantityOnHand;
      break;
    case "RESERVATION_DECREASE":
    case "RELEASE":
      valid =
        sameMode &&
        before.quantityReserved - quantity === after.quantityReserved &&
        before.quantityOnHand === after.quantityOnHand;
      break;
    case "CONSUMPTION":
      valid =
        sameMode &&
        before.quantityReserved - quantity === after.quantityReserved &&
        (before.mode === "unlimited" ||
          (after.mode === "controlled" &&
            before.quantityOnHand - after.quantityOnHand === quantity));
      break;
    case "STOCK_MODE_CHANGE":
      valid =
        !sameMode &&
        before.quantityReserved === 0 &&
        after.quantityReserved === 0 &&
        ((before.mode === "unlimited" &&
          after.mode === "controlled" &&
          quantity === after.quantityOnHand) ||
          (before.mode === "controlled" &&
            after.mode === "unlimited" &&
            quantity === before.quantityOnHand));
      break;
  }

  if (!valid) {
    throw stockError(
      "STOCK_INVARIANT_VIOLATION",
      409,
      "O movimento técnico está inconsistente.",
    );
  }
}
