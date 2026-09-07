#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { applyMigrations } = require("../schema-migrator/core.cjs");

const projectRoot = path.resolve(__dirname, "..", "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-etapa3c21-"));
const databasePath = path.join(temporaryRoot, "laboratorio.db");
const location = { runtimeRoot: temporaryRoot, databasePath };
const originalLoader = Module._extensions[".ts"];

Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText.replace(/import\.meta\.url/g, "__filename");
  module._compile(output, filename);
};

const serviceModule = require("../../lib/estoqueTecnico/partService.ts");
const dbCore = require("../../lib/estoqueTecnico/db.ts");
const errors = require("../../lib/estoqueTecnico/errors.ts");
const validation = require("../../lib/estoqueTecnico/validation.ts");
const services = serviceModule.__createTechnicalPartServicesForTests(location);
let assertions = 0;

function check(fn) {
  fn();
  assertions += 1;
}

function expectStockError(fn, code) {
  assert.throws(fn, (error) => error instanceof errors.StockDomainError && error.code === code);
  assertions += 1;
}

function context(financial, key = randomUUID()) {
  return {
    operatorId: null,
    operatorName: "Auditor de laboratório",
    canViewFinancialData: financial,
    idempotencyKey: key,
  };
}

function rawDb() {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  return database;
}

function count(table, field, value) {
  const allowlist = {
    TechnicalPart: "id",
    TechnicalPartMovement: "technicalPartId",
    TechnicalPartCommandLog: "technicalPartId",
  };
  assert.equal(allowlist[table], field);
  const database = rawDb();
  const total = Number(database.prepare(
    `SELECT count(*) AS total FROM "${table}" WHERE "${field}" = ?`,
  ).get(value).total);
  database.close();
  return total;
}

