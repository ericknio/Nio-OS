import { randomUUID } from "node:crypto";
import type { TechnicalPartMovementType } from "@prisma/client";
import {
  __withImmediateTransactionForTests,
  __withStockDatabaseForTests,
  withImmediateTransaction,
  withStockDatabase,
} from "./db";
import {
  type AdministrativeCommand,
  type StockMovementCommand,
  type TechnicalPartMetadata,
  type ToControlledCommand,
  type ToUnlimitedCommand,
  validateAdministrativeCommand,
  validateCommandContext,
  validateCreateTechnicalPart,
  validateNegativeAdjustmentCommand,
  validateStockMovementCommand,
  validateToControlledCommand,
  validateToUnlimitedCommand,
  validateUpdateTechnicalPart,
} from "./commands";
import {
  findTechnicalPartCommandLog,
  insertTechnicalPartCommandLog,
} from "./commandLogRepository";
import { StockDomainError, stockError, validationError } from "./errors";
import { buildPersistedIdempotencyKey, hashIdempotentPayload } from "./idempotency";
import {
  findMovementByLogicalKey,
  insertTechnicalPartMovement,
} from "./movementRepository";
import {
  changeTechnicalPartToControlledRow,
  changeTechnicalPartToUnlimitedRow,
  decrementTechnicalPartAvailableStock,
  findTechnicalPartById,
  findTechnicalPartBySku,
  incrementTechnicalPartStock,
  insertTechnicalPart,
  listTechnicalPartRows,
  type TechnicalPartListFilters,
  updateTechnicalPartActiveState,
  updateTechnicalPartMetadataRow,
} from "./partRepository";
import {
  sanitizeTechnicalPart,
  sanitizeTechnicalPartMovement,
} from "./sanitize";
import type {
  InternalCommandContext,
  StockDatabase,
  TechnicalPartCommandResult,
  TechnicalPartMovementRecord,
  TechnicalPartRecord,
  TransactionResult,
} from "./types";
import {
  STOCK_TEXT_LIMITS,
  STOCK_NUMERIC_LIMITS,
  assertAllowedKeys,
  assertTechnicalMovementInvariant,
  assertVersionCanIncrement,
  optionalTrimmedString,
  requireBoolean,
  requireNonEmptyString,
  requireNonNegativeInteger,
  requirePlainRecord,
  requirePage,
  requirePositiveInteger,
} from "./validation";

type TestLocation = { runtimeRoot: string; databasePath: string };
type WriteRunner = <T>(
  operation: string,
  callback: (database: StockDatabase) => T,
) => TransactionResult<T>;
type ReadRunner = <T>(callback: (database: StockDatabase) => T) => T;

export type TechnicalPartReadOptions = { canViewFinancialData: boolean };
export type TechnicalPartListOptions = TechnicalPartReadOptions & Partial<TechnicalPartListFilters>;

const PART_ID_PATTERN = /^[A-Za-z0-9_-]{1,191}$/;
const SORT_ALLOWLIST = new Set(["name_asc", "name_desc", "updated_desc", "updated_asc"]);

function requirePartId(value: unknown): string {
  if (typeof value !== "string" || !PART_ID_PATTERN.test(value)) {
    throw validationError("A identificação da peça técnica é inválida.", { field: "partId" });
  }
  return value;
}

function requirePart(database: StockDatabase, partId: string): TechnicalPartRecord {
  const part = findTechnicalPartById(database, partId);
  if (!part) {
    throw stockError("TECHNICAL_PART_NOT_FOUND", 404, "A peça técnica não foi encontrada.");
  }
  return part;
}

function projectPart(part: TechnicalPartRecord, canViewFinancialData: boolean) {
  return sanitizeTechnicalPart(
    {
      ...part,
      isUnlimited: part.quantityOnHand === null,
      quantityAvailable:
        part.quantityOnHand === null
          ? null
          : part.quantityOnHand - part.quantityReserved,
    },
    canViewFinancialData,
  );
}

function projectResult(
  part: TechnicalPartRecord,
  context: InternalCommandContext,
  movement?: TechnicalPartMovementRecord,
  idempotentReplay = false,
): TechnicalPartCommandResult {
  return {
    part: projectPart(part, context.canViewFinancialData),
    ...(movement
      ? { movement: sanitizeTechnicalPartMovement(movement, context.canViewFinancialData) }
      : {}),
    idempotentReplay,
  };
}

