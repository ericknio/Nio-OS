import type { InternalCommandContext } from "./types";
import { stockError, validationError } from "./errors";
import {
  STOCK_TEXT_LIMITS,
  assertAllowedKeys,
  normalizeSku,
  optionalTrimmedString,
  requireBoolean,
  requireFiniteMoney,
  requireIdempotencyKey,
  requireNonEmptyString,
  requireNonNegativeInteger,
  requirePlainRecord,
  requirePositiveInteger,
  requireVersion,
} from "./validation";

const METADATA_FIELDS = [
  "name", "sku", "category", "brand", "compatibleModel", "description",
  "location", "notes", "minStock", "currentCostPrice", "defaultSalePrice",
] as const;

export type ValidatedContext = InternalCommandContext;

export type TechnicalPartMetadata = {
  name: string;
  sku: string | null;
  category: string | null;
  brand: string | null;
  compatibleModel: string | null;
  description: string | null;
  location: string | null;
  notes: string | null;
  minStock: number;
  currentCostPrice: number;
  defaultSalePrice: number;
};

export type CreateTechnicalPartCommand = TechnicalPartMetadata & {
  unlimitedStock: boolean;
  initialQuantity: number | null;
};

export type UpdateTechnicalPartCommand = Partial<TechnicalPartMetadata> & {
  version: number;
};

export type AdministrativeCommand = { version: number; reason: string };

export type CancelServiceOrderCommand = {
  expectedCurrentStatus: string;
  confirmation: true;
  reason: string;
  returnConsumedParts?: boolean;
};

export type StockMovementCommand = {
  quantity: number;
  reason: string;
  unitCost: number | null;
  unitCostProvided: boolean;
  version: number;
};

export type ToControlledCommand = {
  initialQuantity: number;
  confirmation: true;
  reason: string;
  version: number;
};

export type ToUnlimitedCommand = {
  confirmation: true;
  reason: string;
  version: number;
};

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function optionalMetadataText(
  input: Record<string, unknown>,
  field: string,
  limit: number,
): string | null {
  return optionalTrimmedString(input[field], field, limit);
}

function validateFinancialField(
  input: Record<string, unknown>,
  field: string,
  context: ValidatedContext,
): number | undefined {
  if (!hasOwn(input, field)) return undefined;
  if (!context.canViewFinancialData) {
    throw stockError(
      "FINANCIAL_FIELD_FORBIDDEN",
      403,
      "Você não pode informar dados financeiros sensíveis.",
    );
  }
  return requireFiniteMoney(input[field], field);
}

export function validateCommandContext(value: unknown): ValidatedContext {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, [
    "operatorId", "operatorName", "canViewFinancialData", "idempotencyKey",
  ]);
  return {
    operatorId:
      input.operatorId === null
        ? null
        : requireNonEmptyString(input.operatorId, "operatorId", STOCK_TEXT_LIMITS.ID),
    operatorName: requireNonEmptyString(
      input.operatorName,
      "operatorName",
      STOCK_TEXT_LIMITS.OPERATOR_NAME,
    ),
    canViewFinancialData: requireBoolean(
      input.canViewFinancialData,
      "canViewFinancialData",
    ),
    idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
  };
}

export function validateCreateTechnicalPart(
  value: unknown,
  context: ValidatedContext,
): CreateTechnicalPartCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, [...METADATA_FIELDS, "unlimitedStock", "initialQuantity"]);
  const unlimitedStock = requireBoolean(input.unlimitedStock, "unlimitedStock");
  const hasInitialQuantity = hasOwn(input, "initialQuantity");
  if (unlimitedStock && hasInitialQuantity) {
    throw validationError("Estoque ilimitado não aceita quantidade inicial.", {
      field: "initialQuantity",
    });
  }
  if (!unlimitedStock && !hasInitialQuantity) {
    throw validationError("Informe a quantidade inicial.", { field: "initialQuantity" });
  }
  const currentCostPrice = validateFinancialField(input, "currentCostPrice", context) ?? 0;
  return {
    name: requireNonEmptyString(input.name, "name", STOCK_TEXT_LIMITS.NAME),
    sku: normalizeSku(input.sku),
    category: optionalMetadataText(input, "category", STOCK_TEXT_LIMITS.CATEGORY),
    brand: optionalMetadataText(input, "brand", STOCK_TEXT_LIMITS.BRAND),
    compatibleModel: optionalMetadataText(
      input,
      "compatibleModel",
      STOCK_TEXT_LIMITS.COMPATIBLE_MODEL,
    ),
    description: optionalMetadataText(input, "description", STOCK_TEXT_LIMITS.DESCRIPTION),
    location: optionalMetadataText(input, "location", STOCK_TEXT_LIMITS.LOCATION),
    notes: optionalMetadataText(input, "notes", STOCK_TEXT_LIMITS.NOTES),
    unlimitedStock,
    initialQuantity: unlimitedStock
      ? null
      : requireNonNegativeInteger(input.initialQuantity, "initialQuantity"),
    minStock: hasOwn(input, "minStock")
      ? requireNonNegativeInteger(input.minStock, "minStock")
      : 0,
    currentCostPrice,
    defaultSalePrice: hasOwn(input, "defaultSalePrice")
      ? requireFiniteMoney(input.defaultSalePrice, "defaultSalePrice")
      : 0,
  };
}

