#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const { applyMigrations } = require("../schema-migrator/core.cjs");

const projectRoot = path.resolve(__dirname, "..", "..");
const sourceDatabase = path.join(projectRoot, "data", "nio-os.db");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-etapa3c1-"));
const databasePath = path.join(temporaryRoot, "laboratorio.db");

const originalTsLoader = Module._extensions[".ts"];
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText.replace(/import\.meta\.url/g, "__filename");
  module._compile(output, filename);
};

const dbCore = require("../../lib/estoqueTecnico/db.ts");
const errors = require("../../lib/estoqueTecnico/errors.ts");
const idempotency = require("../../lib/estoqueTecnico/idempotency.ts");
const sanitize = require("../../lib/estoqueTecnico/sanitize.ts");
const validation = require("../../lib/estoqueTecnico/validation.ts");

const location = { runtimeRoot: temporaryRoot, databasePath };
let assertions = 0;
let outsideRoot = null;

function check(fn) {
  fn();
  assertions += 1;
}

function expectStockError(fn, code) {
  assert.throws(fn, (error) => error instanceof errors.StockDomainError && error.code === code);
  assertions += 1;
}

function insertPart(database, id, name) {
  database.prepare(`INSERT INTO "TechnicalPart" (
    "id", "name", "sku", "quantityOnHand", "quantityReserved", "minStock",
    "currentCostPrice", "defaultSalePrice", "isActive", "version", "createdAt", "updatedAt"
  ) VALUES (?, ?, NULL, 1, 0, 0, 0, 0, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(id, name);
}

try {
  assert.equal(fs.existsSync(sourceDatabase), true);
  fs.copyFileSync(sourceDatabase, databasePath);
  applyMigrations(databasePath, { logger: () => undefined });

  check(() => assert.equal(dbCore.__resolveStockDatabaseForTests(location), fs.realpathSync(databasePath)));
  expectStockError(
    () => dbCore.__resolveStockDatabaseForTests({ runtimeRoot: ".", databasePath }),
    "STOCK_DB_UNAVAILABLE",
  );
  outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-etapa3c1-outside-"));
  const outsideDatabase = path.join(outsideRoot, "outside.db");
  fs.copyFileSync(databasePath, outsideDatabase);
  expectStockError(
    () => dbCore.__resolveStockDatabaseForTests({ runtimeRoot: temporaryRoot, databasePath: outsideDatabase }),
    "STOCK_DB_UNAVAILABLE",
  );
  expectStockError(
    () => dbCore.__resolveStockDatabaseForTests({ runtimeRoot: temporaryRoot, databasePath: temporaryRoot }),
    "STOCK_DB_UNAVAILABLE",
  );
  const escapedLink = path.join(temporaryRoot, "escaped.db");
  fs.symlinkSync(outsideDatabase, escapedLink, "file");
  expectStockError(
    () => dbCore.__resolveStockDatabaseForTests({ runtimeRoot: temporaryRoot, databasePath: escapedLink }),
    "STOCK_DB_UNAVAILABLE",
  );

  const commit = dbCore.__withImmediateTransactionForTests(location, "commit-test", (database) => {
    assert.equal(Number(database.prepare("PRAGMA foreign_keys").get().foreign_keys), 1);
    insertPart(database, "etapa3c1-commit", "Commit seguro");
    return "committed";
  });
  check(() => assert.equal(commit.value, "committed"));
  const verifyCommit = new DatabaseSync(databasePath);
  check(() => assert.equal(
    Number(verifyCommit.prepare("SELECT count(*) AS total FROM TechnicalPart WHERE id = ?").get("etapa3c1-commit").total),
    1,
  ));
  verifyCommit.close();

  expectStockError(
    () => dbCore.__withImmediateTransactionForTests(location, "rollback-test", (database) => {
      insertPart(database, "etapa3c1-rollback", "Rollback seguro");
      throw new Error("falha controlada de laboratório");
    }),
    "INTERNAL_ERROR",
  );
  const verifyRollback = new DatabaseSync(databasePath);
  check(() => assert.equal(
    Number(verifyRollback.prepare("SELECT count(*) AS total FROM TechnicalPart WHERE id = ?").get("etapa3c1-rollback").total),
    0,
  ));
  verifyRollback.close();
  const renamedDatabase = path.join(temporaryRoot, "conexao-fechada.db");
  fs.renameSync(databasePath, renamedDatabase);
  fs.renameSync(renamedDatabase, databasePath);
  assertions += 1;

  const blocker = new DatabaseSync(databasePath);
  blocker.exec("PRAGMA busy_timeout = 5000");
  blocker.exec("BEGIN IMMEDIATE");
  expectStockError(
    () => dbCore.__withImmediateTransactionForTests(location, "busy-test", () => "never"),
    "STOCK_DB_BUSY",
  );
  blocker.exec("ROLLBACK");
  blocker.close();
  const verifyBusy = new DatabaseSync(databasePath);
  check(() => assert.equal(
    Number(verifyBusy.prepare("SELECT count(*) AS total FROM TechnicalPart WHERE id = ?").get("busy-partial").total),
    0,
  ));
  verifyBusy.close();

  expectStockError(() => validation.requireNonNegativeInteger(NaN, "q"), "VALIDATION_ERROR");
  expectStockError(() => validation.requireNonNegativeInteger(Infinity, "q"), "VALIDATION_ERROR");
  expectStockError(() => validation.requireNonNegativeInteger(-1, "q"), "VALIDATION_ERROR");
  expectStockError(() => validation.requirePositiveInteger(1.5, "q"), "VALIDATION_ERROR");
  expectStockError(() => validation.requireFiniteMoney("", "money"), "VALIDATION_ERROR");
  expectStockError(
    () => validation.requireNonEmptyString("x".repeat(validation.STOCK_TEXT_LIMITS.NAME + 1), "name", validation.STOCK_TEXT_LIMITS.NAME),
    "VALIDATION_ERROR",
  );
  check(() => assert.equal(validation.normalizeSku("   "), null));
  check(() => assert.equal(validation.normalizeSku("  AbC-1  "), "AbC-1"));
  check(() => assert.equal(validation.requireFiniteMoney(10.235, "money"), 10.24));

  const requestKey = "0f5d7f27-c02a-4d1b-9797-cf136d4334b8";
  check(() => assert.equal(validation.requireIdempotencyKey(requestKey), requestKey));
  expectStockError(() => validation.requireIdempotencyKey("not-a-uuid"), "IDEMPOTENCY_KEY_INVALID");
  const hashA = idempotency.hashIdempotentPayload({ b: [2, 1], a: { y: true, x: 1 } });
  const hashB = idempotency.hashIdempotentPayload({ a: { x: 1, y: true }, b: [2, 1] });
  check(() => assert.equal(hashA, hashB));
  check(() => assert.equal(
    idempotency.buildPersistedIdempotencyKey({
      namespace: "tp", operation: "create", version: "v1", requestKey,
    }),
    `tp:create:v1:${requestKey}`,
  ));
  check(() => assert.equal(idempotency.compareIdempotentReplay({
    storedPayloadHash: hashA, currentPayloadHash: hashB, storedValue: { id: "safe" },
  }).replay, true));
  expectStockError(() => idempotency.compareIdempotentReplay({
    storedPayloadHash: hashA, currentPayloadHash: "different", storedValue: null,
  }), "IDEMPOTENCY_KEY_REUSED");

  const financialObject = {
    id: "part",
    currentCostPrice: 9.5,
    stockCostValue: 19,
    nested: { unitCostSnapshot: 3, operational: "ok" },
    list: [{ totalCostSnapshot: 5, quantity: 2 }],
    missing: undefined,
  };
  const publicProjection = sanitize.sanitizeTechnicalPart(financialObject, false);
  check(() => assert.deepEqual(publicProjection, {
    id: "part", nested: { operational: "ok" }, list: [{ quantity: 2 }],
  }));
  const listProjection = sanitize.sanitizeTechnicalStockList([financialObject], false);
  check(() => assert.equal("currentCostPrice" in listProjection[0], false));
  const financialProjection = sanitize.sanitizeTechnicalPart(financialObject, true);
  check(() => assert.equal(financialProjection.currentCostPrice, 9.5));
  check(() => assert.equal(publicProjection.currentCostPrice, undefined));

  check(() => assert.deepEqual(validation.deriveTechnicalStockBalance(null, 4), {
    mode: "unlimited", quantityOnHand: null, quantityReserved: 4, quantityAvailable: null,
  }));
  check(() => assert.deepEqual(validation.deriveTechnicalStockBalance(8, 3), {
    mode: "controlled", quantityOnHand: 8, quantityReserved: 3, quantityAvailable: 5,
  }));
  expectStockError(() => validation.deriveTechnicalStockBalance(2, 3), "STOCK_INVARIANT_VIOLATION");
  expectStockError(() => validation.deriveTechnicalStockBalance(-1, 0), "VALIDATION_ERROR");
  expectStockError(() => validation.assertRoundedTotal(2.5, 3, 8), "STOCK_INVARIANT_VIOLATION");
  check(() => validation.assertTechnicalMovementInvariant({
    type: "CONSUMPTION", quantity: 2, onHandBefore: null, onHandAfter: null,
    reservedBefore: 4, reservedAfter: 2,
  }));
  check(() => validation.assertTechnicalMovementInvariant({
    type: "NEGATIVE_ADJUSTMENT", quantity: 2, onHandBefore: 5, onHandAfter: 3,
    reservedBefore: 1, reservedAfter: 1,
  }));

  const malicious = "peça'); DROP TABLE TechnicalPart; --";
  dbCore.__withImmediateTransactionForTests(location, "injection-test", (database) => {
    insertPart(database, "etapa3c1-injection", malicious);
    const row = database.prepare("SELECT name FROM TechnicalPart WHERE id = ?").get("etapa3c1-injection");
    assert.equal(row.name, malicious);
    assert.equal(
      Number(database.prepare("SELECT count(*) AS total FROM sqlite_master WHERE type = ? AND name = ?").get("table", "TechnicalPart").total),
      1,
    );
  });
  assertions += 2;

  process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
} finally {
  Module._extensions[".ts"] = originalTsLoader;
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  if (outsideRoot) fs.rmSync(outsideRoot, { recursive: true, force: true });
}