function logicalKey(
  operation: string,
  resources: readonly string[],
  requestKey: string,
): string {
  return buildPersistedIdempotencyKey({
    namespace: "tp",
    operation,
    version: "v1",
    resources,
    requestKey,
  });
}

function persistedKey(logical: string, payload: unknown): { key: string; hash: string } {
  const hash = hashIdempotentPayload(payload);
  return { key: `${logical}:${hash}`, hash };
}

function findMovementReplay(
  database: StockDatabase,
  input: {
    logical: string;
    persisted: string;
    partId?: string;
    type: TechnicalPartMovementType;
  },
): TechnicalPartMovementRecord | null {
  const found = findMovementByLogicalKey(database, input.logical);
  if (!found) return null;
  if (
    found.idempotencyKey !== input.persisted ||
    found.type !== input.type ||
    (input.partId !== undefined && found.technicalPartId !== input.partId)
  ) {
    throw stockError(
      "IDEMPOTENCY_KEY_REUSED",
      409,
      "A chave de idempotência já foi usada com dados diferentes.",
    );
  }
  return found;
}

function handleSkuConflict(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (/TechnicalPart_sku_key_nocase|TechnicalPart\.sku/i.test(message)) {
    throw stockError(
      "TECHNICAL_PART_SKU_EXISTS",
      409,
      "Já existe uma peça técnica com este SKU.",
      { internalCause: error },
    );
  }
  throw error;
}

function diagnoseCommonFailure(
  part: TechnicalPartRecord | null,
  version: number,
): TechnicalPartRecord {
  if (!part) {
    throw stockError("TECHNICAL_PART_NOT_FOUND", 404, "A peça técnica não foi encontrada.");
  }
  if (part.version !== version) {
    throw stockError("VERSION_CONFLICT", 409, "A peça técnica foi alterada por outra operação.");
  }
  assertVersionCanIncrement(part.version);
  return part;
}

function findAdministrativeReplay(
  database: StockDatabase,
  input: {
    logicalKey: string;
    payloadHash: string;
    operation: "CREATE" | "UPDATE_METADATA" | "DEACTIVATE" | "REACTIVATE";
    technicalPartId?: string;
  },
): TechnicalPartRecord | null {
  const command = findTechnicalPartCommandLog(database, input.logicalKey);
  if (!command) return null;
  if (
    command.payloadHash !== input.payloadHash ||
    command.operation !== input.operation ||
    (input.technicalPartId !== undefined &&
      command.technicalPartId !== input.technicalPartId)
  ) {
    throw stockError(
      "IDEMPOTENCY_KEY_REUSED",
      409,
      "A chave de idempotência já foi usada com dados diferentes.",
    );
  }
  return requirePart(database, command.technicalPartId);
}

function recordAdministrativeCommand(
  database: StockDatabase,
  input: {
    logicalKey: string;
    payloadHash: string;
    operation: "CREATE" | "UPDATE_METADATA" | "DEACTIVATE" | "REACTIVATE";
    part: TechnicalPartRecord;
    context: InternalCommandContext;
    reason: string | null;
  },
): void {
  insertTechnicalPartCommandLog(database, {
    logicalKey: input.logicalKey,
    payloadHash: input.payloadHash,
    operation: input.operation,
    technicalPartId: input.part.id,
    operatorId: input.context.operatorId,
    operatorNameSnapshot: input.context.operatorName,
    reason: input.reason,
    resultVersion: input.part.version,
  });
}

