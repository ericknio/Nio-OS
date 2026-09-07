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
    consumption: require("../../lib/estoqueTecnico/orderConsumptionService.ts"),
    reservation: require("../../lib/estoqueTecnico/orderPartService.ts"),
    mutation: require("../../lib/estoqueTecnico/orderPartMutationService.ts"),
    errors: require("../../lib/estoqueTecnico/errors.ts"),
  };
}

function context(key = randomUUID(), operatorId = null, financial = false) {
  return { operatorId, operatorName: operatorId ? "Operador" : "Sistema", canViewFinancialData: financial, idempotencyKey: key };
}

if (!isMainThread && workerData?.worker) {
  const loaded = loadModules();
  try {
    if (workerData.delayMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, workerData.delayMs);
    const consume = loaded.consumption.__createOrderConsumptionServicesForTests(workerData.location);
    const mutate = loaded.mutation.__createOrderPartMutationServicesForTests(workerData.location);
    let result;
    if (workerData.operation === "ready") {
      result = consume.markServiceOrderReadyAndConsumeTechnicalParts(workerData.orderId, {
        expectedCurrentStatus: "RECEBIDO", confirmation: true, technicianResponsible: "Técnico",
      }, context());
    } else if (workerData.operation === "release") {
      result = mutate.releaseTechnicalPartFromOrder(workerData.itemId, {
        technicalPartVersion: 1, expectedQuantity: workerData.quantity, reason: "Concorrência",
      }, context());
    } else {
      result = mutate.changeReservedTechnicalPartQuantity(workerData.itemId, {
        technicalPartVersion: 1, expectedQuantity: workerData.quantity,
        newQuantity: workerData.quantity + 1, reason: "Concorrência",
      }, context());
    }
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
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-etapa3c33a-"));
  const databasePath = path.join(temporaryRoot, "laboratorio.db");
  const location = { runtimeRoot: temporaryRoot, databasePath };
  const loaded = loadModules();
  const consumption = loaded.consumption.__createOrderConsumptionServicesForTests(location);
  const reservation = loaded.reservation.__createOrderPartServicesForTests(location);
  let assertions = 0;
  let osNumber = 940000;
  const check = (fn) => { fn(); assertions += 1; };
  const expectCode = (fn, code) => {
    assert.throws(fn, (error) => error instanceof loaded.errors.StockDomainError && error.code === code);
    assertions += 1;
  };
  function db(options) { const database = options ? new DatabaseSync(databasePath, options) : new DatabaseSync(databasePath); database.exec("PRAGMA foreign_keys = ON"); return database; }
  function scalar(sql, ...params) { const database = db(); const row = database.prepare(sql).get(...params); database.close(); return row; }
  function createOrder(input = {}) {
    const id = input.id || randomUUID(); const database = db();
    database.prepare(`INSERT INTO "ServiceOrder" (
      "id", "osNumber", "customerId", "equipmentType", "reportedDefect", "partsCost",
      "laborCost", "discount", "totalAmount", "paymentMethod", "status", "paidAmount",
      "paymentPercent", "paymentReceivedAt", "finalizedAt", "createdAt", "updatedAt"
    ) VALUES (?, ?, 'etapa3c33a-customer', 'OUTRO', 'Teste', 0, ?, ?, ?,
      'AGUARDANDO_PAGAMENTO', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(id, osNumber++, input.laborCost ?? 0, input.discount ?? 0, input.totalAmount ?? 0,
        input.status ?? "RECEBIDO", input.paidAmount ?? 0, input.paymentPercent ?? 0,
        input.paymentReceivedAt ?? null, input.finalizedAt ?? null);
    database.close(); return id;
  }
  function createPart(input = {}) {
    const id = input.id || randomUUID(); const database = db();
    database.prepare(`INSERT INTO "TechnicalPart" (
      "id", "name", "quantityOnHand", "quantityReserved", "minStock", "currentCostPrice",
      "defaultSalePrice", "isActive", "version", "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, 0, 0, ?, 0, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(id, input.name || "Peça técnica", input.onHand === undefined ? 20 : input.onHand,
        input.cost ?? 4, input.active === false ? 0 : 1);
    database.close(); return id;
  }
  function reserve(orderId, partId, quantity = 2, unitPrice = 10) {
    return reservation.reserveTechnicalPartForOrder(orderId, {
      technicalPartId: partId, technicalPartVersion: 0, quantity, unitPrice,
    }, context());
  }
  function ready(orderId, expected = "RECEBIDO", options = {}) {
    return consumption.markServiceOrderReadyAndConsumeTechnicalParts(orderId, {
      expectedCurrentStatus: expected, confirmation: true,
      technicianResponsible: options.technician || "Técnico responsável",
    }, context(options.key || randomUUID(), options.operatorId ?? null, options.financial ?? false));
  }
  function state(itemId, partId, orderId) {
    return scalar(`SELECT i."state", i."quantity", p."quantityOnHand", p."quantityReserved", p."version",
      o."status", o."technicianResponsible", o."partsCost", o."totalAmount"
      FROM "ServiceOrderPart" i JOIN "TechnicalPart" p ON p."id" = ?
      JOIN "ServiceOrder" o ON o."id" = ? WHERE i."id" = ?`, partId, orderId, itemId);
  }
  function runWorker(operation, data) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, { workerData: { worker: true, location, operation, ...data } });
      worker.once("message", resolve); worker.once("error", reject);
    });
  }
  try {
    fs.copyFileSync(path.join(root, "data", "nio-os.db"), databasePath);
    applyMigrations(databasePath, { logger: () => undefined });
    let database = db();
    database.prepare(`INSERT INTO "Customer" ("id", "name", "createdAt", "updatedAt")
      VALUES ('etapa3c33a-customer', 'Cliente estrutural', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run();
    database.close();

    const controlledOrder = createOrder({ laborCost: 5, discount: 1, totalAmount: 4 });
    const controlledPart = createPart({ onHand: 10, cost: 3 });
    const controlledItem = reserve(controlledOrder, controlledPart, 2, 7);
    const controlled = ready(controlledOrder);
    const controlledState = state(controlledItem.item.id, controlledPart, controlledOrder);
    check(() => assert.deepEqual([Number(controlledState.quantityOnHand), Number(controlledState.quantityReserved), controlledState.state], [8, 0, "CONSUMED"]));
    check(() => assert.deepEqual([controlled.order.status, controlled.order.technicianResponsible], ["PRONTO", "Técnico responsável"]));
    check(() => assert.deepEqual([controlled.movements[0].type, controlled.movements[0].onHandBefore, controlled.movements[0].onHandAfter], ["CONSUMPTION", 10, 8]));
    check(() => assert.deepEqual([controlled.affectedItems, controlled.affectedUnits], [1, 2]));
    check(() => assert.deepEqual([controlled.order.partsCost, controlled.order.totalAmount], [14, 18]));

    const unlimitedOrder = createOrder(); const unlimitedPart = createPart({ onHand: null }); const unlimitedItem = reserve(unlimitedOrder, unlimitedPart, 3);
    const unlimited = ready(unlimitedOrder);
    const unlimitedState = state(unlimitedItem.item.id, unlimitedPart, unlimitedOrder);
    check(() => assert.equal(unlimitedState.quantityOnHand, null));
    check(() => assert.equal(Number(unlimitedState.quantityReserved), 0));
    check(() => assert.deepEqual([unlimited.movements[0].onHandBefore, unlimited.movements[0].onHandAfter], [null, null]));

    const multiOrder = createOrder(); const multiA = createPart({ name: "A" }); const multiB = createPart({ name: "B" });
    const multiItemA = reserve(multiOrder, multiA, 2); const multiItemB = reserve(multiOrder, multiB, 3);
    const multi = ready(multiOrder);
    check(() => assert.deepEqual([multi.affectedItems, multi.affectedUnits], [2, 5]));
    check(() => assert.deepEqual(
      new Set(multi.consumedItems.map((item) => item.id)),
      new Set([multiItemA.item.id, multiItemB.item.id]),
    ));
    check(() => assert.equal(multi.movements.length, 2));

    const inactiveOrder = createOrder(); const inactivePart = createPart(); const inactiveItem = reserve(inactiveOrder, inactivePart, 1);
    database = db(); database.prepare(`UPDATE "TechnicalPart" SET "isActive" = 0 WHERE "id" = ?`).run(inactivePart); database.close();
    ready(inactiveOrder);
    check(() => assert.equal(state(inactiveItem.item.id, inactivePart, inactiveOrder).state, "CONSUMED"));

    const reserveBadOrder = createOrder(); const reserveBadPart = createPart(); const reserveBadItem = reserve(reserveBadOrder, reserveBadPart, 2);
    database = db(); database.exec("PRAGMA ignore_check_constraints = ON"); database.prepare(`UPDATE "TechnicalPart" SET "quantityReserved" = 1 WHERE "id" = ?`).run(reserveBadPart); database.close();
    expectCode(() => ready(reserveBadOrder), "STOCK_INVARIANT_VIOLATION");
    check(() => assert.equal(scalar(`SELECT "status" FROM "ServiceOrder" WHERE "id" = ?`, reserveBadOrder).status, "RECEBIDO"));

    const physicalBadOrder = createOrder(); const physicalBadPart = createPart(); const physicalBadItem = reserve(physicalBadOrder, physicalBadPart, 2);
    database = db(); database.exec("PRAGMA ignore_check_constraints = ON"); database.prepare(`UPDATE "TechnicalPart" SET "quantityOnHand" = 1 WHERE "id" = ?`).run(physicalBadPart); database.close();
    expectCode(() => ready(physicalBadOrder), "STOCK_INVARIANT_VIOLATION");
    check(() => assert.equal(state(physicalBadItem.item.id, physicalBadPart, physicalBadOrder).state, "RESERVED"));

    const missingOrder = createOrder(); const missingPart = createPart(); const missingItem = reserve(missingOrder, missingPart, 1);
    database = new DatabaseSync(databasePath); database.exec("PRAGMA foreign_keys = OFF"); database.prepare(`DELETE FROM "TechnicalPart" WHERE "id" = ?`).run(missingPart); database.close();
    expectCode(() => ready(missingOrder), "TECHNICAL_PART_NOT_FOUND");
    check(() => assert.equal(scalar(`SELECT "state" FROM "ServiceOrderPart" WHERE "id" = ?`, missingItem.item.id).state, "RESERVED"));
    database = db(); database.prepare(`INSERT INTO "TechnicalPart" (
      "id", "name", "quantityOnHand", "quantityReserved", "minStock", "currentCostPrice",
      "defaultSalePrice", "isActive", "version", "createdAt", "updatedAt"
    ) VALUES (?, 'Restaurada', 20, 1, 0, 4, 0, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(missingPart); database.close();

    const priorOrder = createOrder(); const priorPart = createPart(); const priorItem = reserve(priorOrder, priorPart, 1);
    database = db(); database.prepare(`INSERT INTO "TechnicalPartMovement" (
      "id", "technicalPartId", "serviceOrderPartId", "type", "quantity", "onHandBefore", "onHandAfter",
      "reservedBefore", "reservedAfter", "unitCostSnapshot", "reason", "operatorNameSnapshot", "idempotencyKey", "createdAt"
    ) VALUES (?, ?, ?, 'CONSUMPTION', 1, 20, 19, 1, 0, 4, 'Inesperado', 'Sistema', ?, CURRENT_TIMESTAMP)`)
      .run(randomUUID(), priorPart, priorItem.item.id, randomUUID()); database.close();
    expectCode(() => ready(priorOrder), "STOCK_INVARIANT_VIOLATION");

    for (const status of ["RECEBIDO", "EM_ANALISE", "AGUARDANDO_PECA", "EM_REPARO"]) {
      const orderId = createOrder({ status }); ready(orderId, status); check(() => assert.equal(scalar(`SELECT "status" FROM "ServiceOrder" WHERE "id" = ?`, orderId).status, "PRONTO"));
    }
    const conflictOrder = createOrder({ status: "EM_ANALISE" }); expectCode(() => ready(conflictOrder, "RECEBIDO"), "ORDER_STATUS_CONFLICT");
    for (const status of ["PRONTO", "ENTREGUE", "CANCELADO"]) {
      const orderId = createOrder({ status }); expectCode(() => ready(orderId), "ORDER_STATUS_CONFLICT");
    }
    const finalizedOrder = createOrder({ finalizedAt: new Date().toISOString() }); expectCode(() => ready(finalizedOrder), "ORDER_NOT_MUTABLE");

    const emptyOrder = createOrder(); const empty = ready(emptyOrder);
    check(() => assert.deepEqual([empty.affectedItems, empty.movements.length], [0, 0]));
    check(() => assert.equal(Number(scalar(`SELECT "affectedItems" FROM "ServiceOrderTechnicalCommandLog" WHERE "serviceOrderId" = ?`, emptyOrder).affectedItems), 0));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "OrderHistory" WHERE "serviceOrderId" = ? AND "action" = 'PECAS_TECNICAS_CONSUMIDAS'`, emptyOrder).n), 0));

    const replayOrder = createOrder(); const replayPart = createPart(); const replayItem = reserve(replayOrder, replayPart, 2); const replayKey = randomUUID();
    const first = ready(replayOrder, "RECEBIDO", { key: replayKey }); const replay = ready(replayOrder, "RECEBIDO", { key: replayKey });
    check(() => assert.equal(replay.idempotentReplay, true));
    check(() => assert.deepEqual([replay.affectedItems, replay.affectedUnits], [1, 2]));
    expectCode(() => ready(replayOrder, "RECEBIDO", { key: replayKey, technician: "Outro" }), "IDEMPOTENCY_KEY_REUSED");
    database = db(); database.prepare(`UPDATE "ServiceOrder" SET "status" = 'ENTREGUE' WHERE "id" = ?`).run(replayOrder); database.close();
    check(() => assert.equal(ready(replayOrder, "RECEBIDO", { key: replayKey }).idempotentReplay, true));
    const replayCounts = scalar(`SELECT
      (SELECT COUNT(*) FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ? AND "type" = 'CONSUMPTION') AS movements,
      (SELECT COUNT(*) FROM "ServiceOrderTechnicalCommandLog" WHERE "serviceOrderId" = ?) AS commands,
      (SELECT COUNT(*) FROM "OrderHistory" WHERE "serviceOrderId" = ?) AS histories`, replayItem.item.id, replayOrder, replayOrder);
    check(() => assert.deepEqual([Number(replayCounts.movements), Number(replayCounts.commands), Number(replayCounts.histories)], [1, 1, 3]));
    check(() => assert.equal(first.idempotentReplay, false));

    const replayBeforeReverse = scalar(`SELECT
      (SELECT "quantityReserved" FROM "TechnicalPart" WHERE "id" = ?) AS reserved,
      (SELECT COUNT(*) FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ?) AS movements,
      (SELECT COUNT(*) FROM "OrderHistory" WHERE "serviceOrderId" = ?) AS histories,
      (SELECT COUNT(*) FROM "ServiceOrderTechnicalCommandLog" WHERE "serviceOrderId" = ?) AS commands`,
      replayPart, replayItem.item.id, replayOrder, replayOrder);
    database = db(); database.prepare(`UPDATE "ServiceOrderPart" SET "state" = 'REVERSED',
      "reversedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`).run(replayItem.item.id); database.close();
    const reversedReplay = ready(replayOrder, "RECEBIDO", { key: replayKey });
    const replayAfterReverse = scalar(`SELECT
      (SELECT "quantityReserved" FROM "TechnicalPart" WHERE "id" = ?) AS reserved,
      (SELECT COUNT(*) FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ?) AS movements,
      (SELECT COUNT(*) FROM "OrderHistory" WHERE "serviceOrderId" = ?) AS histories,
      (SELECT COUNT(*) FROM "ServiceOrderTechnicalCommandLog" WHERE "serviceOrderId" = ?) AS commands`,
      replayPart, replayItem.item.id, replayOrder, replayOrder);
    check(() => assert.equal(reversedReplay.idempotentReplay, true));
    check(() => assert.equal(reversedReplay.consumedItems[0].state, "REVERSED"));
    check(() => assert.deepEqual(replayAfterReverse, replayBeforeReverse));

    function createReplayFixture(quantity = 1) {
      const orderId = createOrder(); const partId = createPart(); const item = reserve(orderId, partId, quantity); const key = randomUUID();
      ready(orderId, "RECEBIDO", { key });
      return { orderId, partId, itemId: item.item.id, key };
    }
    const missingMovement = createReplayFixture();
    database = db(); database.prepare(`DELETE FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ?`).run(missingMovement.itemId); database.close();
    expectCode(() => ready(missingMovement.orderId, "RECEBIDO", { key: missingMovement.key }), "STOCK_INVARIANT_VIOLATION");

    const otherOrder = createReplayFixture(); const targetOrder = createReplayFixture();
    database = db(); database.prepare(`UPDATE "TechnicalPartMovement" SET "serviceOrderPartId" = ?
      WHERE "serviceOrderPartId" = ?`).run(otherOrder.itemId, targetOrder.itemId); database.close();
    expectCode(() => ready(targetOrder.orderId, "RECEBIDO", { key: targetOrder.key }), "STOCK_INVARIANT_VIOLATION");

    const divergentPart = createReplayFixture(); const anotherPart = createPart();
    database = db(); database.prepare(`UPDATE "TechnicalPartMovement" SET "technicalPartId" = ?
      WHERE "serviceOrderPartId" = ?`).run(anotherPart, divergentPart.itemId); database.close();
    expectCode(() => ready(divergentPart.orderId, "RECEBIDO", { key: divergentPart.key }), "STOCK_INVARIANT_VIOLATION");

    const divergentQuantity = createReplayFixture(1);
    database = db(); database.prepare(`UPDATE "ServiceOrderPart" SET "quantity" = 2,
      "totalCostSnapshot" = "unitCostSnapshot" * 2, "totalPriceSnapshot" = "unitPriceSnapshot" * 2
      WHERE "id" = ?`).run(divergentQuantity.itemId); database.close();
    expectCode(() => ready(divergentQuantity.orderId, "RECEBIDO", { key: divergentQuantity.key }), "STOCK_INVARIANT_VIOLATION");

    const duplicateMovement = createReplayFixture();
    database = db(); database.prepare(`INSERT INTO "TechnicalPartMovement" (
      "id", "technicalPartId", "serviceOrderPartId", "type", "quantity", "onHandBefore", "onHandAfter",
      "reservedBefore", "reservedAfter", "unitCostSnapshot", "reason", "operatorNameSnapshot", "idempotencyKey", "createdAt"
    ) SELECT ?, "technicalPartId", "serviceOrderPartId", 'CONSUMPTION', "quantity", "onHandBefore", "onHandAfter",
      "reservedBefore", "reservedAfter", "unitCostSnapshot", 'Duplicado', "operatorNameSnapshot", ?, "createdAt"
      FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ? AND "type" = 'CONSUMPTION'`)
      .run(randomUUID(), randomUUID(), duplicateMovement.itemId); database.close();
    expectCode(() => ready(duplicateMovement.orderId, "RECEBIDO", { key: duplicateMovement.key }), "STOCK_INVARIANT_VIOLATION");

    const zeroReplayOrder = createOrder(); const zeroReplayKey = randomUUID();
    ready(zeroReplayOrder, "RECEBIDO", { key: zeroReplayKey });
    check(() => assert.equal(ready(zeroReplayOrder, "RECEBIDO", { key: zeroReplayKey }).idempotentReplay, true));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" IN (SELECT "id" FROM "ServiceOrderPart" WHERE "serviceOrderId" = ?)`, zeroReplayOrder).n), 0));

    database = db(); for (const id of ["etapa3c33a-user-a", "etapa3c33a-user-b"]) database.prepare(`INSERT INTO "SystemUser" (
      "id", "name", "username", "passwordHash", "role", "status", "createdAt", "updatedAt"
    ) VALUES (?, 'Operador', ?, 'hash', 'TECNICO', 'ATIVO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(id, id); database.close();
    const scopedOrder = createOrder(); const scopedPart = createPart(); reserve(scopedOrder, scopedPart, 1); const scopedKey = randomUUID();
    ready(scopedOrder, "RECEBIDO", { key: scopedKey, operatorId: "etapa3c33a-user-a" });
    expectCode(() => ready(scopedOrder, "RECEBIDO", { key: scopedKey, operatorId: "etapa3c33a-user-b" }), "ORDER_STATUS_CONFLICT");

    const paidOrder = createOrder(); const paidPart = createPart(); reserve(paidOrder, paidPart, 1);
    database = db(); database.prepare(`UPDATE "ServiceOrder" SET "paidAmount" = 5,
      "paymentPercent" = 25, "paymentReceivedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`).run(paidOrder);
    database.prepare(`INSERT INTO "ServiceOrderPayment" (
      "id", "serviceOrderId", "amount", "percent", "paymentMethod", "userName", "createdAt"
    ) VALUES (?, ?, 5, 25, 'PIX', 'Sistema', CURRENT_TIMESTAMP)`).run(randomUUID(), paidOrder); database.close();
    const paid = ready(paidOrder); check(() => assert.equal(paid.order.status, "PRONTO"));
    check(() => assert.equal("paidAmount" in paid.order, false));
    const paidState = scalar(`SELECT "paidAmount", "paymentPercent", "paymentReceivedAt" FROM "ServiceOrder" WHERE "id" = ?`, paidOrder);
    check(() => assert.deepEqual([Number(paidState.paidAmount), Number(paidState.paymentPercent), paidState.paymentReceivedAt !== null], [5, 25, true]));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "ServiceOrderPayment" WHERE "serviceOrderId" = ?`, paidOrder).n), 1));

    const totalOrder = createOrder(); const totalPart = createPart(); const totalItem = reserve(totalOrder, totalPart, 1);
    database = db(); database.prepare(`UPDATE "ServiceOrder" SET "laborCost" = 1000000000, "totalAmount" = 123 WHERE "id" = ?`).run(totalOrder); database.close();
    expectCode(() => ready(totalOrder), "STOCK_INVARIANT_VIOLATION");
    check(() => assert.deepEqual([state(totalItem.item.id, totalPart, totalOrder).state, scalar(`SELECT "status" FROM "ServiceOrder" WHERE "id" = ?`, totalOrder).status], ["RESERVED", "RECEBIDO"]));

    const raceOrder = createOrder(); const racePart = createPart(); const raceItem = reserve(raceOrder, racePart, 2);
    let race = await Promise.all([runWorker("ready", { orderId: raceOrder }), runWorker("ready", { orderId: raceOrder })]);
    check(() => assert.equal(race.filter((entry) => entry.ok).length, 1));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ? AND "type" = 'CONSUMPTION'`, raceItem.item.id).n), 1));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "ServiceOrderTechnicalCommandLog" WHERE "serviceOrderId" = ?`, raceOrder).n), 1));

    // Concorrência PRONTO x mutação da reserva.
    // BEGIN IMMEDIATE serializa as operações, mas a ordem de aquisição do lock entre
    // workers não é determinística. Se a mutação terminar primeiro, PRONTO pode ser
    // executado depois de forma válida; portanto, duas operações bem-sucedidas podem
    // representar uma serialização correta, e não uma corrida inconsistente.
    for (const operation of ["release", "change"]) {
      const orderId = createOrder(); const partId = createPart(); const item = reserve(orderId, partId, 2);
      const beforeRace = state(item.item.id, partId, orderId);
      race = await Promise.all([
        runWorker("ready", { orderId }),
        runWorker(operation, { itemId: item.item.id, quantity: 2, delayMs: 150 }),
      ]);

      const successes = race.filter((entry) => entry.ok).length;
      check(() => assert.ok(successes === 1 || successes === 2, `Resultado concorrente inválido: ${JSON.stringify(race)}`));

      const current = state(item.item.id, partId, orderId);
      check(() => assert.equal(current.status, "PRONTO"));
      check(() => assert.ok(Number(current.quantityReserved) >= 0));
      check(() => assert.ok(current.quantityOnHand === null || Number(current.quantityReserved) <= Number(current.quantityOnHand)));

      const consumptionCount = Number(scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement"
        WHERE "serviceOrderPartId" = ? AND "type" = 'CONSUMPTION'`, item.item.id).n);

      if (operation === "release") {
        const releaseCount = Number(scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement"
          WHERE "serviceOrderPartId" = ? AND "type" = 'RELEASE'`, item.item.id).n);

        // Ou PRONTO consumiu primeiro, ou RELEASE terminou primeiro e PRONTO apenas
        // concluiu a OS sem consumir esse item. Nunca ambos no mesmo item.
        check(() => assert.equal(consumptionCount + releaseCount, 1));
        check(() => assert.equal(successes, 1 + releaseCount));
        check(() => assert.equal(current.state, releaseCount === 1 ? "RELEASED" : "CONSUMED"));
        check(() => assert.equal(Number(current.quantityReserved), 0));
        check(() => assert.equal(
          Number(current.quantityOnHand),
          releaseCount === 1 ? Number(beforeRace.quantityOnHand) : Number(beforeRace.quantityOnHand) - Number(item.item.quantity),
        ));
      } else {
        const increaseCount = Number(scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement"
          WHERE "serviceOrderPartId" = ? AND "type" = 'RESERVATION_INCREASE'`, item.item.id).n);

        // PRONTO sempre consome o item. Se o aumento terminou antes, ele também é um
        // sucesso válido e a quantidade consumida passa a refletir o novo total.
        check(() => assert.equal(consumptionCount, 1));
        check(() => assert.ok(increaseCount === 0 || increaseCount === 1));
        check(() => assert.equal(successes, 1 + increaseCount));
        check(() => assert.equal(current.state, "CONSUMED"));
        check(() => assert.equal(Number(current.quantityReserved), 0));
        check(() => assert.equal(Number(current.quantity), 2 + increaseCount));
        check(() => assert.equal(Number(current.quantityOnHand), Number(beforeRace.quantityOnHand) - Number(current.quantity)));
      }
    }

    for (const failAfter of ["after_first_part", "after_first_item", "after_first_movement", "after_all_items", "after_status", "after_history", "before_command_log"]) {
      const orderId = createOrder(); const partId = createPart(); const item = reserve(orderId, partId, 2);
      const failing = loaded.consumption.__createOrderConsumptionServicesForTests(location, { failAfter });
      expectCode(() => failing.markServiceOrderReadyAndConsumeTechnicalParts(orderId, {
        expectedCurrentStatus: "RECEBIDO", confirmation: true, technicianResponsible: "Técnico",
      }, context()), "INTERNAL_ERROR");
      const current = state(item.item.id, partId, orderId);
      check(() => assert.deepEqual([current.state, Number(current.quantityOnHand), Number(current.quantityReserved), current.status], ["RESERVED", 20, 2, "RECEBIDO"]));
      check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "ServiceOrderTechnicalCommandLog" WHERE "serviceOrderId" = ?`, orderId).n), 0));
    }

    function assertSafe(value) { if (!value || typeof value !== "object") return; for (const [key, child] of Object.entries(value)) { assert.ok(!["idempotencyKey", "operatorId", "responsibleUserId", "paidAmount", "paymentPercent", "paymentReceivedAt"].includes(key)); assertSafe(child); } }
    check(() => assertSafe(controlled));
    check(() => assert.equal("unitCostSnapshot" in controlled.consumedItems[0], false));
    const financialOrder = createOrder(); const financialPart = createPart({ cost: 9 }); reserve(financialOrder, financialPart, 1); const financial = ready(financialOrder, "RECEBIDO", { financial: true });
    check(() => assert.equal(financial.consumedItems[0].unitCostSnapshot, 9));
    check(() => assert.equal(financial.movements[0].unitCostSnapshot, 9));

    const maliciousOrder = createOrder({ id: "order'); DROP TABLE ServiceOrder; --" });
    ready(maliciousOrder, "RECEBIDO", { technician: "Técnico'); DROP TABLE TechnicalPart; --" });
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM sqlite_master WHERE "type" = 'table' AND "name" = 'TechnicalPart'`).n), 1));

    const publicBarrel = require("../../lib/estoqueTecnico/index.ts");
    check(() => assert.equal(typeof publicBarrel.markServiceOrderReadyAndConsumeTechnicalParts, "function"));
    check(() => assert.equal(Object.keys(publicBarrel).some((key) => key.startsWith("__")), false));

    process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
  } finally {
    loaded.restore();
    try { fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
  }
}