export function validateUpdateTechnicalPart(
  value: unknown,
  context: ValidatedContext,
): UpdateTechnicalPartCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, [...METADATA_FIELDS, "version"]);
  const result: UpdateTechnicalPartCommand = { version: requireVersion(input.version) };
  if (hasOwn(input, "name")) {
    result.name = requireNonEmptyString(input.name, "name", STOCK_TEXT_LIMITS.NAME);
  }
  if (hasOwn(input, "sku")) result.sku = normalizeSku(input.sku);
  const textFields = [
    ["category", STOCK_TEXT_LIMITS.CATEGORY],
    ["brand", STOCK_TEXT_LIMITS.BRAND],
    ["compatibleModel", STOCK_TEXT_LIMITS.COMPATIBLE_MODEL],
    ["description", STOCK_TEXT_LIMITS.DESCRIPTION],
    ["location", STOCK_TEXT_LIMITS.LOCATION],
    ["notes", STOCK_TEXT_LIMITS.NOTES],
  ] as const;
  for (const [field, limit] of textFields) {
    if (hasOwn(input, field)) result[field] = optionalMetadataText(input, field, limit);
  }
  if (hasOwn(input, "minStock")) {
    result.minStock = requireNonNegativeInteger(input.minStock, "minStock");
  }
  const cost = validateFinancialField(input, "currentCostPrice", context);
  if (cost !== undefined) result.currentCostPrice = cost;
  if (hasOwn(input, "defaultSalePrice")) {
    result.defaultSalePrice = requireFiniteMoney(input.defaultSalePrice, "defaultSalePrice");
  }
  if (Object.keys(result).length === 1) {
    throw validationError("Informe ao menos um campo para alteração.");
  }
  return result;
}

export function validateAdministrativeCommand(value: unknown): AdministrativeCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, ["version", "reason"]);
  return {
    version: requireVersion(input.version),
    reason: requireNonEmptyString(input.reason, "reason", STOCK_TEXT_LIMITS.REASON),
  };
}

export function validateCancelServiceOrderCommand(value: unknown): CancelServiceOrderCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, ["expectedCurrentStatus", "confirmation", "reason", "returnConsumedParts"]);
  if (requireBoolean(input.confirmation, "confirmation") !== true) {
    throw validationError("Confirme o cancelamento da ordem de serviço.", { field: "confirmation" });
  }
  const returnConsumedParts =
    input.returnConsumedParts !== undefined
      ? requireBoolean(input.returnConsumedParts, "returnConsumedParts")
      : true;

  return {
    expectedCurrentStatus: requireNonEmptyString(input.expectedCurrentStatus, "expectedCurrentStatus", 40),
    confirmation: true,
    reason: requireNonEmptyString(input.reason, "reason", STOCK_TEXT_LIMITS.REASON),
    returnConsumedParts,
  };
}

export function validateStockMovementCommand(
  value: unknown,
  context: ValidatedContext,
): StockMovementCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, ["quantity", "reason", "unitCost", "version"]);
  const unitCostProvided = hasOwn(input, "unitCost");
  const unitCost = validateFinancialField(input, "unitCost", context);
  return {
    quantity: requirePositiveInteger(input.quantity, "quantity"),
    reason: requireNonEmptyString(input.reason, "reason", STOCK_TEXT_LIMITS.REASON),
    unitCost: unitCost ?? null,
    unitCostProvided,
    version: requireVersion(input.version),
  };
}

export function validateNegativeAdjustmentCommand(
  value: unknown,
): Omit<StockMovementCommand, "unitCost" | "unitCostProvided"> & {
  unitCost: null;
  unitCostProvided: false;
} {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, ["quantity", "reason", "version"]);
  return {
    quantity: requirePositiveInteger(input.quantity, "quantity"),
    reason: requireNonEmptyString(input.reason, "reason", STOCK_TEXT_LIMITS.REASON),
    unitCost: null,
    unitCostProvided: false,
    version: requireVersion(input.version),
  };
}

export function validateToControlledCommand(value: unknown): ToControlledCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, ["initialQuantity", "confirmation", "reason", "version"]);
  if (requireBoolean(input.confirmation, "confirmation") !== true) {
    throw validationError("Confirme explicitamente a mudança de estoque.", {
      field: "confirmation",
    });
  }
  return {
    initialQuantity: requireNonNegativeInteger(input.initialQuantity, "initialQuantity"),
    confirmation: true,
    reason: requireNonEmptyString(input.reason, "reason", STOCK_TEXT_LIMITS.REASON),
    version: requireVersion(input.version),
  };
}

export function validateToUnlimitedCommand(value: unknown): ToUnlimitedCommand {
  const input = requirePlainRecord(value);
  assertAllowedKeys(input, ["confirmation", "reason", "version"]);
  if (requireBoolean(input.confirmation, "confirmation") !== true) {
    throw validationError("Confirme explicitamente a mudança de estoque.", {
      field: "confirmation",
    });
  }
  return {
    confirmation: true,
    reason: requireNonEmptyString(input.reason, "reason", STOCK_TEXT_LIMITS.REASON),
    version: requireVersion(input.version),
  };
}
