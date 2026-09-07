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
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-migrator-3c21-"));
const source = path.join(root, "data", "nio-os.db");
const databasePath = path.join(temporaryRoot, "apply.db");
const rollbackPath = path.join(temporaryRoot, "rollback.db");
const migration = migrations.find((item) => item.id === "20260806_002_technical_part_command_log");

function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

try {
  assert.ok(migration);
  assert.match(migration.checksum, /^[0-9a-f]{64}$/);
  fs.copyFileSync(source, databasePath);
  const beforeSource = hash(source);
  const applied = applyMigrations(databasePath, { logger: () => undefined });
  assert.equal(applied.pending.length, 0);
  assert.equal(applied.applied.includes(migration.id), true);
  const inspected = inspectDatabase(databasePath, { logger: () => undefined });
  assert.equal(inspected.pending.length, 0);
  const beforeReapply = hash(databasePath);
  const reapplied = applyMigrations(databasePath, { logger: () => undefined });
  assert.deepEqual(reapplied.appliedNow, []);
  assert.equal(hash(databasePath), beforeReapply);
  assert.equal(hash(source), beforeSource);

  const constraintsDb = new DatabaseSync(databasePath);
  constraintsDb.exec("PRAGMA foreign_keys = ON");
  constraintsDb.prepare(`INSERT INTO "TechnicalPart" (
    "id", "name", "quantityOnHand", "quantityReserved", "minStock",
    "currentCostPrice", "defaultSalePrice", "isActive", "version", "updatedAt"
  ) VALUES (?, ?, 0, 0, 0, 0, 0, 1, 0, CURRENT_TIMESTAMP)`)
    .run("migration-command-part", "Estrutural");
  const commandInsert = constraintsDb.prepare(`INSERT INTO "TechnicalPartCommandLog" (
    "id", "logicalKey", "payloadHash", "operation", "technicalPartId",
    "operatorId", "operatorNameSnapshot", "reason", "resultVersion"
  ) VALUES (?, ?, ?, 'CREATE', ?, NULL, 'Estrutural', NULL, ?)`);
  assert.throws(() => commandInsert.run(
    "bad-hash", "bad-hash", "xyz", "migration-command-part", 0,
  ));
  assert.throws(() => commandInsert.run(
    "bad-version", "bad-version", "a".repeat(64), "migration-command-part", -1,
  ));
  commandInsert.run(
    "valid-command", "valid-command", "b".repeat(64), "migration-command-part", 0,
  );
  assert.throws(() => commandInsert.run(
    "duplicate-logical", "valid-command", "c".repeat(64), "migration-command-part", 0,
  ));
  assert.equal(constraintsDb.prepare("PRAGMA foreign_key_check").all().length, 0);
  constraintsDb.close();

  fs.copyFileSync(databasePath, rollbackPath);
  const rollbackDb = new DatabaseSync(rollbackPath);
  rollbackDb.exec("PRAGMA foreign_keys = ON");
  rollbackDb.prepare("DELETE FROM NioSchemaMigration WHERE id = ?").run(migration.id);
  rollbackDb.exec("DROP TABLE TechnicalPartCommandLog");
  rollbackDb.exec("CREATE TABLE TechnicalPartCommandLog (marker TEXT NOT NULL)");
  rollbackDb.prepare("INSERT INTO TechnicalPartCommandLog (marker) VALUES (?)").run("preserve");
  rollbackDb.close();
  let failed = false;
  try {
    applyMigrations(rollbackPath, { logger: () => undefined });
  } catch {
    failed = true;
  }
  assert.equal(failed, true);
  const verifyRollback = new DatabaseSync(rollbackPath, { readOnly: true });
  assert.equal(verifyRollback.prepare("SELECT marker FROM TechnicalPartCommandLog").get().marker, "preserve");
  assert.equal(Number(verifyRollback.prepare(
    "SELECT count(*) AS total FROM NioSchemaMigration WHERE id = ?",
  ).get(migration.id).total), 0);
  verifyRollback.close();

  process.stdout.write(JSON.stringify({
    ok: true,
    migrationId: migration.id,
    checksum: migration.checksum,
    reapplyNoOp: true,
    rollbackPreserved: true,
    sourceUnchanged: true,
  }) + "\n");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
