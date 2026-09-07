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
  return () => { Module._extensions[".ts"] = original; };
}

function loadService() {
  const restore = installTypeScriptLoader();
  return {
    restore,
    module: require("../../lib/estoqueTecnico/orderPartService.ts"),
    errors: require("../../lib/estoqueTecnico/errors.ts"),
  };
}

function commandContext(key = randomUUID(), operatorId = null, financial = false) {
  return {
    operatorId,
    operatorName: operatorId ? "Operador autenticado" : "Sistema de laboratório",
    canViewFinancialData: financial,
    idempotencyKey: key,
  };
}

if (!isMainThread && workerData?.etapa3c31Worker) {
  const loaded = loadService();
  try {
    const services = loaded.module.__createOrderPartServicesForTests(workerData.location);
    const result = services.reserveTechnicalPartForOrder(
      workerData.orderId,
      {
        technicalPartId: workerData.partId,
        technicalPartVersion: workerData.version,
        quantity: 1,
        unitPrice: 5,
      },
      commandContext(),
    );
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
  const projectRoot = path.resolve(__dirname, "..", "..");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-etapa3c31-"));
  const databasePath = path.join(temporaryRoot, "laboratorio.db");
  const location = { runtimeRoot: temporaryRoot, databasePath };
  const loaded = loadService();
  const services = loaded.module.__createOrderPartServicesForTests(location);
  let assertions = 0;
  let osNumber = 800000;

  function check(fn) {
    fn();
    assertions += 1;
  }

  function expectStockError(fn, code) {
    assert.throws(fn, (error) => error instanceof loaded.errors.StockDomainError && error.code === code);
    assertions += 1;
  }

  function db() {
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    return database;
  }

  function createOrder(input = {}) {
    const id = input.id || randomUUID();
    const database = db();
    database.prepare(`INSERT INTO "ServiceOrder" (
      "id", "osNumber", "customerId", "equipmentType", "reportedDefect",
      "requiredParts", "partsCost", "laborCost", "discount", "totalAmount",
      "paymentMethod", "status", "paidAmount", "paymentPercent",
      "paymentReceivedAt", "finalizedAt", "createdAt", "updatedAt"
    ) VALUES (?, ?, 'etapa3c31-customer', 'OUTRO', 'Teste de reserva', ?, ?, ?, ?, ?,
      'AGUARDANDO_PAGAMENTO', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(
        id, osNumber++, input.requiredParts ?? null, input.partsCost ?? 0,
        input.laborCost ?? 0, input.discount ?? 0, input.totalAmount ?? 0,
        input.status ?? "RECEBIDO", input.paidAmount ?? 0,
        input.paymentPercent ?? 0, input.paymentReceivedAt ?? null,
        input.finalizedAt ?? null,
      );
    database.close();
    return id;
  }

  function createPart(input = {}) {
    const id = input.id || randomUUID();
    const database = db();
    database.prepare(`INSERT INTO "TechnicalPart" (
      "id", "name", "sku", "quantityOnHand", "quantityReserved", "minStock",
      "currentCostPrice", "defaultSalePrice", "isActive", "version",
      "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(
        id, input.name || "Peça de laboratório", input.sku ?? null,
        input.onHand === undefined ? 5 : input.onHand,
        input.reserved ?? 0, input.cost ?? 3, input.active === false ? 0 : 1,
        input.version ?? 0,
      );
    database.close();
    return id;
  }

  function reserve(orderId, partId, options = {}) {
    return services.reserveTechnicalPartForOrder(
      orderId,
      {
        technicalPartId: partId,
        technicalPartVersion: options.version ?? 0,
        quantity: options.quantity ?? 1,
        unitPrice: options.unitPrice ?? 10,
        ...(options.confirm === undefined
          ? {}
          : { confirmReplaceLegacyPartsCost: options.confirm }),
      },
      commandContext(
        options.key || randomUUID(),
        options.operatorId ?? null,
        options.financial ?? false,
      ),
    );
  }

  function scalar(sql, ...params) {
    const database = db();
    const row = database.prepare(sql).get(...params);
    database.close();
    return row;
  }

  async function race(orderA, orderB, partId, version) {
    const run = (orderId) => new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: { etapa3c31Worker: true, location, orderId, partId, version },
      });
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    return Promise.all([run(orderA), run(orderB)]);
  }

  try {
    fs.copyFileSync(path.join(projectRoot, "data", "nio-os.db"), databasePath);
    applyMigrations(databasePath, { logger: () => undefined });
    const setup = db();
    setup.prepare(`INSERT INTO "Customer" ("id", "name", "createdAt", "updatedAt")
      VALUES ('etapa3c31-customer', 'Cliente estrutural', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run();
    setup.close();

    const controlledOrder = createOrder({ laborCost: 50, discount: 5 });
    const controlledPart = createPart({ onHand: 5, cost: 4 });
    const controlled = reserve(controlledOrder, controlledPart, { quantity: 2, unitPrice: 10 });
    const controlledState = scalar(`SELECT p."quantityOnHand", p."quantityReserved",
      (SELECT COUNT(*) FROM "ServiceOrderPart" WHERE "serviceOrderId" = ?) AS "items",
      (SELECT COUNT(*) FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ?) AS "movements"
      FROM "TechnicalPart" p WHERE p."id" = ?`, controlledOrder, controlled.item.id, controlledPart);
    check(() => assert.equal(Number(controlledState.quantityOnHand), 5));
    check(() => assert.equal(Number(controlledState.quantityReserved), 2));
    check(() => assert.equal(Number(controlledState.items), 1));
    check(() => assert.equal(Number(controlledState.movements), 1));
    check(() => assert.equal(controlled.item.state, "RESERVED"));
    check(() => assert.equal(controlled.movement.type, "RESERVATION"));
    check(() => assert.equal(controlled.movement.reservedBefore, 0));
    check(() => assert.equal(controlled.movement.reservedAfter, 2));
    check(() => assert.deepEqual(controlled.totals, {
      partsCost: 20, laborCost: 50, discount: 5, totalAmount: 65,
    }));
    check(() => assert.equal(Number(scalar(
      `SELECT COUNT(*) AS "total" FROM "OrderHistory" WHERE "serviceOrderId" = ?`,
      controlledOrder,
    ).total), 1));

    const unlimitedOrder = createOrder();
    const unlimitedPart = createPart({ onHand: null, reserved: 3 });
    const unlimited = reserve(unlimitedOrder, unlimitedPart, { quantity: 100 });
    check(() => assert.equal(unlimited.movement.onHandBefore, null));
    check(() => assert.equal(unlimited.movement.onHandAfter, null));
    const unlimitedState = scalar(
      `SELECT "quantityOnHand", "quantityReserved" FROM "TechnicalPart" WHERE "id" = ?`,
      unlimitedPart,
    );
    check(() => assert.equal(unlimitedState.quantityOnHand, null));
    check(() => assert.equal(Number(unlimitedState.quantityReserved), 103));

    const zeroOrder = createOrder();
    const zeroPart = createPart({ onHand: 0 });
    expectStockError(() => reserve(zeroOrder, zeroPart), "INSUFFICIENT_AVAILABLE_STOCK");
    check(() => assert.equal(Number(scalar(
      `SELECT COUNT(*) AS "total" FROM "ServiceOrderPart" WHERE "serviceOrderId" = ?`,
      zeroOrder,
    ).total), 0));
    check(() => assert.equal(Number(scalar(
      `SELECT "quantityReserved" FROM "TechnicalPart" WHERE "id" = ?`, zeroPart,
    ).quantityReserved), 0));

    const racePart = createPart({ onHand: 1 });
    const raceResults = await race(createOrder(), createOrder(), racePart, 0);
    check(() => assert.equal(raceResults.filter((result) => result.ok).length, 1));
    check(() => assert.equal(raceResults.filter((result) =>
      ["VERSION_CONFLICT", "INSUFFICIENT_AVAILABLE_STOCK"].includes(result.code)).length, 1));
    const raceState = scalar(`SELECT "quantityOnHand", "quantityReserved",
      (SELECT COUNT(*) FROM "TechnicalPartMovement" WHERE "technicalPartId" = ?) AS "movements"
      FROM "TechnicalPart" WHERE "id" = ?`, racePart, racePart);
    check(() => assert.equal(Number(raceState.quantityReserved), 1));
    check(() => assert.equal(Number(raceState.quantityOnHand), 1));
    check(() => assert.equal(Number(raceState.movements), 1));

    const staleOrder = createOrder();
    const stalePart = createPart({ version: 2 });
    expectStockError(() => reserve(staleOrder, stalePart, { version: 1 }), "VERSION_CONFLICT");
    check(() => assert.equal(Number(scalar(
      `SELECT COUNT(*) AS "total" FROM "ServiceOrderPart" WHERE "serviceOrderId" = ?`, staleOrder,
    ).total), 0));
    expectStockError(() => reserve(createOrder(), randomUUID()), "TECHNICAL_PART_NOT_FOUND");
    expectStockError(() => reserve(createOrder(), createPart({ active: false })), "TECHNICAL_PART_INACTIVE");
    const duplicateOrder = createOrder();
    const duplicatePart = createPart();
    reserve(duplicateOrder, duplicatePart);
    expectStockError(
      () => reserve(duplicateOrder, duplicatePart, { version: 1 }),
      "PART_ALREADY_ACTIVE_ON_ORDER",
    );

    expectStockError(() => reserve(randomUUID(), createPart()), "SERVICE_ORDER_NOT_FOUND");
    for (const status of ["PRONTO", "ENTREGUE", "CANCELADO"]) {
      expectStockError(
        () => reserve(createOrder({ status }), createPart()),
        "ORDER_NOT_MUTABLE",
      );
    }
    expectStockError(
      () => reserve(createOrder({ finalizedAt: new Date().toISOString() }), createPart()),
      "ORDER_NOT_MUTABLE",
    );
    const finalizedOrder = createOrder();
    const finalizedDb = db();
    finalizedDb.prepare(`INSERT INTO "OrderFinalization" (
      "id", "serviceOrderId", "repairDescription", "finalAmount", "warrantyDays",
      "deliveredAt", "deliveredBy", "paymentMethod", "createdAt", "updatedAt"
    ) VALUES (?, ?, 'Finalizada', 0, 0, CURRENT_TIMESTAMP, 'Sistema', 'DINHEIRO',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(randomUUID(), finalizedOrder);
    finalizedDb.close();
    expectStockError(() => reserve(finalizedOrder, createPart()), "ORDER_NOT_MUTABLE");

    expectStockError(
      () => reserve(createOrder({ paidAmount: 1 }), createPart()),
      "ORDER_HAS_PAYMENTS",
    );
    expectStockError(
      () => reserve(createOrder({ paymentPercent: 1 }), createPart()),
      "ORDER_HAS_PAYMENTS",
    );
    expectStockError(
      () => reserve(createOrder({ paymentReceivedAt: new Date().toISOString() }), createPart()),
      "ORDER_HAS_PAYMENTS",
    );
    const paymentOrder = createOrder();
    const paymentDb = db();
    paymentDb.prepare(`INSERT INTO "ServiceOrderPayment" (
      "id", "serviceOrderId", "amount", "percent", "paymentMethod", "userName", "createdAt"
    ) VALUES (?, ?, 1, 1, 'PIX', 'Sistema', CURRENT_TIMESTAMP)`)
      .run(randomUUID(), paymentOrder);
    paymentDb.close();
    expectStockError(() => reserve(paymentOrder, createPart()), "ORDER_HAS_PAYMENTS");

    const noLegacyOrder = createOrder({ partsCost: 0, requiredParts: "Texto legado preservado" });
    reserve(noLegacyOrder, createPart());
    check(() => assert.equal(scalar(
      `SELECT "requiredParts" FROM "ServiceOrder" WHERE "id" = ?`, noLegacyOrder,
    ).requiredParts, "Texto legado preservado"));
    const legacyOrder = createOrder({ partsCost: 90, totalAmount: 90, requiredParts: "Não converter" });
    const legacyPart = createPart();
    expectStockError(
      () => reserve(legacyOrder, legacyPart),
      "LEGACY_PARTS_COST_CONFIRMATION_REQUIRED",
    );
    const legacy = reserve(legacyOrder, legacyPart, { confirm: true, quantity: 2, unitPrice: 7 });
    check(() => assert.equal(legacy.totals.partsCost, 14));
    check(() => assert.equal(scalar(
      `SELECT "requiredParts" FROM "ServiceOrder" WHERE "id" = ?`, legacyOrder,
    ).requiredParts, "Não converter"));
    check(() => assert.match(String(scalar(
      `SELECT "description" FROM "OrderHistory" WHERE "serviceOrderId" = ?`, legacyOrder,
    ).description), /substituída/));

    const snapshotOrder = createOrder();
    const snapshotPart = createPart({ name: "Nome original", sku: "SKU-ORIGINAL", cost: 8 });
    const snapshot = reserve(snapshotOrder, snapshotPart, { unitPrice: 15, quantity: 2 });
    check(() => assert.equal("unitCostSnapshot" in snapshot.item, false));
    check(() => assert.equal(snapshot.item.unitPriceSnapshot, 15));
    check(() => assert.equal(snapshot.item.totalPriceSnapshot, 30));
    const snapshotDb = db();
    snapshotDb.prepare(`UPDATE "TechnicalPart" SET "name" = ?, "sku" = ?,
      "currentCostPrice" = 99 WHERE "id" = ?`).run("Nome novo", "SKU-NOVO", snapshotPart);
    snapshotDb.close();
    const snapshotList = services.listTechnicalPartsForOrder(snapshotOrder, {
      canViewFinancialData: true,
    });
    check(() => assert.equal(snapshotList.items[0].partNameSnapshot, "Nome original"));
    check(() => assert.equal(snapshotList.items[0].partSkuSnapshot, "SKU-ORIGINAL"));
    check(() => assert.equal(snapshotList.items[0].unitCostSnapshot, 8));
    check(() => assert.equal(snapshotList.items[0].subtotal, 30));
    const hiddenSnapshotList = services.listTechnicalPartsForOrder(snapshotOrder, {
      canViewFinancialData: false,
    });
    check(() => assert.equal("unitCostSnapshot" in hiddenSnapshotList.items[0], false));

    const replayOrder = createOrder();
    const replayPart = createPart();
    const replayKey = randomUUID();
    const first = reserve(replayOrder, replayPart, { key: replayKey, quantity: 2 });
    const replay = reserve(replayOrder, replayPart, { key: replayKey, quantity: 2 });
    check(() => assert.equal(replay.idempotentReplay, true));
    check(() => assert.equal(replay.item.id, first.item.id));
    const replayCounts = scalar(`SELECT
      (SELECT COUNT(*) FROM "ServiceOrderPart" WHERE "serviceOrderId" = ?) AS "items",
      (SELECT COUNT(*) FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ?) AS "movements",
      (SELECT COUNT(*) FROM "OrderHistory" WHERE "serviceOrderId" = ?) AS "histories"`,
      replayOrder, first.item.id, replayOrder);
    check(() => assert.deepEqual(
      [Number(replayCounts.items), Number(replayCounts.movements), Number(replayCounts.histories)],
      [1, 1, 1],
    ));
    expectStockError(
      () => reserve(replayOrder, replayPart, { key: replayKey, quantity: 3 }),
      "IDEMPOTENCY_KEY_REUSED",
    );

    const operatorsDb = db();
    for (const id of ["etapa3c31-user-a", "etapa3c31-user-b"]) {
      operatorsDb.prepare(`INSERT INTO "SystemUser" (
        "id", "name", "username", "passwordHash", "role", "status", "createdAt", "updatedAt"
      ) VALUES (?, 'Operador', ?, 'hash', 'TECNICO', 'ATIVO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
        .run(id, id);
    }
    operatorsDb.close();
    const operatorOrder = createOrder();
    const operatorPart = createPart();
    const operatorKey = randomUUID();
    reserve(operatorOrder, operatorPart, {
      key: operatorKey, operatorId: "etapa3c31-user-a",
    });
    expectStockError(
      () => reserve(operatorOrder, operatorPart, {
        key: operatorKey, operatorId: "etapa3c31-user-b", version: 1,
      }),
      "PART_ALREADY_ACTIVE_ON_ORDER",
    );

    for (const failurePoint of ["after_reserve", "after_item", "after_movement"]) {
      const rollbackOrder = createOrder({ laborCost: 2 });
      const rollbackPart = createPart({ onHand: 2 });
      const failing = loaded.module.__createOrderPartServicesForTests(location, {
        failAfter: failurePoint,
      });
      expectStockError(
        () => failing.reserveTechnicalPartForOrder(
          rollbackOrder,
          { technicalPartId: rollbackPart, technicalPartVersion: 0, quantity: 1, unitPrice: 4 },
          commandContext(),
        ),
        "INTERNAL_ERROR",
      );
      const rollbackState = scalar(`SELECT
        (SELECT "quantityReserved" FROM "TechnicalPart" WHERE "id" = ?) AS "reserved",
        (SELECT COUNT(*) FROM "ServiceOrderPart" WHERE "serviceOrderId" = ?) AS "items",
        (SELECT COUNT(*) FROM "TechnicalPartMovement" WHERE "technicalPartId" = ?) AS "movements",
        (SELECT COUNT(*) FROM "OrderHistory" WHERE "serviceOrderId" = ?) AS "histories",
        (SELECT "partsCost" FROM "ServiceOrder" WHERE "id" = ?) AS "partsCost"`,
        rollbackPart, rollbackOrder, rollbackPart, rollbackOrder, rollbackOrder);
      check(() => assert.deepEqual([
        Number(rollbackState.reserved), Number(rollbackState.items),
        Number(rollbackState.movements), Number(rollbackState.histories),
        Number(rollbackState.partsCost),
      ], [0, 0, 0, 0, 0]));
    }

    const maliciousOrder = createOrder({ id: "order'); DROP TABLE ServiceOrder; --" });
    const maliciousPart = createPart({
      id: "part'); DROP TABLE TechnicalPart; --",
      name: "Peça'); DELETE FROM OrderHistory; --",
    });
    reserve(maliciousOrder, maliciousPart);
    check(() => assert.equal(Number(scalar(
      `SELECT COUNT(*) AS "total" FROM sqlite_master WHERE "type" = ? AND "name" = ?`,
      "table", "ServiceOrder",
    ).total), 1));
    check(() => assert.equal(Number(scalar(
      `SELECT COUNT(*) AS "total" FROM "OrderHistory" WHERE "serviceOrderId" = ?`,
      maliciousOrder,
    ).total), 1));

    const filterOrder = createOrder();
    const filterPart = createPart();
    const filterReservation = reserve(filterOrder, filterPart);
    const filterDb = db();
    filterDb.prepare(`UPDATE "ServiceOrderPart" SET "state" = 'RELEASED',
      "releasedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`).run(filterReservation.item.id);
    filterDb.close();
    check(() => assert.equal(services.listTechnicalPartsForOrder(filterOrder).items.length, 0));
    check(() => assert.equal(services.listTechnicalPartsForOrder(filterOrder, {
      states: ["RELEASED"], includeHistory: true,
    }).items.length, 1));
    const queryResult = services.listTechnicalPartsForOrder(controlledOrder, {
      canViewFinancialData: false,
    });
    check(() => assert.deepEqual(Object.keys(queryResult).sort(), ["items", "totals"]));
    check(() => assert.equal("unitCostSnapshot" in queryResult.items[0], false));
    expectStockError(
      () => services.listTechnicalPartsForOrder(controlledOrder, { states: ["RESERVED'); --"] }),
      "VALIDATION_ERROR",
    );

    const noHistory = services.listTechnicalPartsForOrder(controlledOrder, {
      includeHistory: false,
    });
    check(() => assert.deepEqual(Object.keys(noHistory).sort(), ["items", "totals"]));
    const withHistory = services.listTechnicalPartsForOrder(controlledOrder, {
      includeHistory: true,
    });
    check(() => assert.deepEqual(Object.keys(withHistory).sort(), ["items", "movements", "totals"]));
    check(() => assert.equal(withHistory.movements.length, 1));
    check(() => assert.equal(withHistory.movements[0].serviceOrderPartId, controlled.item.id));
    check(() => assert.equal(services.listTechnicalPartsForOrder(filterOrder, {
      includeHistory: true,
    }).items.length, 0));
    check(() => assert.equal(services.listTechnicalPartsForOrder(filterOrder, {
      includeHistory: true,
    }).movements.length, 0));
    const releasedHistory = services.listTechnicalPartsForOrder(filterOrder, {
      states: ["RELEASED"], includeHistory: true,
    });
    check(() => assert.equal(releasedHistory.items.length, 1));
    check(() => assert.equal(releasedHistory.movements.length, 1));
    check(() => assert.equal(releasedHistory.movements[0].serviceOrderPartId, filterReservation.item.id));

    function assertNoInternalMetadata(value) {
      if (Array.isArray(value)) {
        for (const entry of value) assertNoInternalMetadata(entry);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        assert.notEqual(key, "idempotencyKey");
        assert.notEqual(key, "responsibleUserId");
        assert.notEqual(key, "operatorId");
        assertNoInternalMetadata(entry);
      }
    }
    check(() => assertNoInternalMetadata(controlled));
    check(() => assertNoInternalMetadata(withHistory));
    check(() => assert.equal("unitCostSnapshot" in withHistory.items[0], false));
    check(() => assert.equal("unitCostSnapshot" in withHistory.movements[0], false));
    const financialHistory = services.listTechnicalPartsForOrder(controlledOrder, {
      includeHistory: true,
      canViewFinancialData: true,
    });
    check(() => assert.equal(financialHistory.items[0].unitCostSnapshot, 4));
    check(() => assert.equal(financialHistory.items[0].totalCostSnapshot, 8));
    check(() => assert.equal(financialHistory.movements[0].unitCostSnapshot, 4));

    function updateItemState(itemId, state) {
      const database = db();
      const timestamps = {
        RESERVED: [null, null, null],
        CONSUMED: [new Date().toISOString(), null, null],
        RELEASED: [null, new Date().toISOString(), null],
        REVERSED: [new Date().toISOString(), null, new Date().toISOString()],
      }[state];
      database.prepare(`UPDATE "ServiceOrderPart" SET "state" = ?,
        "consumedAt" = ?, "releasedAt" = ?, "reversedAt" = ? WHERE "id" = ?`)
        .run(state, ...timestamps, itemId);
      database.close();
    }
    for (const state of ["RESERVED", "CONSUMED", "RELEASED", "REVERSED"]) {
      const orderId = createOrder();
      const partId = createPart();
      const key = randomUUID();
      const initial = reserve(orderId, partId, { key, quantity: 1 });
      updateItemState(initial.item.id, state);
      const beforeReplay = scalar(`SELECT
        (SELECT "quantityReserved" FROM "TechnicalPart" WHERE "id" = ?) AS "reserved",
        (SELECT COUNT(*) FROM "ServiceOrderPart" WHERE "serviceOrderId" = ?) AS "items",
        (SELECT COUNT(*) FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ?) AS "movements",
        (SELECT COUNT(*) FROM "OrderHistory" WHERE "serviceOrderId" = ?) AS "histories"`,
        partId, orderId, initial.item.id, orderId);
      const stateReplay = reserve(orderId, partId, { key, quantity: 1 });
      const afterReplay = scalar(`SELECT
        (SELECT "quantityReserved" FROM "TechnicalPart" WHERE "id" = ?) AS "reserved",
        (SELECT COUNT(*) FROM "ServiceOrderPart" WHERE "serviceOrderId" = ?) AS "items",
        (SELECT COUNT(*) FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ?) AS "movements",
        (SELECT COUNT(*) FROM "OrderHistory" WHERE "serviceOrderId" = ?) AS "histories"`,
        partId, orderId, initial.item.id, orderId);
      check(() => assert.equal(stateReplay.idempotentReplay, true));
      check(() => assert.equal(stateReplay.item.state, state));
      check(() => assert.deepEqual(afterReplay, beforeReplay));
    }

    function makeCorruptReplay() {
      const orderId = createOrder();
      const partId = createPart();
      const key = randomUUID();
      const result = reserve(orderId, partId, { key, quantity: 2 });
      return { orderId, partId, key, result };
    }
    const wrongPartReplay = makeCorruptReplay();
    const otherPart = createPart();
    let corruptDb = db();
    corruptDb.prepare(`UPDATE "TechnicalPartMovement" SET "technicalPartId" = ?
      WHERE "serviceOrderPartId" = ?`).run(otherPart, wrongPartReplay.result.item.id);
    corruptDb.close();
    expectStockError(() => reserve(wrongPartReplay.orderId, wrongPartReplay.partId, {
      key: wrongPartReplay.key, quantity: 2,
    }), "STOCK_INVARIANT_VIOLATION");

    const wrongQuantityReplay = makeCorruptReplay();
    corruptDb = db();
    corruptDb.prepare(`UPDATE "TechnicalPartMovement" SET "quantity" = 1,
      "reservedAfter" = "reservedBefore" + 1
      WHERE "serviceOrderPartId" = ?`).run(wrongQuantityReplay.result.item.id);
    corruptDb.close();
    expectStockError(() => reserve(wrongQuantityReplay.orderId, wrongQuantityReplay.partId, {
      key: wrongQuantityReplay.key, quantity: 2,
    }), "STOCK_INVARIANT_VIOLATION");

    const missingMovementReplay = makeCorruptReplay();
    corruptDb = db();
    corruptDb.prepare(`DELETE FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ?`)
      .run(missingMovementReplay.result.item.id);
    corruptDb.close();
    expectStockError(() => reserve(missingMovementReplay.orderId, missingMovementReplay.partId, {
      key: missingMovementReplay.key, quantity: 2,
    }), "STOCK_INVARIANT_VIOLATION");

    const excessiveOrder = createOrder({ laborCost: 1_000_000_000, totalAmount: 123 });
    const excessivePart = createPart();
    expectStockError(() => reserve(excessiveOrder, excessivePart), "STOCK_INVARIANT_VIOLATION");
    const excessiveState = scalar(`SELECT "partsCost", "totalAmount",
      (SELECT "quantityReserved" FROM "TechnicalPart" WHERE "id" = ?) AS "reserved",
      (SELECT COUNT(*) FROM "ServiceOrderPart" WHERE "serviceOrderId" = ?) AS "items"
      FROM "ServiceOrder" WHERE "id" = ?`, excessivePart, excessiveOrder, excessiveOrder);
    check(() => assert.deepEqual([
      Number(excessiveState.partsCost), Number(excessiveState.totalAmount),
      Number(excessiveState.reserved), Number(excessiveState.items),
    ], [0, 123, 0, 0]));

    const publicBarrel = require("../../lib/estoqueTecnico/index.ts");
    check(() => assert.equal(typeof publicBarrel.reserveTechnicalPartForOrder, "function"));
    check(() => assert.equal(typeof publicBarrel.listTechnicalPartsForOrder, "function"));
    check(() => assert.equal(typeof publicBarrel.createTechnicalPart, "function"));
    check(() => assert.equal(Object.keys(publicBarrel).some((key) => key.startsWith("__")), false));
    check(() => assert.equal("insertTechnicalPartMovement" in publicBarrel, false));
    check(() => assert.equal("reserveTechnicalPartStock" in publicBarrel, false));
    check(() => assert.equal("recalculateTechnicalPartsOrderTotals" in publicBarrel, false));

    process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
  } finally {
    loaded.restore();
    fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
