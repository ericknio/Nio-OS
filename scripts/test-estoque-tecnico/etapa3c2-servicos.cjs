#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");
const { applyMigrations } = require("../schema-migrator/core.cjs");

function installTypeScriptLoader() {
  const original = Module._extensions[".ts"];
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
  return () => { Module._extensions[".ts"] = original; };
}

function loadCore() {
  const restore = installTypeScriptLoader();
  const serviceModule = require("../../lib/estoqueTecnico/partService.ts");
  const errors = require("../../lib/estoqueTecnico/errors.ts");
  return { serviceModule, errors, restore };
}

function context(canViewFinancialData, idempotencyKey = randomUUID()) {
  return {
    operatorId: null,
    operatorName: "Operador de laboratório",
    canViewFinancialData,
    idempotencyKey,
  };
}

if (!isMainThread && workerData?.etapa3c2Worker === true) {
  const { serviceModule, restore } = loadCore();
  try {
    const services = serviceModule.__createTechnicalPartServicesForTests(workerData.location);
    const result = workerData.action === "entry"
      ? services.registerTechnicalPartEntry(
        workerData.partId,
        { quantity: 1, reason: "Concorrência entrada", version: workerData.version },
        context(false),
      )
      : services.registerNegativeAdjustment(
        workerData.partId,
        { quantity: 1, reason: "Concorrência saída", version: workerData.version },
        context(false),
      );
    parentPort.postMessage({ ok: true, version: result.part.version });
  } catch (error) {
    parentPort.postMessage({ ok: false, code: error?.code || "INTERNAL_ERROR" });
  } finally {
    restore();
  }
} else {
  void runMain();
}