function validateListOptions(value: unknown): TechnicalPartListFilters & TechnicalPartReadOptions {
  const input = value === undefined ? {} : requirePlainRecord(value);
  assertAllowedKeys(input, [
    "canViewFinancialData", "q", "active", "unlimited", "outOfStock", "belowMin",
    "category", "brand", "page", "pageSize", "sort",
  ]);
  const optionalBoolean = (field: string): boolean | undefined =>
    input[field] === undefined ? undefined : requireBoolean(input[field], field);
  const page = input.page === undefined ? 1 : requirePage(input.page, "page");
  const pageSize = input.pageSize === undefined
    ? 25
    : requirePositiveInteger(input.pageSize, "pageSize");
  if (pageSize > 100) throw validationError("O limite máximo por página é 100.", { field: "pageSize" });
  const sort = input.sort === undefined ? "name_asc" : String(input.sort);
  if (!SORT_ALLOWLIST.has(sort)) {
    throw validationError("A ordenação informada é inválida.", { field: "sort" });
  }
  return {
    canViewFinancialData: input.canViewFinancialData === undefined
      ? false
      : requireBoolean(input.canViewFinancialData, "canViewFinancialData"),
    q: optionalTrimmedString(input.q, "q", STOCK_TEXT_LIMITS.DEFAULT) ?? undefined,
    active: optionalBoolean("active"),
    unlimited: optionalBoolean("unlimited"),
    outOfStock: optionalBoolean("outOfStock"),
    belowMin: optionalBoolean("belowMin"),
    category: optionalTrimmedString(input.category, "category", STOCK_TEXT_LIMITS.CATEGORY) ?? undefined,
    brand: optionalTrimmedString(input.brand, "brand", STOCK_TEXT_LIMITS.BRAND) ?? undefined,
    page,
    pageSize,
    sort: sort as TechnicalPartListFilters["sort"],
  };
}

function validateReadOptions(value: unknown): TechnicalPartReadOptions {
  const input = value === undefined ? {} : requirePlainRecord(value);
  assertAllowedKeys(input, ["canViewFinancialData"]);
  return {
    canViewFinancialData: input.canViewFinancialData === undefined
      ? false
      : requireBoolean(input.canViewFinancialData, "canViewFinancialData"),
  };
}