try {
  fs.copyFileSync(path.join(projectRoot, "data", "nio-os.db"), databasePath);
  applyMigrations(databasePath, { logger: () => undefined });

  const unlimitedKey = randomUUID();
  const unlimitedInput = { name: "Ilimitada idempotente", unlimitedStock: true };
  const unlimited = services.createTechnicalPart(unlimitedInput, context(false, unlimitedKey));
  const unlimitedReplay = services.createTechnicalPart(unlimitedInput, context(false, unlimitedKey));
  check(() => assert.equal(unlimitedReplay.idempotentReplay, true));
  check(() => assert.equal(unlimitedReplay.part.id, unlimited.part.id));
  check(() => assert.equal(count("TechnicalPart", "id", unlimited.part.id), 1));
  check(() => assert.equal(count("TechnicalPartCommandLog", "technicalPartId", unlimited.part.id), 1));
  check(() => assert.equal(count("TechnicalPartMovement", "technicalPartId", unlimited.part.id), 0));

  const zeroKey = randomUUID();
  const zeroInput = { name: "Zero idempotente", unlimitedStock: false, initialQuantity: 0 };
  const zero = services.createTechnicalPart(zeroInput, context(false, zeroKey));
  const zeroReplay = services.createTechnicalPart(zeroInput, context(false, zeroKey));
  check(() => assert.equal(zeroReplay.idempotentReplay, true));
  check(() => assert.equal(count("TechnicalPart", "id", zero.part.id), 1));
  check(() => assert.equal(count("TechnicalPartCommandLog", "technicalPartId", zero.part.id), 1));
  check(() => assert.equal(count("TechnicalPartMovement", "technicalPartId", zero.part.id), 0));

  const positiveKey = randomUUID();
  const positiveInput = {
    name: "Positiva auditada",
    unlimitedStock: false,
    initialQuantity: 2,
    currentCostPrice: 12.5,
  };
  const positive = services.createTechnicalPart(positiveInput, context(true, positiveKey));
  const positiveReplay = services.createTechnicalPart(positiveInput, context(true, positiveKey));
  check(() => assert.equal(positiveReplay.idempotentReplay, true));
  check(() => assert.equal(count("TechnicalPart", "id", positive.part.id), 1));
  check(() => assert.equal(count("TechnicalPartMovement", "technicalPartId", positive.part.id), 1));
  check(() => assert.equal(count("TechnicalPartCommandLog", "technicalPartId", positive.part.id), 1));

  const updateKey = randomUUID();
  const updateInput = { name: "Positiva atualizada", version: positive.part.version };
  const updated = services.updateTechnicalPartMetadata(
    positive.part.id,
    updateInput,
    context(false, updateKey),
  );
  const updateReplay = services.updateTechnicalPartMetadata(
    positive.part.id,
    updateInput,
    context(false, updateKey),
  );
  check(() => assert.equal(updated.part.version, 1));
  check(() => assert.equal(updateReplay.idempotentReplay, true));
  check(() => assert.equal(updateReplay.part.version, 1));
  check(() => assert.equal(count("TechnicalPartCommandLog", "technicalPartId", positive.part.id), 2));

  const deactivateKey = randomUUID();
  const deactivateInput = { version: updated.part.version, reason: "Inativação auditada" };
  const inactive = services.deactivateTechnicalPart(
    positive.part.id,
    deactivateInput,
    context(false, deactivateKey),
  );
  const inactiveReplay = services.deactivateTechnicalPart(
    positive.part.id,
    deactivateInput,
    context(false, deactivateKey),
  );
  check(() => assert.equal(inactiveReplay.idempotentReplay, true));
  expectStockError(
    () => services.deactivateTechnicalPart(
      positive.part.id,
      { ...deactivateInput, reason: "Motivo diferente" },
      context(false, deactivateKey),
    ),
    "IDEMPOTENCY_KEY_REUSED",
  );
  const reactivateKey = randomUUID();
  const reactivateInput = { version: inactive.part.version, reason: "Reativação auditada" };
  const active = services.reactivateTechnicalPart(
    positive.part.id,
    reactivateInput,
    context(false, reactivateKey),
  );
  const activeReplay = services.reactivateTechnicalPart(
    positive.part.id,
    reactivateInput,
    context(false, reactivateKey),
  );
  check(() => assert.equal(activeReplay.idempotentReplay, true));
  const auditDb = rawDb();
  const reasons = auditDb.prepare(`SELECT "operation", "reason", "resultVersion"
    FROM "TechnicalPartCommandLog" WHERE "technicalPartId" = ? ORDER BY "createdAt", "rowid"`)
    .all(positive.part.id);
  check(() => assert.equal(reasons.find((row) => row.operation === "DEACTIVATE").reason, "Inativação auditada"));
  check(() => assert.equal(reasons.find((row) => row.operation === "REACTIVATE").reason, "Reativação auditada"));
  check(() => assert.equal(reasons.some((row) => "currentCostPrice" in row), false));
  auditDb.close();

  const hiddenEntry = services.registerTechnicalPartEntry(
    positive.part.id,
    { quantity: 1, reason: "Entrada sem novo custo", version: active.part.version },
    context(false),
  );
  check(() => assert.equal("currentCostPrice" in hiddenEntry.part, false));
  check(() => assert.equal("unitCostSnapshot" in hiddenEntry.movement, false));
  const costDb = rawDb();
  check(() => assert.equal(Number(costDb.prepare(
    "SELECT unitCostSnapshot FROM TechnicalPartMovement WHERE id = ?",
  ).get(hiddenEntry.movement.id).unitCostSnapshot), 12.5));
  costDb.close();

  const authorizedEntry = services.registerTechnicalPartEntry(
    positive.part.id,
    { quantity: 1, reason: "Entrada com custo", unitCost: 15.75, version: hiddenEntry.part.version },
    context(true),
  );
  check(() => assert.equal(authorizedEntry.part.currentCostPrice, 15.75));
  check(() => assert.equal(authorizedEntry.movement.unitCostSnapshot, 15.75));
  expectStockError(
    () => services.registerNegativeAdjustment(
      positive.part.id,
      { quantity: 1, reason: "Custo proibido no negativo", unitCost: 1, version: authorizedEntry.part.version },
      context(true),
    ),
    "VALIDATION_ERROR",
  );
  const negative = services.registerNegativeAdjustment(
    positive.part.id,
    { quantity: 1, reason: "Ajuste negativo", version: authorizedEntry.part.version },
    context(true),
  );
  check(() => assert.equal(negative.movement.unitCostSnapshot, 15.75));

  const conflictKey = randomUUID();
  const conflictInput = { quantity: 1, reason: "Idempotência precisa", version: negative.part.version };
  services.registerPositiveAdjustment(positive.part.id, conflictInput, context(false, conflictKey));
  expectStockError(
    () => services.registerPositiveAdjustment(
      positive.part.id,
      { ...conflictInput, quantity: 2 },
      context(false, conflictKey),
    ),
    "IDEMPOTENCY_KEY_REUSED",
  );
  const duplicateSku = services.createTechnicalPart(
    { name: "SKU original", sku: "NoCase-321", unlimitedStock: false, initialQuantity: 0 },
    context(false),
  );
  expectStockError(
    () => services.createTechnicalPart(
      { name: "SKU cópia", sku: "nocase-321", unlimitedStock: false, initialQuantity: 0 },
      context(false),
    ),
    "TECHNICAL_PART_SKU_EXISTS",
  );
  check(() => assert.equal(Boolean(duplicateSku.part.id), true));

  const readResult = dbCore.__withStockDatabaseForTests(location, (database) =>
    Number(database.prepare("SELECT count(*) AS total FROM TechnicalPart").get().total));
  check(() => assert.equal(readResult > 0, true));
  expectStockError(
    () => dbCore.__withStockDatabaseForTests(location, (database) =>
      database.prepare("INSERT INTO TechnicalPart (id,name,quantityReserved,minStock,currentCostPrice,defaultSalePrice,isActive,version,updatedAt) VALUES (?,?,0,0,0,0,1,0,CURRENT_TIMESTAMP)").run("read-only-write", "Bloqueada")),
    "INTERNAL_ERROR",
  );
  check(() => assert.equal(count("TechnicalPart", "id", "read-only-write"), 0));

  expectStockError(() => validation.requirePositiveInteger(Number.MAX_SAFE_INTEGER + 1, "q"), "VALIDATION_ERROR");
  expectStockError(() => validation.requirePositiveInteger(1_000_000_001, "q"), "VALIDATION_ERROR");
  expectStockError(() => validation.requireVersion(2_147_483_648), "VALIDATION_ERROR");
  expectStockError(() => validation.requireFiniteMoney(1_000_000_000, "money"), "VALIDATION_ERROR");
  expectStockError(() => validation.requirePage(100_001), "VALIDATION_ERROR");
  expectStockError(() => services.listTechnicalParts({ page: 100_001 }), "VALIDATION_ERROR");

  expectStockError(() => validation.assertTechnicalMovementInvariant({
    type: "ENTRY", quantity: 1, onHandBefore: null, onHandAfter: null,
    reservedBefore: 0, reservedAfter: 0,
  }), "STOCK_INVARIANT_VIOLATION");
  expectStockError(() => validation.assertTechnicalMovementInvariant({
    type: "STOCK_MODE_CHANGE", quantity: 2, onHandBefore: null, onHandAfter: 3,
    reservedBefore: 0, reservedAfter: 0,
  }), "STOCK_INVARIANT_VIOLATION");

  process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
} finally {
  Module._extensions[".ts"] = originalLoader;
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
