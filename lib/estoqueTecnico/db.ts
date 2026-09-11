/**
 * @file lib/estoqueTecnico/db.ts
 * @description Conexão nativa e transacional síncrona com SQLite (`node:sqlite` / `DatabaseSync`).
 * 
 * Responsabilidades:
 * - Resolução segura do arquivo `.db` do SQLite com proteção estrita contra Path Traversal e Symlinks.
 * - Validação de integridade do esquema (verifica presença das tabelas `TechnicalPart`, `ServiceOrderPart`, etc.).
 * - Transações atômicas com bloqueio imediato (`BEGIN IMMEDIATE`) para evitar race conditions em concorrência.
 * - Encerramento e fechamento seguro das conexões (best effort com `ROLLBACK` automático em caso de exceção).
 */

import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { raizDadosRuntime } from "../runtimeStorage";
import {
  StockDomainError,
  mapUnknownStockError,
  stockError,
} from "./errors";
import type {
  StockDatabase,
  StockTechnicalLogger,
  TransactionResult,
} from "./types";

type DatabaseConstructor = new (
  filename: string,
  options?: { timeout?: number; readOnly?: boolean },
) => StockDatabase;

type TestDatabaseLocation = {
  runtimeRoot: string;
  databasePath: string;
};

type TransactionCallback<T> = (database: StockDatabase) => T;

type TransactionOptions = {
  logger?: StockTechnicalLogger;
  affectedRows?: number;
  replay?: boolean;
};

const requireForRuntime = createRequire(import.meta.url);
const DATABASE_EXTENSION = ".db";
const BUSY_TIMEOUT_MS = 5_000;
const REQUIRED_TECHNICAL_TABLES = [
  "TechnicalPart",
  "ServiceOrderPart",
  "TechnicalPartMovement",
  "TechnicalPartCommandLog",
  "ServiceOrderTechnicalCommandLog",
] as const;

function loadDatabaseConstructor(): DatabaseConstructor {
  const sqlite = requireForRuntime("node:sqlite") as { DatabaseSync?: DatabaseConstructor };
  if (!sqlite.DatabaseSync) {
    throw stockError(
      "STOCK_DB_UNAVAILABLE",
      503,
      "O banco do estoque técnico não está disponível.",
    );
  }
  return sqlite.DatabaseSync;
}

function unavailable(cause?: unknown): StockDomainError {
  return stockError(
    "STOCK_DB_UNAVAILABLE",
    503,
    "O banco do estoque técnico não está disponível.",
    { internalCause: cause },
  );
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateDatabaseLocation(input: TestDatabaseLocation): string {
  try {
    if (!path.isAbsolute(input.runtimeRoot) || !path.isAbsolute(input.databasePath)) {
      throw unavailable();
    }
    if (path.extname(input.databasePath).toLowerCase() !== DATABASE_EXTENSION) {
      throw unavailable();
    }
    if (!existsSync(input.runtimeRoot) || !existsSync(input.databasePath)) {
      throw unavailable();
    }
    if (!lstatSync(input.runtimeRoot).isDirectory() || lstatSync(input.databasePath).isDirectory()) {
      throw unavailable();
    }

    const realRoot = realpathSync(input.runtimeRoot);
    const realDatabase = realpathSync(input.databasePath);
    if (!isWithinRoot(realDatabase, realRoot)) throw unavailable();
    if (!lstatSync(realDatabase).isFile()) throw unavailable();
    return realDatabase;
  } catch (error) {
    if (error instanceof StockDomainError) throw error;
    throw unavailable(error);
  }
}

function databaseFromUrl(databaseUrl: string, runtimeRoot: string): string {
  if (!databaseUrl.startsWith("file:")) throw unavailable();
  const raw = databaseUrl.slice("file:".length);
  if (!raw || raw.includes("?") || raw.includes("#")) throw unavailable();
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch (error) {
    throw unavailable(error);
  }
  return path.isAbsolute(decoded)
    ? decoded
    : path.resolve(process.cwd(), "prisma", decoded || path.join(runtimeRoot, "data", "nio-os.db"));
}

function productionDatabaseLocation(): TestDatabaseLocation {
  const explicitRuntimeRoot = process.env.NIO_OS_DATA_DIR || process.env.NIO_OS_RUNTIME_DIR;
  const development = process.env.NODE_ENV !== "production";
  const runtimeRoot = explicitRuntimeRoot
    ? path.resolve(explicitRuntimeRoot)
    : development
      ? process.cwd()
      : path.resolve(raizDadosRuntime());
  const databasePath = process.env.DATABASE_URL
    ? databaseFromUrl(process.env.DATABASE_URL, runtimeRoot)
    : path.join(runtimeRoot, "data", "nio-os.db");
  return { runtimeRoot, databasePath };
}

/**
 * Resolve o caminho absoluto seguro do banco de dados SQLite utilizado pelo estoque técnico.
 * Valida a existência do arquivo e garante que o path resida na pasta de runtime autorizada.
 */
export function resolveStockDatabasePath(): string {
  return validateDatabaseLocation(productionDatabaseLocation());
}

/** @internal Exclusivo para testes descartáveis; não é reexportado pelo módulo público. */
export function __resolveStockDatabaseForTests(input: TestDatabaseLocation): string {
  return validateDatabaseLocation(input);
}

function readScalar(database: StockDatabase, sql: string, field: string): unknown {
  return database.prepare(sql).get()?.[field];
}

function configureConnection(database: StockDatabase): string {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  const foreignKeys = Number(readScalar(database, "PRAGMA foreign_keys", "foreign_keys"));
  const busyTimeout = Number(readScalar(database, "PRAGMA busy_timeout", "timeout"));
  const journalMode = String(readScalar(database, "PRAGMA journal_mode", "journal_mode") ?? "unknown");
  if (foreignKeys !== 1 || busyTimeout !== BUSY_TIMEOUT_MS) {
    throw stockError(
      "STOCK_DB_INCOMPATIBLE",
      503,
      "O banco do estoque técnico é incompatível.",
    );
  }
  return journalMode;
}

function assertCompatibleSchema(database: StockDatabase): void {
  const rows = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = ? AND name IN (?, ?, ?, ?, ?)",
    )
    .all("table", ...REQUIRED_TECHNICAL_TABLES);
  const names = new Set(rows.map((row) => String(row.name)));
  if (REQUIRED_TECHNICAL_TABLES.some((table) => !names.has(table))) {
    throw stockError(
      "STOCK_DB_INCOMPATIBLE",
      503,
      "O banco do estoque técnico é incompatível.",
    );
  }
}

