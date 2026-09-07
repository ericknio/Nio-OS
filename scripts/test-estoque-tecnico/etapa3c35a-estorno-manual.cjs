#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("node:worker_threads");
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
    reversal: require("../../lib/estoqueTecnico/orderReversalService.ts"),
    consumption: require("../../lib/estoqueTecnico/orderConsumptionService.ts"),
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

if (!isMainThread && workerData?.worker) {
  const loaded = loadModules();
  try {
    if (workerData.delayMs) {
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        workerData.delayMs,
      );
    }

    const reversal =
      loaded.reversal.__createOrderReversalServicesForTests(workerData.location);

    let version;
    if (workerData.version !== undefined) {
      version = Number(workerData.version);
    } else {
      const current = new DatabaseSync(workerData.location.databasePath);
      version = Number(
        current.prepare(`SELECT "version" FROM "TechnicalPart" WHERE "id" = ?`)
          .get(workerData.partId).version,
      );
      current.close();
    }

    const result = reversal.reverseConsumedTechnicalPartManually(
      workerData.itemId,
      {
        technicalPartVersion: version,
        expectedQuantity: workerData.quantity,
        physicalReturnConfirmed: true,
        confirmation: true,
        reason: "Retorno físico confirmado em concorrência de laboratório",
      },
      context(workerData.key || randomUUID()),
    );

    parentPort.postMessage({
      ok: true,
      replay: Boolean(result.idempotentReplay),
    });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      code: error?.code || "INTERNAL_ERROR",
    });
  } finally {
    loaded.restore();
  }
} else {
  void main();
}