function makeServices(write: WriteRunner, read: ReadRunner) {
  function createTechnicalPart(inputValue: unknown, contextValue: unknown): TechnicalPartCommandResult {
    const context = validateCommandContext(contextValue);
    const input = validateCreateTechnicalPart(inputValue, context);
    const logical = logicalKey("create", [], context.idempotencyKey);
    const persisted = persistedKey(logical, input);
    return write("technical-part-create", (database) => {
      const replayPart = findAdministrativeReplay(database, {
        logicalKey: logical,
        payloadHash: persisted.hash,
        operation: "CREATE",
      });
      if (replayPart) {
        const replayMovement = findMovementByLogicalKey(database, logical);
        return projectResult(replayPart, context, replayMovement ?? undefined, true);
      }
      if (input.sku && findTechnicalPartBySku(database, input.sku)) {
        throw stockError("TECHNICAL_PART_SKU_EXISTS", 409, "Já existe uma peça técnica com este SKU.");
      }
      try {
        const part = insertTechnicalPart(database, {
          ...input,
          id: randomUUID(),
          quantityOnHand: input.initialQuantity,
        });
        if (input.initialQuantity !== null && input.initialQuantity > 0) {
          const movement = insertTechnicalPartMovement(database, {
            technicalPartId: part.id,
            type: "ENTRY",
            quantity: input.initialQuantity,
            onHandBefore: 0,
            onHandAfter: input.initialQuantity,
            reservedBefore: 0,
            reservedAfter: 0,
            unitCostSnapshot: part.currentCostPrice,
            reason: "Saldo inicial do cadastro",
            operatorId: context.operatorId,
            operatorNameSnapshot: context.operatorName,
            idempotencyKey: persisted.key,
          });
          recordAdministrativeCommand(database, {
            logicalKey: logical,
            payloadHash: persisted.hash,
            operation: "CREATE",
            part,
            context,
            reason: "Cadastro inicial",
          });
          return projectResult(part, context, movement);
        }
        recordAdministrativeCommand(database, {
          logicalKey: logical,
          payloadHash: persisted.hash,
          operation: "CREATE",
          part,
          context,
          reason: "Cadastro inicial",
        });
        return projectResult(part, context);
      } catch (error) {
        handleSkuConflict(error);
      }
    }).value;
  }

  function getTechnicalPartById(partIdValue: unknown, optionsValue?: unknown) {
    const partId = requirePartId(partIdValue);
    const options = validateReadOptions(optionsValue);
    return read((database) => projectPart(requirePart(database, partId), options.canViewFinancialData));
  }

  function listTechnicalParts(filtersValue?: unknown, optionsValue?: unknown) {
    const filtersInput = filtersValue === undefined ? {} : requirePlainRecord(filtersValue);
    const optionsInput = optionsValue === undefined ? {} : requirePlainRecord(optionsValue);
    const filters = validateListOptions({ ...filtersInput, ...optionsInput });
    return read((database) => {
      const result = listTechnicalPartRows(database, filters);
      return {
        ...result,
        items: result.items.map((part) => projectPart(part, filters.canViewFinancialData)),
      };
    });
  }

  function updateTechnicalPartMetadata(
    partIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): TechnicalPartCommandResult {
    const partId = requirePartId(partIdValue);
    const context = validateCommandContext(contextValue);
    const input = validateUpdateTechnicalPart(inputValue, context);
    const logical = logicalKey("update", [partId], context.idempotencyKey);
    const payloadHash = hashIdempotentPayload(input);
    return write("technical-part-update", (database) => {
      const replay = findAdministrativeReplay(database, {
        logicalKey: logical,
        payloadHash,
        operation: "UPDATE_METADATA",
        technicalPartId: partId,
      });
      if (replay) return projectResult(replay, context, undefined, true);
      const current = diagnoseCommonFailure(findTechnicalPartById(database, partId), input.version);
      const metadata: TechnicalPartMetadata = {
        name: input.name ?? current.name,
        sku: input.sku === undefined ? current.sku : input.sku,
        category: input.category === undefined ? current.category : input.category,
        brand: input.brand === undefined ? current.brand : input.brand,
        compatibleModel: input.compatibleModel === undefined ? current.compatibleModel : input.compatibleModel,
        description: input.description === undefined ? current.description : input.description,
        location: input.location === undefined ? current.location : input.location,
        notes: input.notes === undefined ? current.notes : input.notes,
        minStock: input.minStock ?? current.minStock,
        currentCostPrice: input.currentCostPrice ?? current.currentCostPrice,
        defaultSalePrice: input.defaultSalePrice ?? current.defaultSalePrice,
      };
      if (metadata.sku) {
        const duplicate = findTechnicalPartBySku(database, metadata.sku);
        if (duplicate && duplicate.id !== partId) {
          throw stockError("TECHNICAL_PART_SKU_EXISTS", 409, "Já existe uma peça técnica com este SKU.");
        }
      }
      try {
        if (updateTechnicalPartMetadataRow(database, partId, input.version, metadata) !== 1) {
          diagnoseCommonFailure(findTechnicalPartById(database, partId), input.version);
          throw stockError("VERSION_CONFLICT", 409, "A peça técnica foi alterada por outra operação.");
        }
      } catch (error) {
        handleSkuConflict(error);
      }
      const updated = requirePart(database, partId);
      recordAdministrativeCommand(database, {
        logicalKey: logical,
        payloadHash,
        operation: "UPDATE_METADATA",
        part: updated,
        context,
        reason: null,
      });
      return projectResult(updated, context);
    }).value;
  }

  function changeActive(
    active: boolean,
    partIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): TechnicalPartCommandResult {
    const partId = requirePartId(partIdValue);
    const context = validateCommandContext(contextValue);
    const input = validateAdministrativeCommand(inputValue);
    const operation = active ? "REACTIVATE" : "DEACTIVATE";
    const logical = logicalKey(active ? "reactivate" : "deactivate", [partId], context.idempotencyKey);
    const payloadHash = hashIdempotentPayload(input);
    return write(active ? "technical-part-reactivate" : "technical-part-deactivate", (database) => {
      const replay = findAdministrativeReplay(database, {
        logicalKey: logical,
        payloadHash,
        operation,
        technicalPartId: partId,
      });
      if (replay) return projectResult(replay, context, undefined, true);
      const current = diagnoseCommonFailure(findTechnicalPartById(database, partId), input.version);
      if (!active && current.quantityReserved > 0) {
        throw stockError(
          "TECHNICAL_PART_HAS_RESERVATIONS",
          409,
          "A peça técnica possui unidades reservadas.",
        );
      }
      if (current.isActive === active) {
        recordAdministrativeCommand(database, {
          logicalKey: logical,
          payloadHash,
          operation,
          part: current,
          context,
          reason: input.reason,
        });
        return projectResult(current, context);
      }
      if (updateTechnicalPartActiveState(database, partId, input.version, active, !active) !== 1) {
        diagnoseCommonFailure(findTechnicalPartById(database, partId), input.version);
      }
      const updated = requirePart(database, partId);
      recordAdministrativeCommand(database, {
        logicalKey: logical,
        payloadHash,
        operation,
        part: updated,
        context,
        reason: input.reason,
      });
      return projectResult(updated, context);
    }).value;
  }

  function executePhysicalIncrease(
    operation: "entry" | "adjust-positive",
    type: "ENTRY" | "POSITIVE_ADJUSTMENT",
    partIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): TechnicalPartCommandResult {
    const partId = requirePartId(partIdValue);
    const context = validateCommandContext(contextValue);
    const input = validateStockMovementCommand(inputValue, context);
    const logical = logicalKey(operation, [partId], context.idempotencyKey);
    const persisted = persistedKey(logical, input);
    return write(`technical-part-${operation}`, (database) => {
      const replay = findMovementReplay(database, { logical, persisted: persisted.key, partId, type });
      if (replay) return projectResult(requirePart(database, partId), context, replay, true);
      const before = diagnoseCommonFailure(findTechnicalPartById(database, partId), input.version);
      if (!before.isActive) {
        throw stockError("TECHNICAL_PART_INACTIVE", 409, "A peça técnica está inativa.");
      }
      if (before.quantityOnHand === null) {
        throw stockError(
          "UNLIMITED_STOCK_REJECTS_MOVEMENT",
          409,
          "Estoque ilimitado não aceita movimentação física.",
        );
      }
      if (
        before.quantityOnHand + input.quantity >
        STOCK_NUMERIC_LIMITS.MAX_STOCK_QUANTITY
      ) {
        throw validationError("O saldo resultante excede o limite permitido.", {
          field: "quantity",
        });
      }
      if (incrementTechnicalPartStock(database, {
        id: partId,
        version: input.version,
        quantity: input.quantity,
        unitCost: input.unitCost,
        updateCost: input.unitCostProvided,
      }) !== 1) {
        diagnoseMovementFailure(findTechnicalPartById(database, partId), input.version);
      }
      const after = requirePart(database, partId);
      assertTechnicalMovementInvariant({
        type,
        quantity: input.quantity,
        onHandBefore: before.quantityOnHand,
        onHandAfter: after.quantityOnHand,
        reservedBefore: before.quantityReserved,
        reservedAfter: after.quantityReserved,
      });
      const movement = insertTechnicalPartMovement(database, {
        technicalPartId: partId,
        type,
        quantity: input.quantity,
        onHandBefore: before.quantityOnHand,
        onHandAfter: after.quantityOnHand,
        reservedBefore: before.quantityReserved,
        reservedAfter: after.quantityReserved,
        unitCostSnapshot: after.currentCostPrice,
        reason: input.reason,
        operatorId: context.operatorId,
        operatorNameSnapshot: context.operatorName,
        idempotencyKey: persisted.key,
      });
      return projectResult(after, context, movement);
    }).value;
  }

  function registerNegativeAdjustment(
    partIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): TechnicalPartCommandResult {
    const partId = requirePartId(partIdValue);
    const context = validateCommandContext(contextValue);
    const input = validateNegativeAdjustmentCommand(inputValue);
    const logical = logicalKey("adjust-negative", [partId], context.idempotencyKey);
    const persisted = persistedKey(logical, input);
    return write("technical-part-adjust-negative", (database) => {
      const replay = findMovementReplay(database, {
        logical, persisted: persisted.key, partId, type: "NEGATIVE_ADJUSTMENT",
      });
      if (replay) return projectResult(requirePart(database, partId), context, replay, true);
      const before = diagnoseMovementFailure(findTechnicalPartById(database, partId), input.version);
      if (before.quantityOnHand! - before.quantityReserved < input.quantity) {
        throw stockError(
          "INSUFFICIENT_AVAILABLE_STOCK",
          409,
          "O estoque disponível é insuficiente.",
        );
      }
      if (decrementTechnicalPartAvailableStock(database, {
        id: partId, version: input.version, quantity: input.quantity,
      }) !== 1) {
        const current = diagnoseMovementFailure(findTechnicalPartById(database, partId), input.version);
        if (current.quantityOnHand! - current.quantityReserved < input.quantity) {
          throw stockError("INSUFFICIENT_AVAILABLE_STOCK", 409, "O estoque disponível é insuficiente.");
        }
        throw stockError("VERSION_CONFLICT", 409, "A peça técnica foi alterada por outra operação.");
      }
      const after = requirePart(database, partId);
      assertTechnicalMovementInvariant({
        type: "NEGATIVE_ADJUSTMENT",
        quantity: input.quantity,
        onHandBefore: before.quantityOnHand,
        onHandAfter: after.quantityOnHand,
        reservedBefore: before.quantityReserved,
        reservedAfter: after.quantityReserved,
      });
      const movement = insertTechnicalPartMovement(database, {
        technicalPartId: partId,
        type: "NEGATIVE_ADJUSTMENT",
        quantity: input.quantity,
        onHandBefore: before.quantityOnHand,
        onHandAfter: after.quantityOnHand,
        reservedBefore: before.quantityReserved,
        reservedAfter: after.quantityReserved,
        unitCostSnapshot: before.currentCostPrice,
        reason: input.reason,
        operatorId: context.operatorId,
        operatorNameSnapshot: context.operatorName,
        idempotencyKey: persisted.key,
      });
      return projectResult(after, context, movement);
    }).value;
  }

  function diagnoseMovementFailure(
    part: TechnicalPartRecord | null,
    version: number,
  ): TechnicalPartRecord {
    const current = diagnoseCommonFailure(part, version);
    if (!current.isActive) {
      throw stockError("TECHNICAL_PART_INACTIVE", 409, "A peça técnica está inativa.");
    }
    if (current.quantityOnHand === null) {
      throw stockError(
        "UNLIMITED_STOCK_REJECTS_MOVEMENT",
        409,
        "Estoque ilimitado não aceita movimentação física.",
      );
    }
    return current;
  }

  function changeTechnicalPartToControlled(
    partIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): TechnicalPartCommandResult {
    const partId = requirePartId(partIdValue);
    const context = validateCommandContext(contextValue);
    const input: ToControlledCommand = validateToControlledCommand(inputValue);
    const logical = logicalKey("mode-controlled", [partId], context.idempotencyKey);
    const persisted = persistedKey(logical, input);
    return write("technical-part-mode-controlled", (database) => {
      const replay = findMovementReplay(database, {
        logical, persisted: persisted.key, partId, type: "STOCK_MODE_CHANGE",
      });
      if (replay) return projectResult(requirePart(database, partId), context, replay, true);
      const before = diagnoseCommonFailure(findTechnicalPartById(database, partId), input.version);
      if (before.quantityOnHand !== null) {
        throw stockError("STOCK_MODE_CONFLICT", 409, "A peça técnica já possui estoque controlado.");
      }
      if (input.initialQuantity < before.quantityReserved) {
        throw stockError("INSUFFICIENT_AVAILABLE_STOCK", 409, "A quantidade inicial é menor que a reserva existente.");
      }
      if (before.quantityReserved > 0) {
        throw stockError(
          "STOCK_MODE_CONFLICT",
          409,
          "A mudança de modo exige a liberação prévia das reservas.",
        );
      }
      if (changeTechnicalPartToControlledRow(database, {
        id: partId, version: input.version, initialQuantity: input.initialQuantity,
      }) !== 1) {
        diagnoseCommonFailure(findTechnicalPartById(database, partId), input.version);
        throw stockError("STOCK_MODE_CONFLICT", 409, "Não foi possível alterar o modo de estoque.");
      }
      const after = requirePart(database, partId);
      assertTechnicalMovementInvariant({
        type: "STOCK_MODE_CHANGE",
        quantity: input.initialQuantity,
        onHandBefore: null,
        onHandAfter: after.quantityOnHand,
        reservedBefore: 0,
        reservedAfter: 0,
      });
      const movement = insertTechnicalPartMovement(database, {
        technicalPartId: partId,
        type: "STOCK_MODE_CHANGE",
        quantity: input.initialQuantity,
        onHandBefore: null,
        onHandAfter: after.quantityOnHand,
        reservedBefore: 0,
        reservedAfter: 0,
        unitCostSnapshot: null,
        reason: input.reason,
        operatorId: context.operatorId,
        operatorNameSnapshot: context.operatorName,
        idempotencyKey: persisted.key,
      });
      return projectResult(after, context, movement);
    }).value;
  }

  function changeTechnicalPartToUnlimited(
    partIdValue: unknown,
    inputValue: unknown,
    contextValue: unknown,
  ): TechnicalPartCommandResult {
    const partId = requirePartId(partIdValue);
    const context = validateCommandContext(contextValue);
    const input: ToUnlimitedCommand = validateToUnlimitedCommand(inputValue);
    const logical = logicalKey("mode-unlimited", [partId], context.idempotencyKey);
    const persisted = persistedKey(logical, input);
    return write("technical-part-mode-unlimited", (database) => {
      const replay = findMovementReplay(database, {
        logical, persisted: persisted.key, partId, type: "STOCK_MODE_CHANGE",
      });
      if (replay) return projectResult(requirePart(database, partId), context, replay, true);
      const before = diagnoseCommonFailure(findTechnicalPartById(database, partId), input.version);
      if (before.quantityOnHand === null) {
        throw stockError("STOCK_MODE_CONFLICT", 409, "A peça técnica já possui estoque ilimitado.");
      }
      if (before.quantityReserved > 0) {
        throw stockError(
          "TECHNICAL_PART_HAS_RESERVATIONS",
          409,
          "A peça técnica possui unidades reservadas.",
        );
      }
      if (changeTechnicalPartToUnlimitedRow(database, { id: partId, version: input.version }) !== 1) {
        diagnoseCommonFailure(findTechnicalPartById(database, partId), input.version);
        throw stockError("STOCK_MODE_CONFLICT", 409, "Não foi possível alterar o modo de estoque.");
      }
      const after = requirePart(database, partId);
      assertTechnicalMovementInvariant({
        type: "STOCK_MODE_CHANGE",
        quantity: before.quantityOnHand,
        onHandBefore: before.quantityOnHand,
        onHandAfter: null,
        reservedBefore: 0,
        reservedAfter: 0,
      });
      const movement = insertTechnicalPartMovement(database, {
        technicalPartId: partId,
        type: "STOCK_MODE_CHANGE",
        quantity: before.quantityOnHand,
        onHandBefore: before.quantityOnHand,
        onHandAfter: null,
        reservedBefore: 0,
        reservedAfter: 0,
        unitCostSnapshot: null,
        reason: input.reason,
        operatorId: context.operatorId,
        operatorNameSnapshot: context.operatorName,
        idempotencyKey: persisted.key,
      });
      return projectResult(after, context, movement);
    }).value;
  }

  return {
    createTechnicalPart,
    getTechnicalPartById,
    listTechnicalParts,
    updateTechnicalPartMetadata,
    deactivateTechnicalPart: (partId: unknown, input: unknown, context: unknown) =>
      changeActive(false, partId, input, context),
    reactivateTechnicalPart: (partId: unknown, input: unknown, context: unknown) =>
      changeActive(true, partId, input, context),
    registerTechnicalPartEntry: (partId: unknown, input: unknown, context: unknown) =>
      executePhysicalIncrease("entry", "ENTRY", partId, input, context),
    registerPositiveAdjustment: (partId: unknown, input: unknown, context: unknown) =>
      executePhysicalIncrease("adjust-positive", "POSITIVE_ADJUSTMENT", partId, input, context),
    registerNegativeAdjustment,
    changeTechnicalPartToControlled,
    changeTechnicalPartToUnlimited,
  };
}