function executeImmediateTransaction<T>(
  databasePath: string,
  operation: string,
  callback: TransactionCallback<T>,
  options: TransactionOptions = {},
): TransactionResult<T> {
  const startedAt = performance.now();
  let database: StockDatabase | null = null;
  let transactionStarted = false;
  let journalMode = "unknown";
  try {
    const DatabaseSync = loadDatabaseConstructor();
    database = new DatabaseSync(databasePath, { timeout: BUSY_TIMEOUT_MS });
    journalMode = configureConnection(database);
    assertCompatibleSchema(database);
    database.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    const value = callback(database);
    const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyFailures.length > 0) {
      throw stockError(
        "STOCK_INVARIANT_VIOLATION",
        409,
        "A operação violou a integridade do estoque técnico.",
      );
    }
    database.exec("COMMIT");
    transactionStarted = false;
    const durationMs = performance.now() - startedAt;
    options.logger?.({
      operation,
      status: "success",
      durationMs,
      replay: options.replay,
      affectedRows: options.affectedRows,
    });
    return { value, durationMs, journalMode };
  } catch (error) {
    if (database && transactionStarted) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // O erro original permanece como causa; nenhuma informação técnica é exposta.
      }
    }
    const mapped = mapUnknownStockError(error);
    options.logger?.({
      operation,
      status: "error",
      durationMs: performance.now() - startedAt,
      code: mapped.code,
      replay: options.replay,
    });
    throw mapped;
  } finally {
    if (database) {
      try {
        database.close();
      } catch {
        // Fechamento é best effort depois de commit/rollback; não vaza detalhes.
      }
    }
  }
}

function executeWithDatabase<T>(
  databasePath: string,
  callback: TransactionCallback<T>,
): T {
  let database: StockDatabase | null = null;
  try {
    const DatabaseSync = loadDatabaseConstructor();
    database = new DatabaseSync(databasePath, {
      timeout: BUSY_TIMEOUT_MS,
      readOnly: true,
    });
    configureConnection(database);
    assertCompatibleSchema(database);
    return callback(database);
  } catch (error) {
    throw mapUnknownStockError(error);
  } finally {
    if (database) {
      try {
        database.close();
      } catch {
        // Fechamento best effort sem exposição de detalhes técnicos.
      }
    }
  }
}

/**
 * Executa uma operação em transação atômica imediata (`BEGIN IMMEDIATE`), garantindo exclusividade de escrita
 * no SQLite e revertendo automaticamente (`ROLLBACK`) se qualquer erro ocorrer.
 * 
 * @param operation Nome da operação sendo executada (usado para logging e auditoria).
 * @param callback Função contendo as queries executadas dentro da transação.
 * @param options Opções adicionais de logging ou auditoria.
 * @returns Objeto com o valor retornado pela callback, duração em ms e modo de journal.
 */
export function withImmediateTransaction<T>(
  operation: string,
  callback: TransactionCallback<T>,
  options?: TransactionOptions,
): TransactionResult<T> {
  return executeImmediateTransaction(resolveStockDatabasePath(), operation, callback, options);
}

/**
 * Abre conexão somente-leitura com o SQLite para consultas rápidas sem travar a escrita.
 * 
 * @param callback Função contendo as leituras no banco.
 * @returns Resultado da callback executada.
 */
export function withStockDatabase<T>(callback: TransactionCallback<T>): T {
  return executeWithDatabase(resolveStockDatabasePath(), callback);
}

/** @internal Exclusivo para testes descartáveis; não é reexportado pelo módulo público. */
export function __withImmediateTransactionForTests<T>(
  location: TestDatabaseLocation,
  operation: string,
  callback: TransactionCallback<T>,
  options?: TransactionOptions,
): TransactionResult<T> {
  return executeImmediateTransaction(
    __resolveStockDatabaseForTests(location),
    operation,
    callback,
    options,
  );
}

/** @internal Exclusivo para testes descartáveis; não é reexportado pelo módulo público. */
export function __withStockDatabaseForTests<T>(
  location: TestDatabaseLocation,
  callback: TransactionCallback<T>,
): T {
  return executeWithDatabase(__resolveStockDatabaseForTests(location), callback);
}

export function createStockTechnicalLogger(
  sink?: StockTechnicalLogger,
): StockTechnicalLogger {
  if (!sink || process.env.NODE_ENV === "production") return () => undefined;
  return (event) => {
    sink({
      operation: event.operation,
      status: event.status,
      durationMs: event.durationMs,
      code: event.code,
      replay: event.replay,
      affectedRows: event.affectedRows,
    });
  };
}
