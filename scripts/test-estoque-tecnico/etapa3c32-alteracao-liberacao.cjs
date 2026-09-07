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

function installLoader() {
  const original = Module._extensions[".ts"];
  Module._extensions[".ts"] = function load(module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    }).outputText.replace(/import\.meta\.url/g, "__filename");
    module._compile(output, filename);
  };
  return () => { Module._extensions[".ts"] = original; };
}

function loadModules() {
  const restore = installLoader();
  return {
    restore,
    mutation: require("../../lib/estoqueTecnico/orderPartMutationService.ts"),
    reservation: require("../../lib/estoqueTecnico/orderPartService.ts"),
    errors: require("../../lib/estoqueTecnico/errors.ts"),
  };
}

function context(key = randomUUID(), operatorId = null, financial = false) {
  return { operatorId, operatorName: operatorId ? "Operador" : "Sistema", canViewFinancialData: financial, idempotencyKey: key };
}

if (!isMainThread && workerData?.worker) {
  const loaded = loadModules();
  try {
    const service = loaded.mutation.__createOrderPartMutationServicesForTests(workerData.location);
    const result = workerData.operation === "release"
      ? service.releaseTechnicalPartFromOrder(workerData.itemId, {
        technicalPartVersion: workerData.version,
        expectedQuantity: workerData.expected,
        reason: "Concorrência",
      }, context())
      : service.changeReservedTechnicalPartQuantity(workerData.itemId, {
        technicalPartVersion: workerData.version,
        expectedQuantity: workerData.expected,
        newQuantity: workerData.newQuantity,
        reason: "Concorrência",
      }, context());
    parentPort.postMessage({ ok: true, replay: result.idempotentReplay });
  } catch (error) {
    parentPort.postMessage({ ok: false, code: error?.code || "INTERNAL_ERROR" });
  } finally {
    loaded.restore();
  }
} else {
  void main();
}