const productionServices = makeServices(
  (operation, callback) => withImmediateTransaction(operation, callback),
  (callback) => withStockDatabase(callback),
);

export const createTechnicalPart = productionServices.createTechnicalPart;
export const getTechnicalPartById = productionServices.getTechnicalPartById;
export const listTechnicalParts = productionServices.listTechnicalParts;
export const updateTechnicalPartMetadata = productionServices.updateTechnicalPartMetadata;
export const deactivateTechnicalPart = productionServices.deactivateTechnicalPart;
export const reactivateTechnicalPart = productionServices.reactivateTechnicalPart;
export const registerTechnicalPartEntry = productionServices.registerTechnicalPartEntry;
export const registerPositiveAdjustment = productionServices.registerPositiveAdjustment;
export const registerNegativeAdjustment = productionServices.registerNegativeAdjustment;
export const changeTechnicalPartToControlled = productionServices.changeTechnicalPartToControlled;
export const changeTechnicalPartToUnlimited = productionServices.changeTechnicalPartToUnlimited;

/** @internal Somente para banco descartável de laboratório. */
export function __createTechnicalPartServicesForTests(location: TestLocation) {
  return makeServices(
    (operation, callback) =>
      __withImmediateTransactionForTests(location, operation, callback),
    (callback) => __withStockDatabaseForTests(location, callback),
  );
}
