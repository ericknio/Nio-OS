#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { applyMigrations, inspectDatabase } = require("./core.cjs");
const { migrations } = require("./migrations.cjs");

const root = path.resolve(__dirname, "..", "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-migrator-3c33a-"));
const source = path.join(root, "data", "nio-os.db");
const databasePath = path.join(temporaryRoot, "apply.db");
const rollbackPath = path.join(temporaryRoot, "rollback.db");
const migration = migrations.find((item) => item.id === "20260806_003_service_order_technical_command_log");

function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

try {
  assert.ok(migration);
  assert.match(migration.checksum, /^[0-9a-f]{64}$/);
  assert.equal(migrations.find((item) => item.id === "20260804_001_technical_parts").checksum,
    "57ad36c0c07e14457345ae506aa4c0e18dd1dfd28a71fc27d4c4e4639241224c");
  assert.equal(migrations.find((item) => item.id === "20260806_002_technical_part_command_log").checksum,
    "20013162c5f4f15f08618c72904a970a08e6aa2baa01ad5e3e8b66cdecfe5750");
  fs.copyFileSync(source, databasePath);
  const sourceHash = hash(source);
  const applied = applyMigrations(databasePath, { logger: () => undefined });
  assert.equal(applied.applied.includes(migration.id), true);
  assert.equal(inspectDatabase(databasePath, { logger: () => undefined }).pending.length, 0);
  const appliedHash = hash(databasePath);
  assert.deepEqual(applyMigrations(databasePath, { logger: () => undefined }).appliedNow, []);
  assert.equal(hash(databasePath), appliedHash);
  assert.equal(hash(source), sourceHash);

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.prepare(`INSERT INTO "Customer" ("id", "name", "createdAt", "updatedAt")
    VALUES ('migration-003-customer', 'Estrutural', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run();
  database.prepare(`INSERT INTO "ServiceOrder" (
    "id", "osNumber", "customerId", "equipmentType", "reportedDefect", "paymentMethod",
    "status", "createdAt", "updatedAt"
  ) VALUES ('migration-003-order', 930003, 'migration-003-customer', 'OUTRO', 'Estrutural',
    'AGUARDANDO_PAGAMENTO', 'RECEBIDO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run();
  const insert = database.prepare(`INSERT INTO "ServiceOrderTechnicalCommandLog" (
    "id", "logicalKey", "payloadHash", "operation", "serviceOrderId", "operatorId",
    "operatorNameSnapshot", "affectedItems", "resultOrderStatus"
  ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`);
  assert.throws(() => insert.run("bad-key", " ", "a".repeat(64), "CONSUME_ON_READY", "migration-003-order", "Sistema", 0, "PRONTO"));
  assert.throws(() => insert.run("bad-hash", "bad-hash", "xyz", "CONSUME_ON_READY", "migration-003-order", "Sistema", 0, "PRONTO"));
  assert.throws(() => insert.run("bad-operation", "bad-operation", "a".repeat(64), "INVALID", "migration-003-order", "Sistema", 0, "PRONTO"));
  assert.throws(() => insert.run("bad-items", "bad-items", "a".repeat(64), "CONSUME_ON_READY", "migration-003-order", "Sistema", -1, "PRONTO"));
  assert.throws(() => insert.run("bad-order", "bad-order", "a".repeat(64), "CONSUME_ON_READY", "missing", "Sistema", 0, "PRONTO"));
  insert.run("valid", "valid", "b".repeat(64), "CONSUME_ON_READY", "migration-003-order", "Sistema", 0, "PRONTO");
  assert.throws(() => insert.run("duplicate", "valid", "c".repeat(64), "CONSUME_ON_READY", "migration-003-order", "Sistema", 0, "PRONTO"));
  assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  database.close();

  fs.copyFileSync(databasePath, rollbackPath);
  const rollback = new DatabaseSync(rollbackPath);
  rollback.prepare(`DELETE FROM "NioSchemaMigration" WHERE "id" = ?`).run(migration.id);
  rollback.exec(`DROP TABLE "ServiceOrderTechnicalCommandLog"`);
  rollback.exec(`CREATE TABLE "ServiceOrderTechnicalCommandLog" ("marker" TEXT NOT NULL)`);
  rollback.prepare(`INSERT INTO "ServiceOrderTechnicalCommandLog" ("marker") VALUES (?)`).run("preserve");
  rollback.close();
  assert.throws(() => applyMigrations(rollbackPath, { logger: () => undefined }));
  const verify = new DatabaseSync(rollbackPath, { readOnly: true });
  assert.equal(verify.prepare(`SELECT "marker" FROM "ServiceOrderTechnicalCommandLog"`).get().marker, "preserve");
  assert.equal(Number(verify.prepare(`SELECT COUNT(*) AS "total" FROM "NioSchemaMigration" WHERE "id" = ?`).get(migration.id).total), 0);
  verify.close();

  process.stdout.write(JSON.stringify({
    ok: true,
    migrationId: migration.id,
    checksum: migration.checksum,
    reapplyNoOp: true,
    rollbackPreserved: true,
    sourceUnchanged: true,
    previousChecksumsUnchanged: true,
  }) + "\n");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