async function main() {
  const root = path.resolve(__dirname, "..", "..");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-etapa3c32-"));
  const databasePath = path.join(temporaryRoot, "laboratorio.db");
  const location = { runtimeRoot: temporaryRoot, databasePath };
  const loaded = loadModules();
  const mutations = loaded.mutation.__createOrderPartMutationServicesForTests(location);
  const reservations = loaded.reservation.__createOrderPartServicesForTests(location);
  let assertions = 0;
  let osNumber = 900000;

  const check = (fn) => { fn(); assertions += 1; };
  const expectCode = (fn, code) => {
    assert.throws(fn, (error) => error instanceof loaded.errors.StockDomainError && error.code === code);
    assertions += 1;
  };
  function db() {
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    return database;
  }
  function scalar(sql, ...params) {
    const database = db();
    const row = database.prepare(sql).get(...params);
    database.close();
    return row;
  }
  function createOrder(input = {}) {
    const id = input.id || randomUUID();
    const database = db();
    database.prepare(`INSERT INTO "ServiceOrder" (
      "id", "osNumber", "customerId", "equipmentType", "reportedDefect", "requiredParts",
      "partsCost", "laborCost", "discount", "totalAmount", "paymentMethod", "status",
      "paidAmount", "paymentPercent", "paymentReceivedAt", "finalizedAt", "createdAt", "updatedAt"
    ) VALUES (?, ?, 'etapa3c32-customer', 'OUTRO', 'Teste', ?, ?, ?, 0, ?,
      'AGUARDANDO_PAGAMENTO', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(id, osNumber++, input.requiredParts ?? null, input.partsCost ?? 0,
        input.laborCost ?? 0, input.totalAmount ?? 0, input.status ?? "RECEBIDO",
        input.paidAmount ?? 0, input.paymentPercent ?? 0,
        input.paymentReceivedAt ?? null, input.finalizedAt ?? null);
    database.close();
    return id;
  }
  function createPart(input = {}) {
    const id = input.id || randomUUID();
    const database = db();
    database.prepare(`INSERT INTO "TechnicalPart" (
      "id", "name", "quantityOnHand", "quantityReserved", "minStock", "currentCostPrice",
      "defaultSalePrice", "isActive", "version", "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, 0, 0, ?, 0, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(id, input.name || "Peça teste", input.onHand === undefined ? 20 : input.onHand,
        input.cost ?? 4, input.active === false ? 0 : 1);
    database.close();
    return id;
  }
  function reserve(orderId, partId, quantity = 2, unitPrice = 10) {
    return reservations.reserveTechnicalPartForOrder(orderId, {
      technicalPartId: partId, technicalPartVersion: 0, quantity, unitPrice,
    }, context());
  }
  function change(itemId, version, expected, newQuantity, options = {}) {
    return mutations.changeReservedTechnicalPartQuantity(itemId, {
      technicalPartVersion: version, expectedQuantity: expected, newQuantity,
      reason: options.reason || "Ajuste solicitado",
    }, context(options.key || randomUUID(), options.operatorId ?? null, options.financial ?? false));
  }
  function release(itemId, version, expected, options = {}) {
    return mutations.releaseTechnicalPartFromOrder(itemId, {
      technicalPartVersion: version, expectedQuantity: expected,
      reason: options.reason || "Peça não será utilizada",
    }, context(options.key || randomUUID(), options.operatorId ?? null, options.financial ?? false));
  }
  function worker(operation, itemId, version, expected, newQuantity) {
    return new Promise((resolve, reject) => {
      const instance = new Worker(__filename, { workerData: {
        worker: true, location, operation, itemId, version, expected, newQuantity,
      } });
      instance.once("message", resolve);
      instance.once("error", reject);
    });
  }
  function state(itemId, partId) {
    return scalar(`SELECT i."state", i."quantity", i."unitCostSnapshot", i."unitPriceSnapshot",
      i."totalCostSnapshot", i."totalPriceSnapshot", p."quantityOnHand", p."quantityReserved", p."version"
      FROM "ServiceOrderPart" i JOIN "TechnicalPart" p ON p."id" = ? WHERE i."id" = ?`, partId, itemId);
  }

  try {
    fs.copyFileSync(path.join(root, "data", "nio-os.db"), databasePath);
    applyMigrations(databasePath, { logger: () => undefined });
    let database = db();
    database.prepare(`INSERT INTO "Customer" ("id", "name", "createdAt", "updatedAt")
      VALUES ('etapa3c32-customer', 'Cliente estrutural', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run();
    database.close();

    const increaseOrder = createOrder({ laborCost: 5 });
    const increasePart = createPart({ onHand: 10, cost: 3 });
    const increaseItem = reserve(increaseOrder, increasePart, 2, 7);
    const increased = change(increaseItem.item.id, 1, 2, 4);
    const increasedState = state(increaseItem.item.id, increasePart);
    check(() => assert.deepEqual([Number(increasedState.quantityOnHand), Number(increasedState.quantityReserved), Number(increasedState.quantity)], [10, 4, 4]));
    check(() => assert.equal(increased.movement.type, "RESERVATION_INCREASE"));
    check(() => assert.deepEqual([increased.movement.reservedBefore, increased.movement.reservedAfter], [2, 4]));
    check(() => assert.deepEqual(increased.totals, { partsCost: 28, laborCost: 5, discount: 0, totalAmount: 33 }));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "OrderHistory" WHERE "serviceOrderId" = ? AND "action" = 'PECA_TECNICA_RESERVA_AUMENTADA'`, increaseOrder).n), 1));

    const unlimitedOrder = createOrder();
    const unlimitedPart = createPart({ onHand: null });
    const unlimitedItem = reserve(unlimitedOrder, unlimitedPart, 2);
    change(unlimitedItem.item.id, 1, 2, 100);
    const unlimitedState = state(unlimitedItem.item.id, unlimitedPart);
    check(() => assert.equal(unlimitedState.quantityOnHand, null));
    check(() => assert.equal(Number(unlimitedState.quantityReserved), 100));

    const insufficientOrder = createOrder();
    const insufficientPart = createPart({ onHand: 3 });
    const insufficientItem = reserve(insufficientOrder, insufficientPart, 2);
    expectCode(() => change(insufficientItem.item.id, 1, 2, 4), "INSUFFICIENT_AVAILABLE_STOCK");
    check(() => assert.deepEqual([Number(state(insufficientItem.item.id, insufficientPart).quantity), Number(state(insufficientItem.item.id, insufficientPart).quantityReserved)], [2, 2]));

    const reductionOrder = createOrder();
    const reductionPart = createPart({ onHand: 10, cost: 6 });
    const reductionItem = reserve(reductionOrder, reductionPart, 4, 8);
    const reduced = change(reductionItem.item.id, 1, 4, 2, { financial: true });
    const reducedState = state(reductionItem.item.id, reductionPart);
    check(() => assert.deepEqual([Number(reducedState.quantityOnHand), Number(reducedState.quantityReserved), Number(reducedState.quantity)], [10, 2, 2]));
    check(() => assert.deepEqual([Number(reducedState.unitCostSnapshot), Number(reducedState.unitPriceSnapshot)], [6, 8]));
    check(() => assert.deepEqual([Number(reducedState.totalCostSnapshot), Number(reducedState.totalPriceSnapshot)], [12, 16]));
    check(() => assert.equal(reduced.movement.type, "RESERVATION_DECREASE"));

    expectCode(() => change(reductionItem.item.id, 2, 2, 0), "VALIDATION_ERROR");
    expectCode(() => change(reductionItem.item.id, 2, 2, 2), "VALIDATION_ERROR");
    expectCode(() => change(reductionItem.item.id, 2, 3, 1), "ORDER_PART_QUANTITY_CONFLICT");

    const inactiveOrder = createOrder();
    const inactivePart = createPart();
    const inactiveItem = reserve(inactiveOrder, inactivePart, 4);
    database = db();
    database.prepare(`UPDATE "TechnicalPart" SET "isActive" = 0 WHERE "id" = ?`).run(inactivePart);
    database.close();
    expectCode(() => change(inactiveItem.item.id, 1, 4, 5), "TECHNICAL_PART_INACTIVE");
    change(inactiveItem.item.id, 1, 4, 2);
    const inactiveReleased = release(inactiveItem.item.id, 2, 2);
    check(() => assert.equal(inactiveReleased.item.state, "RELEASED"));

    const releaseOrder = createOrder({ requiredParts: "Texto legado", partsCost: 0 });
    const releasePart = createPart({ onHand: 8 });
    const releaseItem = reserve(releaseOrder, releasePart, 3, 9);
    const released = release(releaseItem.item.id, 1, 3, { financial: true });
    const releaseState = state(releaseItem.item.id, releasePart);
    check(() => assert.deepEqual([releaseState.state, Number(releaseState.quantityOnHand), Number(releaseState.quantityReserved)], ["RELEASED", 8, 0]));
    check(() => assert.equal(released.movement.type, "RELEASE"));
    check(() => assert.equal(released.totals.partsCost, 0));
    check(() => assert.equal(scalar(`SELECT "requiredParts" FROM "ServiceOrder" WHERE "id" = ?`, releaseOrder).requiredParts, "Texto legado"));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "OrderHistory" WHERE "serviceOrderId" = ? AND "action" = 'PECA_TECNICA_LIBERADA'`, releaseOrder).n), 1));
    expectCode(() => release(releaseItem.item.id, 2, 3), "SERVICE_ORDER_PART_NOT_RESERVED");

    for (const status of ["PRONTO", "ENTREGUE", "CANCELADO"]) {
      const orderId = createOrder({ status }); const partId = createPart(); const item = reserve(createOrder(), partId, 1);
      database = db(); database.prepare(`UPDATE "ServiceOrderPart" SET "serviceOrderId" = ? WHERE "id" = ?`).run(orderId, item.item.id); database.close();
      expectCode(() => release(item.item.id, 1, 1), "ORDER_NOT_MUTABLE");
    }
    for (const indicator of [{ paidAmount: 1 }, { paymentPercent: 1 }, { paymentReceivedAt: new Date().toISOString() }]) {
      const baseOrder = createOrder(); const partId = createPart(); const item = reserve(baseOrder, partId, 1);
      database = db();
      if (indicator.paidAmount) database.prepare(`UPDATE "ServiceOrder" SET "paidAmount" = 1 WHERE "id" = ?`).run(baseOrder);
      if (indicator.paymentPercent) database.prepare(`UPDATE "ServiceOrder" SET "paymentPercent" = 1 WHERE "id" = ?`).run(baseOrder);
      if (indicator.paymentReceivedAt) database.prepare(`UPDATE "ServiceOrder" SET "paymentReceivedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`).run(baseOrder);
      database.close();
      expectCode(() => release(item.item.id, 1, 1), "ORDER_HAS_PAYMENTS");
    }
    const finalizedOrder = createOrder(); const finalizedPart = createPart(); const finalizedItem = reserve(finalizedOrder, finalizedPart, 1);
    database = db(); database.prepare(`UPDATE "ServiceOrder" SET "finalizedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`).run(finalizedOrder); database.close();
    expectCode(() => release(finalizedItem.item.id, 1, 1), "ORDER_NOT_MUTABLE");
    const paymentOrder = createOrder(); const paymentPart = createPart(); const paymentItem = reserve(paymentOrder, paymentPart, 1);
    database = db(); database.prepare(`INSERT INTO "ServiceOrderPayment" (
      "id", "serviceOrderId", "amount", "percent", "paymentMethod", "userName", "createdAt"
    ) VALUES (?, ?, 1, 1, 'PIX', 'Sistema', CURRENT_TIMESTAMP)`).run(randomUUID(), paymentOrder); database.close();
    expectCode(() => release(paymentItem.item.id, 1, 1), "ORDER_HAS_PAYMENTS");

    const replayOrder = createOrder(); const replayPart = createPart(); const replayItem = reserve(replayOrder, replayPart, 2);
    const replayKey = randomUUID(); const firstChange = change(replayItem.item.id, 1, 2, 4, { key: replayKey });
    const changeReplay = change(replayItem.item.id, 1, 2, 4, { key: replayKey });
    check(() => assert.equal(changeReplay.idempotentReplay, true));
    change(replayItem.item.id, 2, 4, 3);
    check(() => assert.equal(change(replayItem.item.id, 1, 2, 4, { key: replayKey }).idempotentReplay, true));
    expectCode(() => change(replayItem.item.id, 1, 2, 5, { key: replayKey }), "IDEMPOTENCY_KEY_REUSED");
    check(() => assert.equal(firstChange.item.id, changeReplay.item.id));
    const reductionReplayOrder = createOrder(); const reductionReplayPart = createPart(); const reductionReplayItem = reserve(reductionReplayOrder, reductionReplayPart, 4);
    const reductionReplayKey = randomUUID();
    change(reductionReplayItem.item.id, 1, 4, 2, { key: reductionReplayKey });
    check(() => assert.equal(change(reductionReplayItem.item.id, 1, 4, 2, { key: reductionReplayKey }).idempotentReplay, true));

    const releaseReplayKey = randomUUID(); const releaseReplay = release(replayItem.item.id, 3, 3, { key: releaseReplayKey });
    check(() => assert.equal(release(replayItem.item.id, 3, 3, { key: releaseReplayKey }).idempotentReplay, true));
    check(() => assert.equal(releaseReplay.item.state, "RELEASED"));
    expectCode(() => release(replayItem.item.id, 3, 2, { key: releaseReplayKey }), "IDEMPOTENCY_KEY_REUSED");

    database = db();
    for (const id of ["etapa3c32-user-a", "etapa3c32-user-b"]) {
      database.prepare(`INSERT INTO "SystemUser" (
        "id", "name", "username", "passwordHash", "role", "status", "createdAt", "updatedAt"
      ) VALUES (?, 'Operador', ?, 'hash', 'TECNICO', 'ATIVO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(id, id);
    }
    database.close();
    const scopedOrder = createOrder(); const scopedPart = createPart(); const scopedItem = reserve(scopedOrder, scopedPart, 2);
    const scopedKey = randomUUID();
    change(scopedItem.item.id, 1, 2, 3, { key: scopedKey, operatorId: "etapa3c32-user-a" });
    expectCode(() => change(scopedItem.item.id, 1, 2, 3, { key: scopedKey, operatorId: "etapa3c32-user-b" }), "ORDER_PART_QUANTITY_CONFLICT");

    const raceIncreaseOrder = createOrder(); const raceIncreasePart = createPart({ onHand: 5 }); const raceIncreaseItem = reserve(raceIncreaseOrder, raceIncreasePart, 1);
    let raceResults = await Promise.all([worker("change", raceIncreaseItem.item.id, 1, 1, 5), worker("change", raceIncreaseItem.item.id, 1, 1, 5)]);
    check(() => assert.equal(raceResults.filter((r) => r.ok).length, 1));
    check(() => assert.equal(Number(state(raceIncreaseItem.item.id, raceIncreasePart).quantityReserved), 5));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ? AND "type" = 'RESERVATION_INCREASE'`, raceIncreaseItem.item.id).n), 1));

    const raceReductionOrder = createOrder(); const raceReductionPart = createPart(); const raceReductionItem = reserve(raceReductionOrder, raceReductionPart, 4);
    raceResults = await Promise.all([worker("change", raceReductionItem.item.id, 1, 4, 2), worker("change", raceReductionItem.item.id, 1, 4, 2)]);
    check(() => assert.equal(raceResults.filter((r) => r.ok).length, 1));
    check(() => assert.equal(Number(state(raceReductionItem.item.id, raceReductionPart).quantityReserved), 2));

    const mixedOrder = createOrder(); const mixedPart = createPart(); const mixedItem = reserve(mixedOrder, mixedPart, 2);
    raceResults = await Promise.all([worker("change", mixedItem.item.id, 1, 2, 3), worker("release", mixedItem.item.id, 1, 2)]);
    check(() => assert.equal(raceResults.filter((r) => r.ok).length, 1));
    const mixedState = state(mixedItem.item.id, mixedPart);
    check(() => assert.ok(Number(mixedState.quantityReserved) >= 0 && Number(mixedState.quantityReserved) <= Number(mixedState.quantityOnHand)));

    const doubleReleaseOrder = createOrder(); const doubleReleasePart = createPart(); const doubleReleaseItem = reserve(doubleReleaseOrder, doubleReleasePart, 2);
    raceResults = await Promise.all([worker("release", doubleReleaseItem.item.id, 1, 2), worker("release", doubleReleaseItem.item.id, 1, 2)]);
    check(() => assert.equal(raceResults.filter((r) => r.ok).length, 1));
    check(() => assert.equal(Number(state(doubleReleaseItem.item.id, doubleReleasePart).quantityReserved), 0));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ? AND "type" = 'RELEASE'`, doubleReleaseItem.item.id).n), 1));

    for (const failAfter of ["after_part", "after_item", "after_movement"]) {
      const orderId = createOrder(); const partId = createPart(); const item = reserve(orderId, partId, 2);
      const failing = loaded.mutation.__createOrderPartMutationServicesForTests(location, { failAfter });
      expectCode(() => failing.changeReservedTechnicalPartQuantity(item.item.id, {
        technicalPartVersion: 1, expectedQuantity: 2, newQuantity: 3, reason: "Falha",
      }, context()), "INTERNAL_ERROR");
      check(() => assert.deepEqual([Number(state(item.item.id, partId).quantity), Number(state(item.item.id, partId).quantityReserved)], [2, 2]));
    }
    const recalcOrder = createOrder(); const recalcPart = createPart(); const recalcItem = reserve(recalcOrder, recalcPart, 2);
    database = db(); database.prepare(`UPDATE "ServiceOrder" SET "laborCost" = 1000000000 WHERE "id" = ?`).run(recalcOrder); database.close();
    expectCode(() => change(recalcItem.item.id, 1, 2, 3), "STOCK_INVARIANT_VIOLATION");
    check(() => assert.deepEqual([Number(state(recalcItem.item.id, recalcPart).quantity), Number(state(recalcItem.item.id, recalcPart).quantityReserved)], [2, 2]));

    function assertSafe(value) {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        assert.ok(!["idempotencyKey", "responsibleUserId", "operatorId"].includes(key));
        assertSafe(child);
      }
    }
    check(() => assertSafe(increased));
    check(() => assert.equal("unitCostSnapshot" in increased.item, false));
    check(() => assert.equal("unitCostSnapshot" in reduced.item, true));
    check(() => assert.equal("unitCostSnapshot" in released.movement, true));

    const history = reservations.listTechnicalPartsForOrder(releaseOrder, { states: ["RELEASED"], includeHistory: true });
    check(() => assert.equal(history.movements.some((movement) => movement.type === "RELEASE"), true));
    check(() => assert.equal(reservations.listTechnicalPartsForOrder(releaseOrder, { includeHistory: true }).items.length, 0));

    const maliciousOrder = createOrder(); const maliciousPart = createPart({ name: "Peça'); DROP TABLE OrderHistory; --" }); const maliciousItem = reserve(maliciousOrder, maliciousPart, 2);
    change(maliciousItem.item.id, 1, 2, 1, { reason: "x'); DROP TABLE TechnicalPart; --" });
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM sqlite_master WHERE "type" = 'table' AND "name" = 'TechnicalPart'`).n), 1));

    const publicBarrel = require("../../lib/estoqueTecnico/index.ts");
    check(() => assert.equal(typeof publicBarrel.changeReservedTechnicalPartQuantity, "function"));
    check(() => assert.equal(typeof publicBarrel.releaseTechnicalPartFromOrder, "function"));
    check(() => assert.equal(Object.keys(publicBarrel).some((key) => key.startsWith("__")), false));

    process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
  } finally {
    loaded.restore();
    fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