async function main() {
  const root = path.resolve(__dirname, "..", "..");
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "nio-etapa3c35a-"),
  );
  const databasePath = path.join(temporaryRoot, "laboratorio.db");
  const location = { runtimeRoot: temporaryRoot, databasePath };
  const loaded = loadModules();

  const reversal =
    loaded.reversal.__createOrderReversalServicesForTests(location);
  const consumption =
    loaded.consumption.__createOrderConsumptionServicesForTests(location);
  const reservation =
    loaded.reservation.__createOrderPartServicesForTests(location);

  let assertions = 0;
  let osNumber = 995000;
  const check = (fn) => { fn(); assertions += 1; };
  const expectCode = (fn, code) => {
    assert.throws(
      fn,
      (error) =>
        error instanceof loaded.errors.StockDomainError &&
        error.code === code,
    );
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
      "id", "osNumber", "customerId", "equipmentType", "reportedDefect",
      "partsCost", "laborCost", "discount", "totalAmount", "paymentMethod",
      "status", "paidAmount", "paymentPercent", "paymentReceivedAt",
      "finalizedAt", "createdAt", "updatedAt"
    ) VALUES (?, ?, 'etapa3c35a-customer', 'OUTRO', 'Teste',
      0, ?, ?, ?, 'AGUARDANDO_PAGAMENTO', ?, ?, ?, ?, ?,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(
        id,
        osNumber++,
        input.laborCost ?? 0,
        input.discount ?? 0,
        input.totalAmount ?? 0,
        input.status ?? "RECEBIDO",
        input.paidAmount ?? 0,
        input.paymentPercent ?? 0,
        input.paymentReceivedAt ?? null,
        input.finalizedAt ?? null,
      );
    database.close();
    return id;
  }

  function createPart(input = {}) {
    const id = input.id || randomUUID();
    const database = db();
    database.prepare(`INSERT INTO "TechnicalPart" (
      "id", "name", "quantityOnHand", "quantityReserved", "minStock",
      "currentCostPrice", "defaultSalePrice", "isActive", "version",
      "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, 0, 0, ?, 0, ?, 0,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(
        id,
        input.name || "Peça técnica",
        input.onHand === undefined ? 20 : input.onHand,
        input.cost ?? 4,
        input.active === false ? 0 : 1,
      );
    database.close();
    return id;
  }

  function reserve(orderId, partId, quantity = 2, unitPrice = 10) {
    const current = scalar(
      `SELECT "version" FROM "TechnicalPart" WHERE "id" = ?`,
      partId,
    );
    return reservation.reserveTechnicalPartForOrder(
      orderId,
      {
        technicalPartId: partId,
        technicalPartVersion: Number(current.version),
        quantity,
        unitPrice,
      },
      context(),
    );
  }

  function ready(orderId, expected = "RECEBIDO") {
    return consumption.markServiceOrderReadyAndConsumeTechnicalParts(
      orderId,
      {
        expectedCurrentStatus: expected,
        confirmation: true,
        technicianResponsible: "Técnico laboratório",
      },
      context(),
    );
  }

  function consumeFixture(input = {}) {
    const orderId = createOrder({
      laborCost: input.laborCost ?? 0,
      discount: input.discount ?? 0,
    });
    const partId = createPart({
      onHand: input.onHand === undefined ? 20 : input.onHand,
      cost: input.cost ?? 4,
      name: input.name,
    });
    const reserved = reserve(
      orderId,
      partId,
      input.quantity ?? 2,
      input.unitPrice ?? 10,
    );
    ready(orderId);
    return { orderId, partId, itemId: reserved.item.id };
  }

  function reverse(itemId, partId, options = {}) {
    const current = scalar(
      `SELECT "version" FROM "TechnicalPart" WHERE "id" = ?`,
      partId,
    );
    const item = scalar(
      `SELECT "quantity" FROM "ServiceOrderPart" WHERE "id" = ?`,
      itemId,
    );
    return reversal.reverseConsumedTechnicalPartManually(
      itemId,
      {
        technicalPartVersion:
          options.version ?? Number(current.version),
        expectedQuantity:
          options.quantity ?? Number(item.quantity),
        physicalReturnConfirmed:
          options.physicalReturnConfirmed ?? true,
        confirmation: options.confirmation ?? true,
        reason:
          options.reason ||
          "Peça devolvida fisicamente ao estoque após conferência",
      },
      context(
        options.key || randomUUID(),
        options.operatorId ?? null,
        options.financial ?? false,
      ),
    );
  }

  function itemState(itemId) {
    return scalar(`SELECT "state", "quantity", "consumedAt", "releasedAt",
      "reversedAt", "technicalPartId", "serviceOrderId"
      FROM "ServiceOrderPart" WHERE "id" = ?`, itemId);
  }

  function partState(partId) {
    return scalar(`SELECT "quantityOnHand", "quantityReserved", "version",
      "isActive" FROM "TechnicalPart" WHERE "id" = ?`, partId);
  }

  function orderState(orderId) {
    return scalar(`SELECT "status", "partsCost", "laborCost", "discount",
      "totalAmount", "paidAmount", "paymentPercent", "paymentReceivedAt",
      "finalizedAt" FROM "ServiceOrder" WHERE "id" = ?`, orderId);
  }

  function countMovement(itemId, type) {
    return Number(
      scalar(`SELECT COUNT(*) AS n FROM "TechnicalPartMovement"
        WHERE "serviceOrderPartId" = ? AND "type" = ?`, itemId, type).n,
    );
  }

  function countHistory(orderId) {
    return Number(
      scalar(`SELECT COUNT(*) AS n FROM "OrderHistory"
        WHERE "serviceOrderId" = ?
          AND "action" = 'PECA_TECNICA_ESTORNO_MANUAL'`, orderId).n,
    );
  }

  function countCommand(orderId) {
    return Number(
      scalar(`SELECT COUNT(*) AS n FROM "ServiceOrderTechnicalCommandLog"
        WHERE "serviceOrderId" = ?
          AND "operation" = 'MANUAL_REVERSAL'`, orderId).n,
    );
  }

  function runWorker(itemId, partId, quantity, key, version) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: {
          worker: true,
          location,
          itemId,
          partId,
          quantity,
          key,
          version,
        },
      });
      worker.once("message", resolve);
      worker.once("error", reject);
    });
  }

  function assertNoSensitiveKeys(value) {
    const blocked = new Set([
      "unitCostSnapshot",
      "totalCostSnapshot",
      "idempotencyKey",
      "operatorId",
      "responsibleUserId",
    ]);
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      for (const [key, child] of Object.entries(node)) {
        assert.equal(blocked.has(key), false, `Campo sensível exposto: ${key}`);
        visit(child);
      }
    };
    visit(value);
  }

  try {
    fs.copyFileSync(
      path.join(root, "data", "nio-os.db"),
      databasePath,
    );
    applyMigrations(databasePath, { logger: () => undefined });

    let database = db();
    database.prepare(`INSERT OR IGNORE INTO "Customer"
      ("id", "name", "createdAt", "updatedAt")
      VALUES ('etapa3c35a-customer', 'Cliente laboratório',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run();
    database.prepare(`INSERT OR IGNORE INTO "SystemUser" (
      "id", "name", "username", "passwordHash", "role", "status",
      "createdAt", "updatedAt"
    ) VALUES (
      'etapa3c35a-user-a', 'Operador A', 'etapa3c35a-user-a',
      'hash-teste', 'ADMIN', 'ATIVO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )`).run();
    database.prepare(`INSERT OR IGNORE INTO "SystemUser" (
      "id", "name", "username", "passwordHash", "role", "status",
      "createdAt", "updatedAt"
    ) VALUES (
      'etapa3c35a-user-b', 'Operador B', 'etapa3c35a-user-b',
      'hash-teste', 'ADMIN', 'ATIVO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )`).run();
    database.close();

    // 1) Controlado: devolução física integral, reservado inalterado e recálculo.
    const controlled = consumeFixture({
      onHand: 10,
      quantity: 2,
      unitPrice: 15,
      laborCost: 20,
      discount: 5,
      cost: 7,
    });
    const beforeControlled = partState(controlled.partId);
    check(() => assert.deepEqual(
      [Number(beforeControlled.quantityOnHand), Number(beforeControlled.quantityReserved)],
      [8, 0],
    ));
    const controlledResult = reverse(
      controlled.itemId,
      controlled.partId,
      { financial: true },
    );
    const afterControlled = partState(controlled.partId);
    const controlledItem = itemState(controlled.itemId);
    const controlledOrder = orderState(controlled.orderId);
    const controlledMovement = scalar(`SELECT "type", "quantity",
      "onHandBefore", "onHandAfter", "reservedBefore", "reservedAfter",
      "unitCostSnapshot", "reason"
      FROM "TechnicalPartMovement"
      WHERE "serviceOrderPartId" = ? AND "type" = 'MANUAL_REVERSAL'`,
      controlled.itemId);
    check(() => assert.deepEqual(
      [Number(afterControlled.quantityOnHand), Number(afterControlled.quantityReserved)],
      [10, 0],
    ));
    check(() => assert.equal(Number(afterControlled.version), Number(beforeControlled.version) + 1));
    check(() => assert.equal(controlledItem.state, "REVERSED"));
    check(() => assert.ok(controlledItem.consumedAt));
    check(() => assert.ok(controlledItem.reversedAt));
    check(() => assert.equal(controlledItem.releasedAt, null));
    check(() => assert.deepEqual(
      [
        controlledMovement.type,
        Number(controlledMovement.quantity),
        Number(controlledMovement.onHandBefore),
        Number(controlledMovement.onHandAfter),
        Number(controlledMovement.reservedBefore),
        Number(controlledMovement.reservedAfter),
      ],
      ["MANUAL_REVERSAL", 2, 8, 10, 0, 0],
    ));
    check(() => assert.equal(Number(controlledMovement.unitCostSnapshot), 7));
    check(() => assert.equal(countMovement(controlled.itemId, "MANUAL_REVERSAL"), 1));
    check(() => assert.equal(countMovement(controlled.itemId, "CONSUMPTION"), 1));
    check(() => assert.equal(countHistory(controlled.orderId), 1));
    check(() => assert.equal(countCommand(controlled.orderId), 1));
    check(() => assert.deepEqual(
      [Number(controlledOrder.partsCost), Number(controlledOrder.totalAmount)],
      [0, 15],
    ));
    check(() => assert.equal(controlledOrder.status, "PRONTO"));
    check(() => assert.equal(controlledResult.idempotentReplay, false));
    check(() => assert.equal(controlledResult.item.state, "REVERSED"));

    // 2) Ilimitado: NULL permanece NULL; reservado permanece zero.
    const unlimited = consumeFixture({
      onHand: null,
      quantity: 3,
      unitPrice: 12,
    });
    const beforeUnlimited = partState(unlimited.partId);
    const unlimitedResult = reverse(unlimited.itemId, unlimited.partId);
    const afterUnlimited = partState(unlimited.partId);
    const unlimitedMovement = scalar(`SELECT "onHandBefore", "onHandAfter",
      "reservedBefore", "reservedAfter"
      FROM "TechnicalPartMovement"
      WHERE "serviceOrderPartId" = ? AND "type" = 'MANUAL_REVERSAL'`,
      unlimited.itemId);
    check(() => assert.equal(beforeUnlimited.quantityOnHand, null));
    check(() => assert.equal(afterUnlimited.quantityOnHand, null));
    check(() => assert.equal(Number(afterUnlimited.quantityReserved), 0));
    check(() => assert.equal(Number(afterUnlimited.version), Number(beforeUnlimited.version) + 1));
    check(() => assert.deepEqual(
      [unlimitedMovement.onHandBefore, unlimitedMovement.onHandAfter],
      [null, null],
    ));
    check(() => assert.deepEqual(
      [Number(unlimitedMovement.reservedBefore), Number(unlimitedMovement.reservedAfter)],
      [0, 0],
    ));
    check(() => assert.equal(unlimitedResult.item.state, "REVERSED"));

    // 3) Peça inativa ainda pode voltar fisicamente ao estoque.
    const inactive = consumeFixture({ onHand: 5, quantity: 1 });
    exec(`UPDATE "TechnicalPart" SET "isActive" = 0 WHERE "id" = ?`, inactive.partId);
    const inactiveBefore = partState(inactive.partId);
    reverse(inactive.itemId, inactive.partId);
    const inactiveAfter = partState(inactive.partId);
    check(() => assert.equal(Number(inactiveAfter.isActive), 0));
    check(() => assert.equal(Number(inactiveAfter.quantityOnHand), Number(inactiveBefore.quantityOnHand) + 1));
    check(() => assert.equal(itemState(inactive.itemId).state, "REVERSED"));

    // 4) CANCELADO é permitido e não muda o status da OS.
    const cancelled = consumeFixture({ onHand: 7, quantity: 2 });
    exec(`UPDATE "ServiceOrder" SET "status" = 'CANCELADO' WHERE "id" = ?`, cancelled.orderId);
    reverse(cancelled.itemId, cancelled.partId);
    check(() => assert.equal(orderState(cancelled.orderId).status, "CANCELADO"));
    check(() => assert.equal(itemState(cancelled.itemId).state, "REVERSED"));

    // 5) Reversão de um item não remove outros itens CONSUMED dos totais.
    const multiOrder = createOrder({ laborCost: 5, discount: 1 });
    const multiPartA = createPart({ onHand: 10, name: "A" });
    const multiPartB = createPart({ onHand: 10, name: "B" });
    const multiA = reserve(multiOrder, multiPartA, 1, 10);
    const multiB = reserve(multiOrder, multiPartB, 2, 20);
    ready(multiOrder);
    reverse(multiA.item.id, multiPartA);
    const multiState = orderState(multiOrder);
    check(() => assert.equal(itemState(multiA.item.id).state, "REVERSED"));
    check(() => assert.equal(itemState(multiB.item.id).state, "CONSUMED"));
    check(() => assert.equal(Number(multiState.partsCost), 40));
    check(() => assert.equal(Number(multiState.totalAmount), 44));

    // 6) Validação estrita.
    const validationFixture = consumeFixture();
    expectCode(
      () => reverse(validationFixture.itemId, validationFixture.partId, {
        physicalReturnConfirmed: false,
      }),
      "VALIDATION_ERROR",
    );
    expectCode(
      () => reverse(validationFixture.itemId, validationFixture.partId, {
        confirmation: false,
      }),
      "VALIDATION_ERROR",
    );
    expectCode(
      () => reverse(validationFixture.itemId, validationFixture.partId, {
        reason: "curto",
      }),
      "VALIDATION_ERROR",
    );
    expectCode(
      () => reversal.reverseConsumedTechnicalPartManually(
        validationFixture.itemId,
        {
          technicalPartVersion: Number(partState(validationFixture.partId).version),
          expectedQuantity: 2,
          physicalReturnConfirmed: true,
          confirmation: true,
          reason: "Motivo válido para testar campo extra",
          extra: true,
        },
        context(),
      ),
      "VALIDATION_ERROR",
    );
    expectCode(
      () => reverse(validationFixture.itemId, validationFixture.partId, {
        quantity: 99,
      }),
      "ORDER_PART_QUANTITY_CONFLICT",
    );
    expectCode(
      () => reverse(validationFixture.itemId, validationFixture.partId, {
        version: Number(partState(validationFixture.partId).version) - 1,
      }),
      "VERSION_CONFLICT",
    );

    // 7) Item não consumido nunca devolve físico.
    const reservedOrder = createOrder();
    const reservedPart = createPart({ onHand: 10 });
    const reservedItem = reserve(reservedOrder, reservedPart, 1);
    const reservedBefore = partState(reservedPart);
    expectCode(
      () => reverse(reservedItem.item.id, reservedPart),
      "SERVICE_ORDER_PART_NOT_CONSUMED",
    );
    check(() => assert.deepEqual(partState(reservedPart), reservedBefore));

    // 8) Finalização/entrega e pagamentos bloqueiam alteração financeira.
    const delivered = consumeFixture();
    exec(`UPDATE "ServiceOrder" SET "status" = 'ENTREGUE' WHERE "id" = ?`, delivered.orderId);
    expectCode(
      () => reverse(delivered.itemId, delivered.partId),
      "ORDER_NOT_MUTABLE",
    );

    const finalized = consumeFixture();
    exec(`UPDATE "ServiceOrder" SET "finalizedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`, finalized.orderId);
    expectCode(
      () => reverse(finalized.itemId, finalized.partId),
      "ORDER_NOT_MUTABLE",
    );

    for (const paymentPatch of [
      `"paidAmount" = 1`,
      `"paymentPercent" = 10`,
      `"paymentReceivedAt" = CURRENT_TIMESTAMP`,
    ]) {
      const paid = consumeFixture();
      exec(`UPDATE "ServiceOrder" SET ${paymentPatch} WHERE "id" = ?`, paid.orderId);
      expectCode(
        () => reverse(paid.itemId, paid.partId),
        "ORDER_HAS_PAYMENTS",
      );
    }

    // 9) Integridade histórica: consumo é fonte de verdade.
    const divergent = consumeFixture({ onHand: 10, quantity: 1 });
    const otherPart = createPart({ onHand: 10, name: "Outra peça" });
    exec(`UPDATE "TechnicalPartMovement" SET "technicalPartId" = ?
      WHERE "serviceOrderPartId" = ? AND "type" = 'CONSUMPTION'`,
      otherPart, divergent.itemId);
    expectCode(
      () => reverse(divergent.itemId, divergent.partId),
      "STOCK_INVARIANT_VIOLATION",
    );
    check(() => assert.equal(itemState(divergent.itemId).state, "CONSUMED"));

    const duplicateConsumption = consumeFixture({ onHand: 10, quantity: 1 });
    const originalConsumption = scalar(`SELECT * FROM "TechnicalPartMovement"
      WHERE "serviceOrderPartId" = ? AND "type" = 'CONSUMPTION'`,
      duplicateConsumption.itemId);
    database = db();
    database.prepare(`INSERT INTO "TechnicalPartMovement" (
      "id", "technicalPartId", "serviceOrderPartId", "type", "quantity",
      "onHandBefore", "onHandAfter", "reservedBefore", "reservedAfter",
      "unitCostSnapshot", "reason", "operatorId", "operatorNameSnapshot",
      "idempotencyKey", "createdAt"
    ) VALUES (?, ?, ?, 'CONSUMPTION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      CURRENT_TIMESTAMP)`)
      .run(
        randomUUID(),
        originalConsumption.technicalPartId,
        duplicateConsumption.itemId,
        originalConsumption.quantity,
        originalConsumption.onHandBefore,
        originalConsumption.onHandAfter,
        originalConsumption.reservedBefore,
        originalConsumption.reservedAfter,
        originalConsumption.unitCostSnapshot,
        "Duplicação controlada",
        null,
        "Sistema",
        randomUUID(),
      );
    database.close();
    expectCode(
      () => reverse(duplicateConsumption.itemId, duplicateConsumption.partId),
      "STOCK_INVARIANT_VIOLATION",
    );

    // 10) Idempotência: retry não devolve duas vezes.
    const replayFixture = consumeFixture({ onHand: 10, quantity: 2 });
    const replayKey = randomUUID();
    const replayBefore = partState(replayFixture.partId);
    const firstReplay = reverse(
      replayFixture.itemId,
      replayFixture.partId,
      { key: replayKey },
    );
    const replayAgain = reversal.reverseConsumedTechnicalPartManually(
      replayFixture.itemId,
      {
        technicalPartVersion: Number(replayBefore.version),
        expectedQuantity: 2,
        physicalReturnConfirmed: true,
        confirmation: true,
        reason: "Peça devolvida fisicamente ao estoque após conferência",
      },
      context(replayKey),
    );
    check(() => assert.equal(firstReplay.idempotentReplay, false));
    check(() => assert.equal(replayAgain.idempotentReplay, true));
    check(() => assert.equal(countMovement(replayFixture.itemId, "MANUAL_REVERSAL"), 1));
    check(() => assert.equal(countHistory(replayFixture.orderId), 1));
    check(() => assert.equal(countCommand(replayFixture.orderId), 1));
    check(() => assert.equal(
      Number(partState(replayFixture.partId).quantityOnHand),
      Number(replayBefore.quantityOnHand) + 2,
    ));
    expectCode(
      () => reversal.reverseConsumedTechnicalPartManually(
        replayFixture.itemId,
        {
          technicalPartVersion: Number(replayBefore.version),
          expectedQuantity: 2,
          physicalReturnConfirmed: true,
          confirmation: true,
          reason: "Payload diferente reutilizando a mesma chave idempotente",
        },
        context(replayKey),
      ),
      "IDEMPOTENCY_KEY_REUSED",
    );

    // Operador diferente + mesma chave externa não recebe replay alheio.
    expectCode(
      () => reversal.reverseConsumedTechnicalPartManually(
        replayFixture.itemId,
        {
          technicalPartVersion: Number(partState(replayFixture.partId).version),
          expectedQuantity: 2,
          physicalReturnConfirmed: true,
          confirmation: true,
          reason: "Peça devolvida fisicamente ao estoque após conferência",
        },
        context(replayKey, "etapa3c35a-user-b"),
      ),
      "SERVICE_ORDER_PART_NOT_CONSUMED",
    );

    // 11) Rollback integral nos cinco pontos.
    for (const failAfter of [
      "after_part",
      "after_item",
      "after_movement",
      "after_totals",
      "after_history",
    ]) {
      process.stdout.write(`[3C.3.5A rollback] ${failAfter}\n`);
      const fixture = consumeFixture({
        onHand: 10,
        quantity: 2,
        unitPrice: 13,
        laborCost: 9,
        discount: 2,
      });
      const beforePart = partState(fixture.partId);
      const beforeItem = itemState(fixture.itemId);
      const beforeOrder = orderState(fixture.orderId);
      const beforeMovements = countMovement(fixture.itemId, "MANUAL_REVERSAL");
      const beforeHistory = countHistory(fixture.orderId);
      const beforeCommands = countCommand(fixture.orderId);

      const failing =
        loaded.reversal.__createOrderReversalServicesForTests(
          location,
          { failAfter },
        );

      expectCode(
        () => {
          const version = Number(partState(fixture.partId).version);
          failing.reverseConsumedTechnicalPartManually(
            fixture.itemId,
            {
              technicalPartVersion: version,
              expectedQuantity: 2,
              physicalReturnConfirmed: true,
              confirmation: true,
              reason: `Falha controlada ${failAfter} validando rollback integral`,
            },
            context(),
          );
        },
        "INTERNAL_ERROR",
      );

      check(() => assert.deepEqual(partState(fixture.partId), beforePart));
      check(() => assert.deepEqual(itemState(fixture.itemId), beforeItem));
      check(() => assert.deepEqual(orderState(fixture.orderId), beforeOrder));
      check(() => assert.equal(countMovement(fixture.itemId, "MANUAL_REVERSAL"), beforeMovements));
      check(() => assert.equal(countHistory(fixture.orderId), beforeHistory));
      check(() => assert.equal(countCommand(fixture.orderId), beforeCommands));
    }

    // 12) Concorrência: duas chaves diferentes => uma única devolução física.
    const race = consumeFixture({ onHand: 10, quantity: 2 });
    const raceBefore = partState(race.partId);
    const raceVersion = Number(raceBefore.version);
    const raceResults = await Promise.all([
      runWorker(race.itemId, race.partId, 2, undefined, raceVersion),
      runWorker(race.itemId, race.partId, 2, undefined, raceVersion),
    ]);
    check(() => assert.equal(raceResults.filter((entry) => entry.ok).length, 1));
    check(() => assert.equal(countMovement(race.itemId, "MANUAL_REVERSAL"), 1));
    check(() => assert.equal(itemState(race.itemId).state, "REVERSED"));
    check(() => assert.equal(
      Number(partState(race.partId).quantityOnHand),
      Number(raceBefore.quantityOnHand) + 2,
    ));

    // Mesma chave concorrente => dois retornos lógicos, um único efeito físico.
    const sameKeyRace = consumeFixture({ onHand: 10, quantity: 1 });
    const sameKeyBefore = partState(sameKeyRace.partId);
    const sameKey = randomUUID();
    const sameKeyVersion = Number(sameKeyBefore.version);
    const sameKeyResults = await Promise.all([
      runWorker(sameKeyRace.itemId, sameKeyRace.partId, 1, sameKey, sameKeyVersion),
      runWorker(sameKeyRace.itemId, sameKeyRace.partId, 1, sameKey, sameKeyVersion),
    ]);
    check(() => assert.equal(sameKeyResults.filter((entry) => entry.ok).length, 2));
    check(() => assert.equal(sameKeyResults.filter((entry) => entry.replay).length, 1));
    check(() => assert.equal(countMovement(sameKeyRace.itemId, "MANUAL_REVERSAL"), 1));
    check(() => assert.equal(
      Number(partState(sameKeyRace.partId).quantityOnHand),
      Number(sameKeyBefore.quantityOnHand) + 1,
    ));

    // 13) Sanitização sem permissão financeira.
    const sanitized = consumeFixture({ cost: 99, quantity: 1, unitPrice: 25 });
    const sanitizedResult = reverse(
      sanitized.itemId,
      sanitized.partId,
      { financial: false },
    );
    check(() => assert.doesNotThrow(() => assertNoSensitiveKeys(sanitizedResult)));

    // 14) SQL injection-like permanece texto.
    const injection = consumeFixture({ quantity: 1 });
    const injectionReason =
      `Retorno físico confirmado; tentativa ' -- ; % _ deve ser somente texto`;
    reverse(
      injection.itemId,
      injection.partId,
      { reason: injectionReason },
    );
    const injectionHistory = scalar(`SELECT "description"
      FROM "OrderHistory"
      WHERE "serviceOrderId" = ?
        AND "action" = 'PECA_TECNICA_ESTORNO_MANUAL'`,
      injection.orderId);
    check(() => assert.equal(String(injectionHistory.description).includes("' -- ; % _"), true));
    check(() => assert.equal(
      Number(scalar(`SELECT COUNT(*) AS n FROM sqlite_master
        WHERE "type" = 'table' AND "name" = 'Customer'`).n),
      1,
    ));

    process.stdout.write(
      JSON.stringify({ ok: true, assertions }) + "\n",
    );
  } finally {
    loaded.restore();
    try {
      fs.rmSync(temporaryRoot, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    } catch {}
  }
}