async function runMain() {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const sourceDatabase = path.join(projectRoot, "data", "nio-os.db");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-etapa3c2-"));
  const databasePath = path.join(temporaryRoot, "laboratorio.db");
  const location = { runtimeRoot: temporaryRoot, databasePath };
  const { serviceModule, errors, restore } = loadCore();
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

  function create(input, financial = true, key = randomUUID()) {
    return services.createTechnicalPart(input, context(financial, key));
  }

  function rawDb() {
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    return database;
  }

  function movementCount(partId, type) {
    const database = rawDb();
    const total = Number(database.prepare(
      "SELECT count(*) AS total FROM TechnicalPartMovement WHERE technicalPartId = ? AND type = ?",
    ).get(partId, type).total);
    database.close();
    return total;
  }

  async function concurrent(action, partId, version) {
    const workerInput = { etapa3c2Worker: true, location, action, partId, version };
    const run = () => new Promise((resolve, reject) => {
      const worker = new Worker(__filename, { workerData: workerInput });
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    return Promise.all([run(), run()]);
  }

  try {
    fs.copyFileSync(sourceDatabase, databasePath);
    applyMigrations(databasePath, { logger: () => undefined });

    const unlimited = create({
      name: "Peça ilimitada", unlimitedStock: true, minStock: 0, defaultSalePrice: 10,
    }, false);
    check(() => assert.equal(unlimited.part.quantityOnHand, null));
    check(() => assert.equal(unlimited.part.isUnlimited, true));
    check(() => assert.equal(movementCount(unlimited.part.id, "ENTRY"), 0));

    const zero = create({ name: "Peça zero", unlimitedStock: false, initialQuantity: 0 }, false);
    check(() => assert.equal(zero.part.quantityOnHand, 0));
    check(() => assert.equal(zero.part.isUnlimited, false));
    check(() => assert.equal(movementCount(zero.part.id, "ENTRY"), 0));

    const positiveKey = randomUUID();
    const positive = create({
      name: "Peça positiva", sku: "PoS-1", unlimitedStock: false,
      initialQuantity: 5, currentCostPrice: 3.25, defaultSalePrice: 8,
    }, true, positiveKey);
    check(() => assert.equal(positive.part.quantityOnHand, 5));
    check(() => assert.equal(positive.movement.type, "ENTRY"));
    check(() => assert.equal(positive.movement.onHandBefore, 0));
    check(() => assert.equal(positive.movement.onHandAfter, 5));
    const createReplay = create({
      name: "Peça positiva", sku: "PoS-1", unlimitedStock: false,
      initialQuantity: 5, currentCostPrice: 3.25, defaultSalePrice: 8,
    }, true, positiveKey);
    check(() => assert.equal(createReplay.idempotentReplay, true));
    check(() => assert.equal(createReplay.part.id, positive.part.id));
    expectStockError(
      () => create({ name: "Contraditória", unlimitedStock: true, initialQuantity: 0 }, false),
      "VALIDATION_ERROR",
    );
    expectStockError(
      () => create({ name: "Custo proibido", unlimitedStock: false, initialQuantity: 0, currentCostPrice: 1 }, false),
      "FINANCIAL_FIELD_FORBIDDEN",
    );
    expectStockError(
      () => create({ name: "SKU repetido", sku: "pos-1", unlimitedStock: false, initialQuantity: 0 }, false),
      "TECHNICAL_PART_SKU_EXISTS",
    );

    const historicalMovementId = positive.movement.id;
    const updated = services.updateTechnicalPartMetadata(
      positive.part.id,
      { name: "Peça positiva editada", category: "Placas", version: positive.part.version },
      context(false),
    );
    check(() => assert.equal(updated.part.name, "Peça positiva editada"));
    check(() => assert.equal(updated.part.quantityOnHand, 5));
    expectStockError(
      () => services.updateTechnicalPartMetadata(
        positive.part.id,
        { quantityOnHand: 99, version: updated.part.version },
        context(false),
      ),
      "VALIDATION_ERROR",
    );
    expectStockError(
      () => services.updateTechnicalPartMetadata(
        positive.part.id,
        { name: "Versão antiga", version: positive.part.version },
        context(false),
      ),
      "VERSION_CONFLICT",
    );
    expectStockError(
      () => services.updateTechnicalPartMetadata(
        positive.part.id,
        { currentCostPrice: 12, version: updated.part.version },
        context(false),
      ),
      "FINANCIAL_FIELD_FORBIDDEN",
    );
    const historyDb = rawDb();
    check(() => assert.equal(
      historyDb.prepare("SELECT reason FROM TechnicalPartMovement WHERE id = ?").get(historicalMovementId).reason,
      "Saldo inicial do cadastro",
    ));
    historyDb.close();

    const inactive = services.deactivateTechnicalPart(
      zero.part.id,
      { version: zero.part.version, reason: "Fora de catálogo" },
      context(false),
    );
    check(() => assert.equal(inactive.part.isActive, false));
    check(() => assert.equal(services.getTechnicalPartById(zero.part.id).id, zero.part.id));
    const reactivated = services.reactivateTechnicalPart(
      zero.part.id,
      { version: inactive.part.version, reason: "Retorno ao catálogo" },
      context(false),
    );
    check(() => assert.equal(reactivated.part.isActive, true));
    expectStockError(
      () => services.deactivateTechnicalPart(
        zero.part.id,
        { version: inactive.part.version, reason: "Versão concorrente" },
        context(false),
      ),
      "VERSION_CONFLICT",
    );
    const reserved = create({ name: "Peça reservada", unlimitedStock: false, initialQuantity: 3 }, false);
    const reserveDb = rawDb();
    reserveDb.prepare("UPDATE TechnicalPart SET quantityReserved = 1 WHERE id = ?").run(reserved.part.id);
    reserveDb.close();
    expectStockError(
      () => services.deactivateTechnicalPart(
        reserved.part.id,
        { version: reserved.part.version, reason: "Não pode" },
        context(false),
      ),
      "TECHNICAL_PART_HAS_RESERVATIONS",
    );

    const entryPart = create({ name: "Entradas", unlimitedStock: false, initialQuantity: 1 }, true);
    const entryKey = randomUUID();
    const entry = services.registerTechnicalPartEntry(
      entryPart.part.id,
      { quantity: 4, reason: "Compra de fornecedor", unitCost: 7.5, version: entryPart.part.version },
      context(true, entryKey),
    );
    check(() => assert.equal(entry.part.quantityOnHand, 5));
    check(() => assert.equal(entry.part.currentCostPrice, 7.5));
    check(() => assert.equal(entry.movement.type, "ENTRY"));
    const entryReplay = services.registerTechnicalPartEntry(
      entryPart.part.id,
      { quantity: 4, reason: "Compra de fornecedor", unitCost: 7.5, version: entryPart.part.version },
      context(true, entryKey),
    );
    check(() => assert.equal(entryReplay.idempotentReplay, true));
    check(() => assert.equal(movementCount(entryPart.part.id, "ENTRY"), 2));
    expectStockError(
      () => services.registerTechnicalPartEntry(
        entryPart.part.id,
        { quantity: 5, reason: "Payload diferente", unitCost: 7.5, version: entryPart.part.version },
        context(true, entryKey),
      ),
      "IDEMPOTENCY_KEY_REUSED",
    );
    expectStockError(
      () => services.registerTechnicalPartEntry(
        unlimited.part.id,
        { quantity: 1, reason: "Inválida", version: unlimited.part.version },
        context(false),
      ),
      "UNLIMITED_STOCK_REJECTS_MOVEMENT",
    );

    const adjusted = services.registerPositiveAdjustment(
      entryPart.part.id,
      { quantity: 2, reason: "Contagem maior", version: entry.part.version },
      context(false),
    );
    check(() => assert.equal(adjusted.part.quantityOnHand, 7));
    check(() => assert.equal(adjusted.movement.type, "POSITIVE_ADJUSTMENT"));
    const adjustedDb = rawDb();
    adjustedDb.prepare("UPDATE TechnicalPart SET quantityReserved = 3 WHERE id = ?").run(entryPart.part.id);
    adjustedDb.close();
    const negative = services.registerNegativeAdjustment(
      entryPart.part.id,
      { quantity: 4, reason: "Contagem menor", version: adjusted.part.version },
      context(true),
    );
    check(() => assert.equal(negative.part.quantityOnHand, 3));
    check(() => assert.equal(negative.part.quantityReserved, 3));
    expectStockError(
      () => services.registerNegativeAdjustment(
        entryPart.part.id,
        { quantity: 1, reason: "Sem disponível", version: negative.part.version },
        context(false),
      ),
      "INSUFFICIENT_AVAILABLE_STOCK",
    );
    check(() => assert.equal(services.getTechnicalPartById(entryPart.part.id).quantityOnHand, 3));

    const toControlledZero = services.changeTechnicalPartToControlled(
      unlimited.part.id,
      { initialQuantity: 0, confirmation: true, reason: "Controle físico", version: unlimited.part.version },
      context(false),
    );
    check(() => assert.equal(toControlledZero.part.quantityOnHand, 0));
    check(() => assert.equal(toControlledZero.movement.quantity, 0));
    const unlimitedPositive = create({ name: "Conversão positiva", unlimitedStock: true }, false);
    const toControlledPositive = services.changeTechnicalPartToControlled(
      unlimitedPositive.part.id,
      { initialQuantity: 6, confirmation: true, reason: "Inventário", version: unlimitedPositive.part.version },
      context(false),
    );
    check(() => assert.equal(toControlledPositive.part.quantityOnHand, 6));
    check(() => assert.equal(toControlledPositive.movement.onHandBefore, null));
    const unlimitedReserved = create({ name: "Ilimitada reservada", unlimitedStock: true }, false);
    const unlimitedReservedDb = rawDb();
    unlimitedReservedDb.prepare("UPDATE TechnicalPart SET quantityReserved = 2 WHERE id = ?").run(unlimitedReserved.part.id);
    unlimitedReservedDb.close();
    expectStockError(
      () => services.changeTechnicalPartToControlled(
        unlimitedReserved.part.id,
        { initialQuantity: 1, confirmation: true, reason: "Menor que reserva", version: unlimitedReserved.part.version },
        context(false),
      ),
      "INSUFFICIENT_AVAILABLE_STOCK",
    );
    expectStockError(
      () => services.changeTechnicalPartToUnlimited(
        reserved.part.id,
        { confirmation: true, reason: "Reserva impede", version: reserved.part.version },
        context(false),
      ),
      "TECHNICAL_PART_HAS_RESERVATIONS",
    );
    const toUnlimited = services.changeTechnicalPartToUnlimited(
      toControlledPositive.part.id,
      { confirmation: true, reason: "Sem controle", version: toControlledPositive.part.version },
      context(false),
    );
    check(() => assert.equal(toUnlimited.part.quantityOnHand, null));
    check(() => assert.equal(toUnlimited.movement.onHandBefore, 6));
    check(() => assert.equal(toUnlimited.movement.onHandAfter, null));

    const concurrentEntryPart = create({ name: "Concorrência entrada", unlimitedStock: false, initialQuantity: 0 }, false);
    const entryRace = await concurrent("entry", concurrentEntryPart.part.id, concurrentEntryPart.part.version);
    check(() => assert.equal(entryRace.filter((result) => result.ok).length, 1));
    check(() => assert.equal(entryRace.filter((result) => result.code === "VERSION_CONFLICT").length, 1));
    check(() => assert.equal(services.getTechnicalPartById(concurrentEntryPart.part.id).quantityOnHand, 1));
    check(() => assert.equal(movementCount(concurrentEntryPart.part.id, "ENTRY"), 1));

    const concurrentNegativePart = create({ name: "Concorrência negativa", unlimitedStock: false, initialQuantity: 1 }, false);
    const negativeRace = await concurrent("negative", concurrentNegativePart.part.id, concurrentNegativePart.part.version);
    check(() => assert.equal(negativeRace.filter((result) => result.ok).length, 1));
    check(() => assert.equal(negativeRace.filter((result) => result.code === "VERSION_CONFLICT").length, 1));
    check(() => assert.equal(services.getTechnicalPartById(concurrentNegativePart.part.id).quantityOnHand, 0));
    check(() => assert.equal(movementCount(concurrentNegativePart.part.id, "NEGATIVE_ADJUSTMENT"), 1));

    const hidden = services.getTechnicalPartById(entryPart.part.id, { canViewFinancialData: false });
    check(() => assert.equal("currentCostPrice" in hidden, false));
    const visible = services.getTechnicalPartById(entryPart.part.id, { canViewFinancialData: true });
    check(() => assert.equal(visible.currentCostPrice, 7.5));
    const hiddenList = services.listTechnicalParts({}, { canViewFinancialData: false });
    check(() => assert.equal(hiddenList.items.every((item) => !("currentCostPrice" in item)), true));
    const controlledList = services.listTechnicalParts({ unlimited: false, pageSize: 100 });
    check(() => assert.equal(controlledList.items.every((item) => item.isUnlimited === false), true));

    const maliciousName = "Peça'); DROP TABLE TechnicalPart; --";
    const maliciousSku = "SKU%'--";
    const maliciousPart = create({
      name: maliciousName, sku: maliciousSku, unlimitedStock: false, initialQuantity: 1,
    }, false);
    const maliciousMovement = services.registerPositiveAdjustment(
      maliciousPart.part.id,
      { quantity: 1, reason: "Motivo'); DELETE FROM TechnicalPartMovement; --", version: maliciousPart.part.version },
      context(false),
    );
    check(() => assert.equal(maliciousMovement.part.name, maliciousName));
    check(() => assert.equal(services.listTechnicalParts({ q: "%' OR 1=1 --" }).items.length, 0));
    const injectionDb = rawDb();
    check(() => assert.equal(Number(injectionDb.prepare(
      "SELECT count(*) AS total FROM sqlite_master WHERE type = ? AND name = ?",
    ).get("table", "TechnicalPart").total), 1));
    check(() => assert.equal(Number(injectionDb.prepare(
      "SELECT count(*) AS total FROM TechnicalPartMovement WHERE technicalPartId = ?",
    ).get(maliciousPart.part.id).total), 2));
    injectionDb.close();

    process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
  } finally {
    restore();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

