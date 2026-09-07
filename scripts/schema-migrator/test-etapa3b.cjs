#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { applyMigrations, inspectDatabase } = require("./core.cjs");
const { migrations } = require("./migrations.cjs");

const root = path.resolve(__dirname, "..", "..");
const cli = path.join(__dirname, "cli.cjs");
const sourceRoot = process.argv[2];
const lab = process.argv[3];

if (!sourceRoot || !lab || !path.isAbsolute(sourceRoot) || !path.isAbsolute(lab)) {
  throw new Error("Uso: node test-etapa3b.cjs <origem-absoluta> <laboratorio-absoluto>");
}

fs.mkdirSync(lab, { recursive: true });

function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function copy(sourceName, targetName) {
  const source = path.join(sourceRoot, sourceName);
  const target = path.join(lab, targetName);
  fs.copyFileSync(source, target);
  return { source, target };
}

function copyLab(sourceName, targetName) {
  const source = path.join(lab, sourceName);
  const target = path.join(lab, targetName);
  fs.copyFileSync(source, target);
  return { source, target };
}

function runCli(args) {
  const result = spawnSync(process.execPath, [cli, ...args, "--json"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 300000,
  });
  if (result.error) throw result.error;
  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  const json = JSON.parse(lines.at(-1) || "{}");
  assert.equal(result.status, json.ok ? 0 : 1, result.stderr);
  return json;
}

function expectSqlError(fn, label) {
  let failed = false;
  try {
    fn();
  } catch {
    failed = true;
  }
  assert.equal(failed, true, label);
}

function column(db, table, name) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().find((row) => row.name === name);
}

function snapshotRows(db, sql) {
  return db.prepare(sql).all().map((row) => JSON.stringify(row)).sort();
}

