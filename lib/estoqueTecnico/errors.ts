/**
 * @file lib/estoqueTecnico/errors.ts
 * @description Hierarquia de erros tipados, catálogo de códigos de falha e mapeador HTTP do Estoque Técnico.
 * 
 * Garante que mensagens amigáveis e seguras (`safeMessage`) sejam retornadas aos clientes sem vazar
 * detalhes internos do banco SQLite, tratando erros de concorrência (`SQLITE_BUSY`) como retryable.
 */

/**
 * Catálogo completo de códigos de erro de domínio do estoque técnico.
 */
export const STOCK_ERROR_CODES = [
  "AUTH_REQUIRED",
  "PERMISSION_DENIED",
  "VALIDATION_ERROR",
  "FINANCIAL_FIELD_FORBIDDEN",
  "TECHNICAL_PART_NOT_FOUND",
  "TECHNICAL_PART_INACTIVE",
  "TECHNICAL_PART_HAS_RESERVATIONS",
  "TECHNICAL_PART_SKU_EXISTS",
  "SERVICE_ORDER_NOT_FOUND",
  "SERVICE_ORDER_PART_NOT_FOUND",
  "ORDER_NOT_MUTABLE",
  "ORDER_STATUS_CONFLICT",
  "ORDER_HAS_PAYMENTS",
  "PART_ALREADY_ACTIVE_ON_ORDER",
  "ORDER_PART_QUANTITY_CONFLICT",
  "SERVICE_ORDER_PART_NOT_RESERVED",
  "SERVICE_ORDER_PART_NOT_CONSUMED",
  "LEGACY_PARTS_COST_CONFIRMATION_REQUIRED",
  "INSUFFICIENT_AVAILABLE_STOCK",
  "UNLIMITED_STOCK_REJECTS_MOVEMENT",
  "STOCK_MODE_CONFLICT",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_KEY_INVALID",
  "IDEMPOTENCY_KEY_REUSED",
  "STOCK_DB_BUSY",
  "STOCK_DB_UNAVAILABLE",
  "STOCK_DB_INCOMPATIBLE",
  "STOCK_INVARIANT_VIOLATION",
  "INTERNAL_ERROR",
] as const;

export type StockErrorCode = (typeof STOCK_ERROR_CODES)[number];

export type SafeErrorDetails = Readonly<
  Record<string, string | number | boolean | null>
>;

type StockDomainErrorOptions = {
  code: StockErrorCode;
  httpStatus: number;
  safeMessage: string;
  retryable?: boolean;
  details?: SafeErrorDetails;
  internalCause?: unknown;
};

/**
 * Classe de erro de domínio para operações de peças e estoque técnico.
 * Encapsula o código de erro, status HTTP correspondente, flag de reintento (`retryable`) e causa interna opcional.
 */
export class StockDomainError extends Error {
  readonly code: StockErrorCode;
  readonly httpStatus: number;
  readonly safeMessage: string;
  readonly retryable: boolean;
  readonly details?: SafeErrorDetails;
  declare readonly internalCause?: unknown;

  constructor(options: StockDomainErrorOptions) {
    super(options.safeMessage);
    this.name = "StockDomainError";
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.safeMessage = options.safeMessage;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    Object.defineProperty(this, "internalCause", {
      value: options.internalCause,
      enumerable: false,
      writable: false,
    });
  }
}

export function stockError(
  code: StockErrorCode,
  httpStatus: number,
  safeMessage: string,
  options: Omit<StockDomainErrorOptions, "code" | "safeMessage" | "httpStatus"> = {}
) {
  return new StockDomainError({ code, safeMessage, httpStatus, ...options });
}

export function validationError(safeMessage: string, details?: SafeErrorDetails) {
  return stockError("VALIDATION_ERROR", 422, safeMessage, {
    details,
  });
}

/**
 * Mapeia qualquer erro capturado (exceções do Prisma, erros de SQLite ou erros inesperados)
 * em uma instância canônica de `StockDomainError`.
 * 
 * Converte bloqueios do SQLite (`SQLITE_BUSY` ou `database is locked`) em erros HTTP 503 retryable.
 */
export function mapUnknownStockError(error: unknown): StockDomainError {
  if (error instanceof StockDomainError) return error;

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  const message = error instanceof Error ? error.message : "";

  if (
    code === "SQLITE_BUSY" ||
    code === "SQLITE_BUSY_TIMEOUT" ||
    /\bdatabase is locked\b|\bSQLITE_BUSY\b/i.test(message)
  ) {
    return stockError(
      "STOCK_DB_BUSY",
      503,
      "O estoque está ocupado. Tente novamente em instantes.",
      { retryable: true, internalCause: error }
    );
  }

  if (
    code === "ENOENT" ||
    code === "EACCES" ||
    code === "EPERM" ||
    /unable to open database file/i.test(message)
  ) {
    return stockError(
      "STOCK_DB_UNAVAILABLE",
      503,
      "O banco do estoque técnico está indisponível.",
      { retryable: true, internalCause: error }
    );
  }

  if (/no such table|database disk image is malformed|file is not a database/i.test(message)) {
    return stockError(
      "STOCK_DB_INCOMPATIBLE",
      503,
      "O banco não está preparado para o estoque técnico.",
      { internalCause: error }
    );
  }

  return stockError(
    "INTERNAL_ERROR",
    500,
    "Não foi possível concluir a operação de estoque.",
    { internalCause: error }
  );
}

export function toFutureHttpError(error: unknown) {
  const mapped = mapUnknownStockError(error);
  return {
    status: mapped.httpStatus,
    body: {
      code: mapped.code,
      message: mapped.safeMessage,
      ...(mapped.details ? { details: mapped.details } : {}),
      retryable: mapped.retryable,
    },
  };
}
