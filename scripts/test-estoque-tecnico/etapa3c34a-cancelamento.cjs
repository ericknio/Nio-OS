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
  Module._extensions[".ts"] = (module, filename) => {
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

function loadModules() {
  const restore = installLoader();
  return {
    restore,
    cancellation: require("../../lib/estoqueTecnico/orderCancellationService.ts"),
    consumption: require("../../lib/estoqueTecnico/orderConsumptionService.ts"),
    mutation: require("../../lib/estoqueTecnico/orderPartMutationService.ts"),
    reservation: require("../../lib/estoqueTecnico/orderPartService.ts"),
    errors: require("../../lib/estoqueTecnico/errors.ts"),
  };
}

function context(key = randomUUID(), operatorId = null, financial = false) {
  return {
    operatorId,
    operatorName: operatorId ? "Operador laboratório" : "Sistema",
    canViewFinancialData: financial,
    idempotencyKey: key,
  };
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

if (!isMainThread && workerData?.worker) {
  const loaded = loadModules();
  try {
    if (workerData.delayMs) sleepSync(workerData.delayMs);

    const cancel = loaded.cancellation.__createOrderCancellationServicesForTests(workerData.location);
    const consume = loaded.consumption.__createOrderConsumptionServicesForTests(workerData.location);
    const mutate = loaded.mutation.__createOrderPartMutationServicesForTests(workerData.location);

    let result;
    if (workerData.operation === "cancel") {
      result = cancel.cancelServiceOrderAndReleaseReservedTechnicalParts(
        workerData.orderId,
        {
          expectedCurrentStatus: "RECEBIDO",
          confirmation: true,
          reason: "Cancelamento concorrente solicitado em laboratório",
        },
        context(),
      );
    } else if (workerData.operation === "change") {
      result = mutate.changeReservedTechnicalPartQuantity(
        workerData.itemId,
        {
          technicalPartVersion: 1,
          expectedQuantity: workerData.quantity,
          newQuantity: workerData.quantity + 1,
          reason: "Alteração concorrente de laboratório",
        },
        context(),
      );
    } else if (workerData.operation === "release") {
      result = mutate.releaseTechnicalPartFromOrder(
        workerData.itemId,
        {
          technicalPartVersion: 1,
          expectedQuantity: workerData.quantity,
          reason: "Liberação concorrente de laboratório",
        },
        context(),
      );
    } else if (workerData.operation === "ready") {
      result = consume.markServiceOrderReadyAndConsumeTechnicalParts(
        workerData.orderId,
        {
          expectedCurrentStatus: "RECEBIDO",
          confirmation: true,
          technicianResponsible: "Técnico concorrência",
        },
        context(),
      );
    } else {
      throw new Error("Operação de worker desconhecida.");
    }

    parentPort.postMessage({ ok: true, replay: Boolean(result?.idempotentReplay) });
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
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-etapa3c34a-expandido-"));
  const databasePath = path.join(temporaryRoot, "laboratorio.db");
  const location = { runtimeRoot: temporaryRoot, databasePath };
  const loaded = loadModules();
  const cancel = loaded.cancellation.__createOrderCancellationServicesForTests(location);
  const consume = loaded.consumption.__createOrderConsumptionServicesForTests(location);
  const mutate = loaded.mutation.__createOrderPartMutationServicesForTests(location);
  const reserveService = loaded.reservation.__createOrderPartServicesForTests(location);

  let assertions = 0;
  let osNumber = 990000;
  const check = (fn) => { fn(); assertions += 1; };
  const expectCode = (fn, code) => {
    assert.throws(fn, (error) => error instanceof loaded.errors.StockDomainError && error.code === code);
    assertions += 1;
  };

  function db(options) {
    const database = options ? new DatabaseSync(databasePath, options) : new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    return database;
  }

  function scalar(sql, ...params) {
    const database = db();
    const row = database.prepare(sql).get(...params);
    database.close();
    return row;
  }

  function exec(sql, ...params) {
    const database = db();
    const result = database.prepare(sql).run(...params);
    database.close();
    return result;
  }

  function createOrder(input = {}) {
    const id = input.id || randomUUID();
    const database = db();
    database.prepare(`INSERT INTO "ServiceOrder" (
      "id", "osNumber", "customerId", "equipmentType", "reportedDefect", "requiredParts",
      "partsCost", "laborCost", "discount", "totalAmount", "paymentMethod", "status",
      "paidAmount", "paymentPercent", "paymentReceivedAt", "finalizedAt", "createdAt", "updatedAt"
    ) VALUES (?, ?, 'etapa3c34a-customer', 'OUTRO', 'Teste', ?, ?, ?, ?, ?,
      'AGUARDANDO_PAGAMENTO', ?, 0, 0, NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(
        id,
        osNumber++,
        input.requiredParts ?? null,
        input.partsCost ?? 0,
        input.laborCost ?? 0,
        input.discount ?? 0,
        input.totalAmount ?? 0,
        input.status ?? "RECEBIDO",
        input.finalizedAt ?? null,
      );
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
      .run(
        id,
        input.name || "Peça teste",
        input.onHand === undefined ? 20 : input.onHand,
        input.cost ?? 4,
        input.active === false ? 0 : 1,
      );
    database.close();
    return id;
  }

  function reserve(orderId, partId, quantity = 2, unitPrice = 10, options = {}) {
    const current = scalar(`SELECT "version" FROM "TechnicalPart" WHERE "id" = ?`, partId);
    return reserveService.reserveTechnicalPartForOrder(
      orderId,
      {
        technicalPartId: partId,
        technicalPartVersion: Number(current.version),
        quantity,
        unitPrice,
        ...(options.confirmReplaceLegacyPartsCost ? { confirmReplaceLegacyPartsCost: true } : {}),
      },
      context(options.key || randomUUID(), options.operatorId ?? null, options.financial ?? false),
    );
  }

  function cancelOrder(orderId, expectedCurrentStatus = "RECEBIDO", options = {}) {
    return cancel.cancelServiceOrderAndReleaseReservedTechnicalParts(
      orderId,
      {
        expectedCurrentStatus,
        confirmation: true,
        reason: options.reason || "Cancelamento solicitado pelo cliente no laboratório",
      },
      context(options.key || randomUUID(), options.operatorId ?? null, options.financial ?? false),
    );
  }

  function runWorker(operation, data = {}) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: { worker: true, location, operation, ...data },
      });
      worker.once("message", resolve);
      worker.once("error", reject);
    });
  }

  function partState(partId) {
    return scalar(`SELECT "quantityOnHand", "quantityReserved", "version", "isActive"
      FROM "TechnicalPart" WHERE "id" = ?`, partId);
  }

  function itemState(itemId) {
    return scalar(`SELECT "state", "quantity", "serviceOrderId", "technicalPartId"
      FROM "ServiceOrderPart" WHERE "id" = ?`, itemId);
  }

  function orderState(orderId) {
    return scalar(`SELECT "status", "partsCost", "laborCost", "discount", "totalAmount", "requiredParts"
      FROM "ServiceOrder" WHERE "id" = ?`, orderId);
  }

  function countRelease(itemId) {
    return Number(scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement"
      WHERE "serviceOrderPartId" = ? AND "type" = 'RELEASE'`, itemId).n);
  }

  function countHistory(orderId, action) {
    return Number(scalar(`SELECT COUNT(*) AS n FROM "OrderHistory"
      WHERE "serviceOrderId" = ? AND "action" = ?`, orderId, action).n);
  }

  function countCancelCommand(orderId) {
    return Number(scalar(`SELECT COUNT(*) AS n FROM "ServiceOrderTechnicalCommandLog"
      WHERE "serviceOrderId" = ? AND "operation" = 'RELEASE_ON_CANCEL'`, orderId).n);
  }

  function assertNoSensitiveKeys(value) {
    const forbidden = new Set([
      "currentCostPrice",
      "unitCostSnapshot",
      "totalCostSnapshot",
      "idempotencyKey",
      "operatorId",
      "responsibleUserId",
    ]);
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      for (const [key, nested] of Object.entries(node)) {
        assert.equal(forbidden.has(key), false, `Campo sensível inesperado: ${key}`);
        visit(nested);
      }
    };
    visit(value);
  }

  function createFinalization(orderId) {
    exec(`INSERT INTO "OrderFinalization" (
      "id", "serviceOrderId", "repairDescription", "replacedParts", "finalAmount",
      "warrantyDays", "deliveredAt", "deliveredBy", "paymentMethod", "finalNotes",
      "createdAt", "updatedAt"
    ) VALUES (?, ?, 'Finalização laboratório', NULL, 0, 0, CURRENT_TIMESTAMP,
      'Operador laboratório', 'DINHEIRO', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      randomUUID(), orderId);
  }

  function simulateConsumed(itemId, partId) {
    const item = itemState(itemId);
    const before = partState(partId);
    const quantity = Number(item.quantity);
    assert.ok(before.quantityOnHand !== null, "Fixture de consumo exige estoque controlado.");
    exec(`UPDATE "TechnicalPart" SET
      "quantityOnHand" = "quantityOnHand" - ?,
      "quantityReserved" = "quantityReserved" - ?,
      "version" = "version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ?`, quantity, quantity, partId);
    exec(`UPDATE "ServiceOrderPart" SET "state" = 'CONSUMED', "consumedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`, itemId);
  }

  function assertExactlyOneSuccess(results) {
    const successes = results.filter((result) => result.ok);
    assert.equal(successes.length, 1, `Esperava 1 sucesso, obtive ${JSON.stringify(results)}`);
  }

  try {
    fs.copyFileSync(path.join(root, "data", "nio-os.db"), databasePath);
    applyMigrations(databasePath, { logger: () => undefined });

    let database = db();
    database.prepare(`INSERT OR IGNORE INTO "Customer" ("id", "name", "createdAt", "updatedAt")
      VALUES ('etapa3c34a-customer', 'Cliente teste', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run();
    database.prepare(`INSERT OR IGNORE INTO "SystemUser" (
      "id", "name", "username", "passwordHash", "role", "status", "createdAt", "updatedAt"
    ) VALUES ('etapa3c34a-user-a', 'Operador A', 'etapa3c34a-user-a', 'hash-teste', 'ADMIN', 'ATIVO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run();
    database.prepare(`INSERT OR IGNORE INTO "SystemUser" (
      "id", "name", "username", "passwordHash", "role", "status", "createdAt", "updatedAt"
    ) VALUES ('etapa3c34a-user-b', 'Operador B', 'etapa3c34a-user-b', 'hash-teste', 'ADMIN', 'ATIVO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run();
    database.close();

    // 1) Cancelamento sem peças.
    const emptyOrder = createOrder();
    const emptyResult = cancelOrder(emptyOrder);
    check(() => assert.equal(emptyResult.order.status, "CANCELADO"));
    check(() => assert.deepEqual([emptyResult.affectedItems, emptyResult.affectedUnits], [0, 0]));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement" m
      JOIN "ServiceOrderPart" i ON i."id" = m."serviceOrderPartId"
      WHERE i."serviceOrderId" = ? AND m."type" = 'RELEASE'`, emptyOrder).n), 0));
    check(() => assert.equal(countCancelCommand(emptyOrder), 1));
    check(() => assert.equal(countHistory(emptyOrder, "CANCELAMENTO_OS"), 1));
    check(() => assert.equal(countHistory(emptyOrder, "PECAS_TECNICAS_LIBERADAS_CANCELAMENTO"), 0));

    // 2) Cenário misto: CONSUMED + RESERVED.
    const mixedOrder = createOrder({ laborCost: 20, discount: 10, requiredParts: "Texto legado deve permanecer" });
    const consumedPart = createPart({ onHand: 10, cost: 25, name: "Consumida" });
    const reservedPart = createPart({ onHand: 10, cost: 5, name: "Reservada" });
    const consumedItem = reserve(mixedOrder, consumedPart, 1, 100);
    const reservedItem = reserve(mixedOrder, reservedPart, 1, 50);
    simulateConsumed(consumedItem.item.id, consumedPart);
    const mixedBeforeConsumedPhysical = Number(partState(consumedPart).quantityOnHand);
    const mixedBeforeReservedPhysical = Number(partState(reservedPart).quantityOnHand);
    const mixed = cancelOrder(mixedOrder);
    check(() => assert.equal(itemState(consumedItem.item.id).state, "CONSUMED"));
    check(() => assert.equal(itemState(reservedItem.item.id).state, "RELEASED"));
    check(() => assert.equal(Number(partState(consumedPart).quantityOnHand), mixedBeforeConsumedPhysical));
    check(() => assert.equal(Number(partState(reservedPart).quantityOnHand), mixedBeforeReservedPhysical));
    check(() => assert.equal(countRelease(consumedItem.item.id), 0));
    check(() => assert.equal(countRelease(reservedItem.item.id), 1));
    check(() => assert.equal(Number(orderState(mixedOrder).partsCost), 100));
    check(() => assert.equal(Number(orderState(mixedOrder).totalAmount), 110));
    check(() => assert.equal(orderState(mixedOrder).requiredParts, "Texto legado deve permanecer"));
    check(() => assert.deepEqual([mixed.affectedItems, mixed.affectedUnits], [1, 1]));

    // 3) Múltiplas reservas.
    const multiOrder = createOrder();
    const multiPartA = createPart({ onHand: 10, name: "A" });
    const multiPartB = createPart({ onHand: 10, name: "B" });
    const multiA = reserve(multiOrder, multiPartA, 2, 10);
    const multiB = reserve(multiOrder, multiPartB, 3, 20);
    const multi = cancelOrder(multiOrder);
    check(() => assert.deepEqual([multi.affectedItems, multi.affectedUnits], [2, 5]));
    check(() => assert.deepEqual([itemState(multiA.item.id).state, itemState(multiB.item.id).state], ["RELEASED", "RELEASED"]));
    check(() => assert.deepEqual([Number(partState(multiPartA).quantityReserved), Number(partState(multiPartB).quantityReserved)], [0, 0]));
    check(() => assert.deepEqual([countRelease(multiA.item.id), countRelease(multiB.item.id)], [1, 1]));

    // 4) Status e finalização.
    for (const status of ["CANCELADO", "ENTREGUE"]) {
      const blocked = createOrder({ status });
      expectCode(() => cancelOrder(blocked, status), "ORDER_NOT_MUTABLE");
      check(() => assert.equal(orderState(blocked).status, status));
    }
    const finalizedAtOrder = createOrder({ finalizedAt: new Date().toISOString() });
    expectCode(() => cancelOrder(finalizedAtOrder), "ORDER_NOT_MUTABLE");
    check(() => assert.equal(orderState(finalizedAtOrder).status, "RECEBIDO"));
    const finalizationOrder = createOrder();
    createFinalization(finalizationOrder);
    expectCode(() => cancelOrder(finalizationOrder), "ORDER_NOT_MUTABLE");
    check(() => assert.equal(orderState(finalizationOrder).status, "RECEBIDO"));
    const statusConflictOrder = createOrder();
    expectCode(() => cancelOrder(statusConflictOrder, "EM_ANALISE"), "ORDER_STATUS_CONFLICT");
    check(() => assert.equal(orderState(statusConflictOrder).status, "RECEBIDO"));

    // 5) Inconsistências estruturais devem bloquear antes de qualquer cancelamento.
    const insufficientReservedOrder = createOrder();
    const insufficientReservedPart = createPart({ onHand: 10 });
    const insufficientReservedItem = reserve(insufficientReservedOrder, insufficientReservedPart, 2);
    exec(`UPDATE "TechnicalPart" SET "quantityReserved" = 1 WHERE "id" = ?`, insufficientReservedPart);
    expectCode(() => cancelOrder(insufficientReservedOrder), "STOCK_INVARIANT_VIOLATION");
    check(() => assert.equal(orderState(insufficientReservedOrder).status, "RECEBIDO"));
    check(() => assert.equal(itemState(insufficientReservedItem.item.id).state, "RESERVED"));
    check(() => assert.equal(countRelease(insufficientReservedItem.item.id), 0));

    const missingPartOrder = createOrder();
    const missingPart = createPart({ onHand: 10 });
    const missingPartItem = reserve(missingPartOrder, missingPart, 1);
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = OFF");
    database.prepare(`DELETE FROM "TechnicalPart" WHERE "id" = ?`).run(missingPart);
    database.close();
    expectCode(() => cancelOrder(missingPartOrder), "TECHNICAL_PART_NOT_FOUND");
    check(() => assert.equal(orderState(missingPartOrder).status, "RECEBIDO"));
    check(() => assert.equal(itemState(missingPartItem.item.id).state, "RESERVED"));

    // O cenário acima cria deliberadamente uma FK órfã para simular peça ausente.
    // Restauramos a peça antes de seguir, porque withImmediateTransaction executa
    // foreign_key_check global e a violação proposital contaminaria os testes seguintes.
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = OFF");
    database.prepare(`INSERT INTO "TechnicalPart" (
      "id", "name", "quantityOnHand", "quantityReserved", "minStock", "currentCostPrice",
      "defaultSalePrice", "isActive", "version", "createdAt", "updatedAt"
    ) VALUES (?, ?, 10, 1, 0, 4, 0, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(missingPart, "Peça restaurada após teste de ausência");
    database.close();

    // Corrupção controlada: item passa a apontar para outra peça. O serviço deve
    // detectar a divergência histórica em vez de liberar a peça errada.
    const divergentOrder = createOrder();
    const divergentOriginalPart = createPart({ onHand: 10, name: "Original" });
    const divergentOtherPart = createPart({ onHand: 10, name: "Outra" });
    const divergentItem = reserve(divergentOrder, divergentOriginalPart, 1);
    exec(`UPDATE "TechnicalPart" SET "quantityReserved" = 1 WHERE "id" = ?`, divergentOtherPart);
    exec(`UPDATE "ServiceOrderPart" SET "technicalPartId" = ? WHERE "id" = ?`, divergentOtherPart, divergentItem.item.id);
    expectCode(() => cancelOrder(divergentOrder), "STOCK_INVARIANT_VIOLATION");
    check(() => assert.equal(orderState(divergentOrder).status, "RECEBIDO"));
    check(() => assert.equal(Number(partState(divergentOriginalPart).quantityReserved), 1));
    check(() => assert.equal(Number(partState(divergentOtherPart).quantityReserved), 1));

    // 6) Idempotência completa + operador diferente.
    const replayOrder = createOrder();
    const replayPart = createPart({ onHand: 12 });
    const replayItem = reserve(replayOrder, replayPart, 2, 15);
    const replayKey = randomUUID();
    const replayInputReason = "Cancelamento idempotente solicitado no laboratório";
    const first = cancelOrder(replayOrder, "RECEBIDO", { key: replayKey, reason: replayInputReason, operatorId: "etapa3c34a-user-a" });
    const firstHistory = countHistory(replayOrder, "CANCELAMENTO_OS");
    const firstTechnicalHistory = countHistory(replayOrder, "PECAS_TECNICAS_LIBERADAS_CANCELAMENTO");
    const firstVersion = Number(partState(replayPart).version);
    const replay = cancelOrder(replayOrder, "RECEBIDO", { key: replayKey, reason: replayInputReason, operatorId: "etapa3c34a-user-a" });
    check(() => assert.equal(first.idempotentReplay, false));
    check(() => assert.equal(replay.idempotentReplay, true));
    check(() => assert.equal(countRelease(replayItem.item.id), 1));
    check(() => assert.equal(Number(partState(replayPart).quantityReserved), 0));
    check(() => assert.equal(Number(partState(replayPart).version), firstVersion));
    check(() => assert.equal(countHistory(replayOrder, "CANCELAMENTO_OS"), firstHistory));
    check(() => assert.equal(countHistory(replayOrder, "PECAS_TECNICAS_LIBERADAS_CANCELAMENTO"), firstTechnicalHistory));
    expectCode(
      () => cancelOrder(replayOrder, "RECEBIDO", { key: replayKey, reason: "Payload diferente e incompatível com replay", operatorId: "etapa3c34a-user-a" }),
      "IDEMPOTENCY_KEY_REUSED",
    );
    // Mesmo UUID externo, mas outro operador: não pode virar replay do operador A.
    expectCode(
      () => cancelOrder(replayOrder, "RECEBIDO", { key: replayKey, reason: replayInputReason, operatorId: "etapa3c34a-user-b" }),
      "ORDER_STATUS_CONFLICT",
    );

    // 7) Replay após reabertura simulada.
    exec(`UPDATE "ServiceOrder" SET "status" = 'EM_REPARO', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`, replayOrder);
    const historyBeforeReopenReplay = Number(scalar(`SELECT COUNT(*) AS n FROM "OrderHistory" WHERE "serviceOrderId" = ?`, replayOrder).n);
    const commandBeforeReopenReplay = countCancelCommand(replayOrder);
    const reopenedReplay = cancelOrder(replayOrder, "RECEBIDO", { key: replayKey, reason: replayInputReason, operatorId: "etapa3c34a-user-a" });
    check(() => assert.equal(reopenedReplay.idempotentReplay, true));
    check(() => assert.equal(orderState(replayOrder).status, "EM_REPARO"));
    check(() => assert.equal(countRelease(replayItem.item.id), 1));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "OrderHistory" WHERE "serviceOrderId" = ?`, replayOrder).n), historyBeforeReopenReplay));
    check(() => assert.equal(countCancelCommand(replayOrder), commandBeforeReopenReplay));

    // 8) Peça inativa.
    const inactiveOrder = createOrder();
    const inactivePart = createPart({ onHand: 10 });
    const inactiveItem = reserve(inactiveOrder, inactivePart, 1);
    exec(`UPDATE "TechnicalPart" SET "isActive" = 0 WHERE "id" = ?`, inactivePart);
    const inactiveBefore = partState(inactivePart);
    cancelOrder(inactiveOrder);
    const inactiveAfter = partState(inactivePart);
    check(() => assert.equal(itemState(inactiveItem.item.id).state, "RELEASED"));
    check(() => assert.equal(Number(inactiveAfter.quantityOnHand), Number(inactiveBefore.quantityOnHand)));
    check(() => assert.equal(Number(inactiveAfter.quantityReserved), 0));
    check(() => assert.equal(Number(inactiveAfter.version), Number(inactiveBefore.version) + 1));
    check(() => assert.equal(countRelease(inactiveItem.item.id), 1));

    // 9) Estoque ilimitado.
    const unlimitedOrder = createOrder();
    const unlimitedPart = createPart({ onHand: null });
    const unlimitedItem = reserve(unlimitedOrder, unlimitedPart, 2);
    cancelOrder(unlimitedOrder);
    const unlimitedState = partState(unlimitedPart);
    const unlimitedMovement = scalar(`SELECT "onHandBefore", "onHandAfter", "reservedBefore", "reservedAfter"
      FROM "TechnicalPartMovement" WHERE "serviceOrderPartId" = ? AND "type" = 'RELEASE'`, unlimitedItem.item.id);
    check(() => assert.equal(unlimitedState.quantityOnHand, null));
    check(() => assert.equal(Number(unlimitedState.quantityReserved), 0));
    check(() => assert.deepEqual([unlimitedMovement.onHandBefore, unlimitedMovement.onHandAfter], [null, null]));
    check(() => assert.deepEqual([Number(unlimitedMovement.reservedBefore), Number(unlimitedMovement.reservedAfter)], [2, 0]));

    // 10) Rollback em todos os pontos suportados.
    for (const failAfter of ["after_part", "after_item", "after_movement", "after_status", "after_history"]) {
      process.stdout.write(`[3C.3.4A rollback] ${failAfter}\n`);
      const rollbackOrder = createOrder({ laborCost: 12, discount: 2 });
      const rollbackPart = createPart({ onHand: 10 });
      const rollbackItem = reserve(rollbackOrder, rollbackPart, 2, 15);
      const beforePart = partState(rollbackPart);
      const beforeItem = itemState(rollbackItem.item.id);
      const beforeOrder = orderState(rollbackOrder);
      const beforeCancelHistory = countHistory(rollbackOrder, "CANCELAMENTO_OS");
      const beforeTechnicalHistory = countHistory(rollbackOrder, "PECAS_TECNICAS_LIBERADAS_CANCELAMENTO");
      const failing = loaded.cancellation.__createOrderCancellationServicesForTests(location, { failAfter });
      expectCode(
        () => failing.cancelServiceOrderAndReleaseReservedTechnicalParts(
          rollbackOrder,
          { expectedCurrentStatus: "RECEBIDO", confirmation: true, reason: `Falha controlada ${failAfter} para validar rollback` },
          context(),
        ),
        "INTERNAL_ERROR",
      );
      const afterPart = partState(rollbackPart);
      const afterItem = itemState(rollbackItem.item.id);
      const afterOrder = orderState(rollbackOrder);
      check(() => assert.deepEqual(
        [afterPart.quantityOnHand, Number(afterPart.quantityReserved), Number(afterPart.version)],
        [beforePart.quantityOnHand, Number(beforePart.quantityReserved), Number(beforePart.version)],
      ));
      check(() => assert.deepEqual([afterItem.state, Number(afterItem.quantity)], [beforeItem.state, Number(beforeItem.quantity)]));
      check(() => assert.deepEqual(
        [afterOrder.status, Number(afterOrder.partsCost), Number(afterOrder.totalAmount)],
        [beforeOrder.status, Number(beforeOrder.partsCost), Number(beforeOrder.totalAmount)],
      ));
      check(() => assert.equal(countRelease(rollbackItem.item.id), 0));
      check(() => assert.equal(countCancelCommand(rollbackOrder), 0));
      check(() => assert.equal(countHistory(rollbackOrder, "CANCELAMENTO_OS"), beforeCancelHistory));
      check(() => assert.equal(countHistory(rollbackOrder, "PECAS_TECNICAS_LIBERADAS_CANCELAMENTO"), beforeTechnicalHistory));
    }

    // 11) Concorrência real.
    const raceCancelOrder = createOrder();
    const raceCancelPart = createPart({ onHand: 10 });
    const raceCancelItem = reserve(raceCancelOrder, raceCancelPart, 2);
    let race = await Promise.all([
      runWorker("cancel", { orderId: raceCancelOrder }),
      runWorker("cancel", { orderId: raceCancelOrder }),
    ]);
    check(() => assertExactlyOneSuccess(race));
    check(() => assert.equal(orderState(raceCancelOrder).status, "CANCELADO"));
    check(() => assert.equal(countRelease(raceCancelItem.item.id), 1));
    check(() => assert.equal(Number(partState(raceCancelPart).quantityReserved), 0));

    const raceChangeOrder = createOrder();
    const raceChangePart = createPart({ onHand: 10 });
    const raceChangeItem = reserve(raceChangeOrder, raceChangePart, 2);
    race = await Promise.all([
      runWorker("cancel", { orderId: raceChangeOrder }),
      runWorker("change", { itemId: raceChangeItem.item.id, quantity: 2, delayMs: 350 }),
    ]);
    check(() => assertExactlyOneSuccess(race));
    check(() => assert.equal(orderState(raceChangeOrder).status, "CANCELADO"));
    check(() => assert.equal(itemState(raceChangeItem.item.id).state, "RELEASED"));
    check(() => assert.equal(Number(partState(raceChangePart).quantityReserved), 0));

    const raceReleaseOrder = createOrder();
    const raceReleasePart = createPart({ onHand: 10 });
    const raceReleaseItem = reserve(raceReleaseOrder, raceReleasePart, 2);
    race = await Promise.all([
      runWorker("cancel", { orderId: raceReleaseOrder }),
      runWorker("release", { itemId: raceReleaseItem.item.id, quantity: 2, delayMs: 350 }),
    ]);
    check(() => assertExactlyOneSuccess(race));
    check(() => assert.equal(orderState(raceReleaseOrder).status, "CANCELADO"));
    check(() => assert.equal(itemState(raceReleaseItem.item.id).state, "RELEASED"));
    check(() => assert.equal(countRelease(raceReleaseItem.item.id), 1));

    const raceReadyOrder = createOrder();
    const raceReadyPart = createPart({ onHand: 10 });
    const raceReadyItem = reserve(raceReadyOrder, raceReadyPart, 2);
    race = await Promise.all([
      runWorker("cancel", { orderId: raceReadyOrder }),
      runWorker("ready", { orderId: raceReadyOrder, delayMs: 350 }),
    ]);
    check(() => assertExactlyOneSuccess(race));
    check(() => assert.equal(orderState(raceReadyOrder).status, "CANCELADO"));
    check(() => assert.equal(itemState(raceReadyItem.item.id).state, "RELEASED"));
    check(() => assert.equal(countRelease(raceReadyItem.item.id), 1));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement"
      WHERE "serviceOrderPartId" = ? AND "type" = 'CONSUMPTION'`, raceReadyItem.item.id).n), 0));
    check(() => assert.equal(Number(partState(raceReadyPart).quantityOnHand), 10));

    // 12) Totais após cancelamento misto já verificados: reforço explícito da fórmula.
    const mixedTotals = orderState(mixedOrder);
    check(() => assert.equal(Number(mixedTotals.partsCost), 100));
    check(() => assert.equal(Number(mixedTotals.totalAmount), Math.max(100 + 20 - 10, 0)));

    // 13) Sanitização recursiva.
    const sanitizedOrder = createOrder();
    const sanitizedPart = createPart({ onHand: 10, cost: 99 });
    reserve(sanitizedOrder, sanitizedPart, 1, 25);
    const sanitizedResult = cancelOrder(sanitizedOrder, "RECEBIDO", { financial: false });
    check(() => assert.doesNotThrow(() => assertNoSensitiveKeys(sanitizedResult)));
    check(() => assert.equal(Object.prototype.hasOwnProperty.call(sanitizedResult.order, "paidAmount"), false));
    check(() => assert.equal(Object.prototype.hasOwnProperty.call(sanitizedResult.order, "paymentPercent"), false));

    // 14) SQL injection permanece dado + replay continua íntegro.
    const injectionOrder = createOrder();
    const injectionPart = createPart({ onHand: 10 });
    const injectionItem = reserve(injectionOrder, injectionPart, 1);
    const injectionKey = randomUUID();
    const injectionReason = `Motivo seguro com aspas ' e tentativa -- ; % _ que deve permanecer apenas texto`;
    cancelOrder(injectionOrder, "RECEBIDO", { key: injectionKey, reason: injectionReason });
    check(() => assert.equal(orderState(injectionOrder).status, "CANCELADO"));
    check(() => assert.equal(countRelease(injectionItem.item.id), 1));
    check(() => assert.equal(Number(scalar(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='Customer'`).n), 1));
    const injectionHistory = scalar(`SELECT "description" FROM "OrderHistory"
      WHERE "serviceOrderId" = ? AND "action" = 'CANCELAMENTO_OS'`, injectionOrder);
    check(() => assert.equal(String(injectionHistory.description).includes("-- ; % _"), true));
    const injectionReplay = cancelOrder(injectionOrder, "RECEBIDO", { key: injectionKey, reason: injectionReason });
    check(() => assert.equal(injectionReplay.idempotentReplay, true));
    check(() => assert.equal(countRelease(injectionItem.item.id), 1));

    process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
  } finally {
    loaded.restore();
    try {
      fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {}
  }
}