function insertTechnicalPart(db, values) {
  db.prepare(`INSERT INTO "TechnicalPart" (
    "id","name","sku","quantityOnHand","quantityReserved","minStock",
    "currentCostPrice","defaultSalePrice","isActive","version","createdAt","updatedAt"
  ) VALUES (?, ?, ?, ?, ?, 0, 1, 2, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
    .run(values.id, values.name || values.id, values.sku ?? null, values.onHand ?? null, values.reserved ?? 0);
}

function createSyntheticOrder(db) {
  db.prepare(`INSERT INTO "Customer" ("id","name","createdAt","updatedAt")
    VALUES ('etapa3b-customer','Teste estrutural',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run();
  const osNumber = Number(db.prepare(`SELECT coalesce(max("osNumber"),0)+100000 AS n FROM "ServiceOrder"`).get().n);
  db.prepare(`INSERT INTO "ServiceOrder" (
    "id","osNumber","customerId","equipmentType","reportedDefect","partsCost","laborCost",
    "discount","totalAmount","paymentMethod","status","paidAmount","paymentPercent","createdAt","updatedAt"
  ) VALUES ('etapa3b-order',?,'etapa3b-customer','OUTRO','Teste estrutural',0,0,0,0,
    'AGUARDANDO_PAGAMENTO','RECEBIDO',0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(osNumber);
}

function insertOrderPart(db, values) {
  db.prepare(`INSERT INTO "ServiceOrderPart" (
    "id","serviceOrderId","technicalPartId","partNameSnapshot","partSkuSnapshot",
    "unitCostSnapshot","unitPriceSnapshot","quantity","totalCostSnapshot","totalPriceSnapshot",
    "state","reservedAt","consumedAt","releasedAt","reversedAt","responsibleUserId",
    "responsibleUserNameSnapshot","idempotencyKey","createdAt","updatedAt"
  ) VALUES (?, 'etapa3b-order', ?, 'Snapshot', NULL, 2, 3, ?, ?, ?, ?,
    CURRENT_TIMESTAMP, ?, ?, ?, NULL, 'Teste estrutural', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
    .run(
      values.id,
      values.partId,
      values.quantity,
      values.totalCost,
      values.totalPrice,
      values.state,
      values.consumedAt ?? null,
      values.releasedAt ?? null,
      values.reversedAt ?? null,
      values.key
    );
}

function testSchemaAndConstraints(database) {
  const db = new DatabaseSync(database);
  try {
    db.exec("PRAGMA foreign_keys=ON");
    assert.equal(column(db, "Product", "stockQuantity").notnull, 0);
    assert.equal(column(db, "Product", "stockQuantity").dflt_value, null);
    assert.equal(column(db, "StockMovement", "previousStock").notnull, 0);
    assert.equal(column(db, "StockMovement", "newStock").notnull, 0);

    const product = db.prepare(`SELECT "id" FROM "Product" LIMIT 1`).get();
    if (product) {
      db.prepare(`UPDATE "Product" SET "stockQuantity"=0 WHERE "id"=?`).run(product.id);
      db.prepare(`UPDATE "Product" SET "stockQuantity"=NULL WHERE "id"=?`).run(product.id);
      expectSqlError(
        () => db.prepare(`UPDATE "Product" SET "stockQuantity"=-1 WHERE "id"=?`).run(product.id),
        "Product negativo deve falhar"
      );
    }

    createSyntheticOrder(db);
    insertTechnicalPart(db, { id: "tp-unlimited", onHand: null, reserved: 7, sku: "  " });
    assert.equal(db.prepare(`SELECT "sku" FROM "TechnicalPart" WHERE "id"='tp-unlimited'`).get().sku, null);
    insertTechnicalPart(db, { id: "tp-zero", onHand: 0, reserved: 0, sku: "CaseSku" });
    expectSqlError(() => insertTechnicalPart(db, { id: "tp-negative", onHand: -1 }), "FÃ­sico negativo deve falhar");
    expectSqlError(() => insertTechnicalPart(db, { id: "tp-over", onHand: 1, reserved: 2 }), "Reserva acima do controlado deve falhar");
    expectSqlError(() => insertTechnicalPart(db, { id: "tp-sku", onHand: 1, sku: "casesku" }), "SKU NOCASE duplicado deve falhar");

    expectSqlError(
      () => insertOrderPart(db, { id: "sop-zero", partId: "tp-zero", quantity: 0, totalCost: 0, totalPrice: 0, state: "RESERVED", key: "sop-zero" }),
      "Quantidade zero deve falhar"
    );
    expectSqlError(
      () => insertOrderPart(db, { id: "sop-total", partId: "tp-zero", quantity: 2, totalCost: 5, totalPrice: 6, state: "RESERVED", key: "sop-total" }),
      "Total incoerente deve falhar"
    );
    expectSqlError(
      () => insertOrderPart(db, { id: "sop-state", partId: "tp-zero", quantity: 1, totalCost: 2, totalPrice: 3, state: "CONSUMED", key: "sop-state" }),
      "Timestamp de estado invÃ¡lido deve falhar"
    );

    insertOrderPart(db, { id: "sop-active", partId: "tp-zero", quantity: 1, totalCost: 2, totalPrice: 3, state: "RESERVED", key: "sop-active" });
    expectSqlError(
      () => insertOrderPart(db, { id: "sop-duplicate", partId: "tp-zero", quantity: 1, totalCost: 2, totalPrice: 3, state: "RESERVED", key: "sop-duplicate" }),
      "Item ativo duplicado deve falhar"
    );
    db.prepare(`UPDATE "ServiceOrderPart" SET "state"='RELEASED',"releasedAt"=CURRENT_TIMESTAMP WHERE "id"='sop-active'`).run();
    insertOrderPart(db, { id: "sop-new-after-release", partId: "tp-zero", quantity: 1, totalCost: 2, totalPrice: 3, state: "RESERVED", key: "sop-new-after-release" });
    db.prepare(`UPDATE "ServiceOrderPart" SET "state"='CONSUMED',"consumedAt"=CURRENT_TIMESTAMP WHERE "id"='sop-new-after-release'`).run();
    db.prepare(`UPDATE "ServiceOrderPart" SET "state"='REVERSED',"reversedAt"=CURRENT_TIMESTAMP WHERE "id"='sop-new-after-release'`).run();
    insertOrderPart(db, { id: "sop-new-after-reverse", partId: "tp-zero", quantity: 1, totalCost: 2, totalPrice: 3, state: "RESERVED", key: "sop-new-after-reverse" });

    const movement = db.prepare(`INSERT INTO "TechnicalPartMovement" (
      "id","technicalPartId","serviceOrderPartId","type","quantity","onHandBefore","onHandAfter",
      "reservedBefore","reservedAfter","reason","operatorNameSnapshot","idempotencyKey","createdAt"
    ) VALUES (?, 'tp-unlimited', NULL, ?, ?, ?, ?, ?, ?, ?, 'Teste estrutural', ?, CURRENT_TIMESTAMP)`);
    movement.run("m-reserve", "RESERVATION", 2, null, null, 0, 2, null, "m-reserve");
    movement.run("m-consume", "CONSUMPTION", 1, null, null, 2, 1, null, "m-consume");
    movement.run("m-release", "RELEASE", 1, null, null, 1, 0, null, "m-release");
    movement.run("m-reverse", "MANUAL_REVERSAL", 1, null, null, 0, 0, "Conferido", "m-reverse");
    movement.run("m-mode", "STOCK_MODE_CHANGE", 0, null, 0, 0, 0, "Controle iniciado", "m-mode");
    expectSqlError(() => movement.run("m-entry-null", "ENTRY", 1, null, null, 0, 0, null, "m-entry-null"), "Entrada ilimitada deve falhar");
    expectSqlError(() => movement.run("m-bad-delta", "RESERVATION", 1, null, null, 0, 3, null, "m-bad-delta"), "Delta invÃ¡lido deve falhar");
    expectSqlError(() => movement.run("m-duplicate", "RESERVATION", 2, null, null, 0, 2, null, "m-reserve"), "IdempotÃªncia duplicada deve falhar");

    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(String(db.prepare("PRAGMA integrity_check").get().integrity_check).toLowerCase(), "ok");
  } finally {
    db.close();
  }
}

function testRollback(sourceName, marker, targetName) {
  const { source, target } = copy(sourceName, targetName);
  const beforeHash = hash(target);
  const db = new DatabaseSync(target);
  let failed = false;
  try {
    db.exec("PRAGMA foreign_keys=OFF");
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 0);
    db.exec("BEGIN IMMEDIATE");
    const migration = migrations.find((item) => item.id === "20260804_001_technical_parts");
    const injected = migration.sql.replace(marker, `${marker}\nSELECT * FROM "__ETAPA3B_FORCED_FAILURE__";`);
    try {
      db.exec(injected);
    } catch {
      failed = true;
      db.exec("ROLLBACK");
    }
    db.exec("PRAGMA foreign_keys=ON");
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='TechnicalPart'`).get().n, 0);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(String(db.prepare("PRAGMA integrity_check").get().integrity_check).toLowerCase(), "ok");
  } finally {
    db.close();
  }
  assert.equal(failed, true, `Falha nÃ£o injetada em ${marker}`);
  assert.equal(hash(target), beforeHash, `Rollback nÃ£o restaurou hash em ${marker}`);
  assert.equal(hash(source), beforeHash, "Fonte foi alterada");
}

function main() {
  const sourceHashes = Object.fromEntries(
    ["runtime.db", "desenvolvimento.db"].map((name) => [name, hash(path.join(sourceRoot, name))])
  );

  const { target } = copy("runtime.db", "runtime-etapa3b-main.db");
  const originalHash = hash(target);
  const beforeDb = new DatabaseSync(target, { readOnly: true });
  const productsBefore = snapshotRows(beforeDb, `SELECT "id","stockQuantity" FROM "Product" ORDER BY "id"`);
  const productRefsBefore = Number(beforeDb.prepare(`SELECT COUNT(*) AS n FROM "ProductSaleItem" WHERE "productId" IS NOT NULL`).get().n);
  const movementsBefore = snapshotRows(beforeDb, `SELECT * FROM "StockMovement" ORDER BY "id"`);
  beforeDb.close();

  const dry = runCli(["--db", target, "--dry-run"]);
  assert.deepEqual(dry.pending, migrations.map((migration) => migration.id));
  assert.equal(hash(target), originalHash);

  const apply = runCli(["--db", target, "--apply"]);
  assert.deepEqual(apply.applied, migrations.map((migration) => migration.id));
  assert.ok(apply.backupPath && fs.existsSync(apply.backupPath));

  const afterDb = new DatabaseSync(target, { readOnly: true });
  const productsAfter = afterDb.prepare(`SELECT "id","stockQuantity" FROM "Product" ORDER BY "id"`).all();
  const decodedBefore = productsBefore.map(JSON.parse);
  assert.equal(productsAfter.length, decodedBefore.length);
  for (let index = 0; index < decodedBefore.length; index += 1) {
    assert.equal(productsAfter[index].id, decodedBefore[index].id);
    assert.equal(productsAfter[index].stockQuantity, decodedBefore[index].stockQuantity === 0 ? null : decodedBefore[index].stockQuantity);
  }
  assert.equal(Number(afterDb.prepare(`SELECT COUNT(*) AS n FROM "ProductSaleItem" WHERE "productId" IS NOT NULL`).get().n), productRefsBefore);
  assert.deepEqual(snapshotRows(afterDb, `SELECT * FROM "StockMovement" ORDER BY "id"`), movementsBefore);
  afterDb.close();

  testSchemaAndConstraints(target);

  const hashAfterApply = hash(target);
  const backupsBeforeReapply = fs.readdirSync(lab).filter((name) => name.startsWith("runtime-etapa3b-main.before-schema-")).length;
  const reapply = runCli(["--db", target, "--apply"]);
  assert.deepEqual(reapply.applied, []);
  assert.equal(reapply.backupPath, null);
  assert.equal(hash(target), hashAfterApply);
  const backupsAfterReapply = fs.readdirSync(lab).filter((name) => name.startsWith("runtime-etapa3b-main.before-schema-")).length;
  assert.equal(backupsAfterReapply, backupsBeforeReapply);
  assert.deepEqual(inspectDatabase(target).pending, []);

  const direct = copy("desenvolvimento.db", "desenvolvimento-etapa3b-direct.db").target;
  const foreignKeyEvents = [];
  const directResult = applyMigrations(direct, { logger: (event) => foreignKeyEvents.push(event) });
  assert.equal(directResult.foreignKeysEnabled, true);
  assert.deepEqual(directResult.pending, []);

  testRollback("runtime.db", "-- TEST_POINT_AFTER_PRODUCT_COPY", "rollback-after-copy.db");
  testRollback("runtime.db", "-- TEST_POINT_AFTER_PRODUCT_RENAME", "rollback-after-rename.db");
  testRollback("runtime.db", "-- TEST_POINT_AFTER_SECOND_TECHNICAL_TABLE", "rollback-second-table.db");

  const tampered = copyLab("runtime-etapa3b-main.db", "checksum-tampered.db").target;
  const tamperedDb = new DatabaseSync(tampered);
  tamperedDb.prepare(`UPDATE "NioSchemaMigration" SET "checksum"='invalid' WHERE "id"='20260804_001_technical_parts'`).run();
  tamperedDb.close();
  assert.throws(() => inspectDatabase(tampered), (error) => error.code === "CHECKSUM_MISMATCH");

  const gap = copyLab("runtime-etapa3b-main.db", "history-gap.db").target;
  const gapDb = new DatabaseSync(gap);
  gapDb.prepare(`DELETE FROM "NioSchemaMigration" WHERE "id"='20260728_000_baseline_sqlite'`).run();
  gapDb.close();
  assert.throws(() => inspectDatabase(gap), (error) => error.code === "MIGRATION_HISTORY_GAP");

  for (const [name, expectedHash] of Object.entries(sourceHashes)) {
    assert.equal(hash(path.join(sourceRoot, name)), expectedHash, `${name} original foi alterado`);
  }

  const checksum = migrations.find((item) => item.id === "20260804_001_technical_parts").checksum;
  console.log(JSON.stringify({
    ok: true,
    migrationId: "20260804_001_technical_parts",
    checksum,
    sourcesUnchanged: true,
    dryRunHashUnchanged: true,
    applyBackupCreated: true,
    reapplyNoOp: true,
    productRowsPreserved: decodedBefore.length,
    productReferencesPreserved: productRefsBefore,
    stockMovementsPreserved: movementsBefore.length,
    rollbackCases: 3,
    integrityCheck: "ok",
    foreignKeyViolations: 0,
    foreignKeysRestored: true,
  }, null, 2));
}

main();
