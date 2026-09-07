#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();
const sourceFile = path.resolve(
  process.env.NIO_OS_SEED_SCHEMA_SOURCE ||
    path.join(root, "data", "nio-os.db"),
);
const seedDir = path.join(root, "build", "seed", "data");
const seedFile = path.join(seedDir, "nio-os.db");
const tempFile = path.join(
  seedDir,
  `.nio-os-seed-${process.pid}-${Date.now()}.tmp.db`,
);
const migrationManifestFile = path.join(
  root,
  "scripts",
  "schema-migrator",
  "migrations.cjs",
);

function cleanup(file) {
  for (const candidate of [
    file,
    `${file}-wal`,
    `${file}-shm`,
    `${file}-journal`,
  ]) {
    try {
      fs.rmSync(candidate, { force: true });
    } catch {}
  }
}

function safeIdent(value) {
  return String(value).replaceAll('"', '""');
}

function userTables(db) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
}

function schemaObjects(db) {
  return db
    .prepare(
      `SELECT type, name, tbl_name AS tableName, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
         AND sql IS NOT NULL
         AND type IN ('table','index','trigger','view')
       ORDER BY
         CASE type
           WHEN 'table' THEN 1
           WHEN 'index' THEN 2
           WHEN 'trigger' THEN 3
           WHEN 'view' THEN 4
           ELSE 9
         END,
         name`,
    )
    .all()
    .map((row) => ({
      type: String(row.type),
      name: String(row.name),
      tableName: String(row.tableName),
      sql: String(row.sql),
    }));
}

function health(db, label) {
  const integrity = db.prepare("PRAGMA integrity_check").all();
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();

  if (
    integrity.length !== 1 ||
    String(integrity[0].integrity_check) !== "ok"
  ) {
    throw new Error(`${label}: integrity_check não retornou ok.`);
  }

  if (foreignKeys.length !== 0) {
    throw new Error(`${label}: existem violações de chave estrangeira.`);
  }

  return {
    integrityCheck: "ok",
    foreignKeyViolations: 0,
  };
}

function migrationRows(db) {
  if (!userTables(db).includes("NioSchemaMigration")) {
    throw new Error("Banco fonte não possui NioSchemaMigration.");
  }

  return db
    .prepare('SELECT * FROM "NioSchemaMigration" ORDER BY rowid')
    .all();
}

function validateMigrationHistory(sourceRows) {
  if (!fs.existsSync(migrationManifestFile)) {
    throw new Error(
      `Manifesto do migrador não encontrado: ${migrationManifestFile}`,
    );
  }

  const manifest = require(migrationManifestFile);
  const migrations = Array.isArray(manifest?.migrations)
    ? manifest.migrations
    : [];

  if (migrations.length === 0) {
    throw new Error("Manifesto do migrador não possui migrações.");
  }

  if (sourceRows.length !== migrations.length) {
    throw new Error(
      `Banco fonte não está no schema atual: ${sourceRows.length} migrações aplicadas, ${migrations.length} esperadas.`,
    );
  }

  for (let index = 0; index < migrations.length; index += 1) {
    const expected = migrations[index];
    const actual = sourceRows[index];

    if (String(actual.id) !== String(expected.id)) {
      throw new Error(
        `Histórico de migração fora de ordem na posição ${index + 1}.`,
      );
    }

    if (String(actual.checksum) !== String(expected.checksum)) {
      throw new Error(
        `Checksum de migração divergente: ${String(expected.id)}.`,
      );
    }
  }

  return migrations.length;
}

function insertMigrationRows(target, rows) {
  if (rows.length === 0) return;

  const targetColumns = new Set(
    target
      .prepare('PRAGMA table_info("NioSchemaMigration")')
      .all()
      .map((row) => String(row.name)),
  );

  const sourceColumns = Object.keys(rows[0]).filter((column) =>
    targetColumns.has(column),
  );

  if (!sourceColumns.includes("id") || !sourceColumns.includes("checksum")) {
    throw new Error(
      "Tabela NioSchemaMigration incompatível para criação do seed.",
    );
  }

  const sql =
    `INSERT INTO "NioSchemaMigration" (` +
    sourceColumns.map((column) => `"${safeIdent(column)}"`).join(", ") +
    `) VALUES (` +
    sourceColumns.map(() => "?").join(", ") +
    `)`;

  const statement = target.prepare(sql);

  for (const row of rows) {
    statement.run(...sourceColumns.map((column) => row[column]));
  }
}

function validateNoBusinessRows(db) {
  const nonEmpty = [];

  for (const table of userTables(db)) {
    if (table === "NioSchemaMigration") continue;

    const count = Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM "${safeIdent(table)}"`,
        )
        .get().c,
    );

    if (count !== 0) {
      nonEmpty.push({ table, count });
    }
  }

  if (nonEmpty.length > 0) {
    throw new Error(
      `Seed recusado: existem dados de negócio: ${JSON.stringify(nonEmpty)}`,
    );
  }
}

function normalizeSql(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .trim();
}

function validateSchemaEquivalent(sourceObjects, seedDb) {
  const seedObjects = schemaObjects(seedDb);

  if (seedObjects.length !== sourceObjects.length) {
    throw new Error(
      `Seed recusado: quantidade de objetos de schema divergiu (${seedObjects.length}/${sourceObjects.length}).`,
    );
  }

  for (let index = 0; index < sourceObjects.length; index += 1) {
    const source = sourceObjects[index];
    const seed = seedObjects[index];

    if (
      source.type !== seed.type ||
      source.name !== seed.name ||
      source.tableName !== seed.tableName ||
      normalizeSql(source.sql) !== normalizeSql(seed.sql)
    ) {
      throw new Error(
        `Seed recusado: objeto de schema divergente em ${source.type}:${source.name}.`,
      );
    }
  }
}

function main() {
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Banco fonte de schema não encontrado: ${sourceFile}`);
  }

  if (
    fs.existsSync(`${sourceFile}-wal`) ||
    fs.existsSync(`${sourceFile}-shm`)
  ) {
    try {
      const chk = new DatabaseSync(sourceFile);
      chk.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      chk.close();
    } catch {}
  }

  if (
    fs.existsSync(`${sourceFile}-wal`) ||
    fs.existsSync(`${sourceFile}-shm`)
  ) {
    throw new Error(
      "Banco fonte possui WAL/SHM. Feche completamente o Nio-OS antes de gerar o seed.",
    );
  }

  fs.mkdirSync(seedDir, { recursive: true });
  cleanup(tempFile);

  const source = new DatabaseSync(sourceFile, { readOnly: true });
  let sourceObjects;
  let sourceMigrations;
  let migrationCount;

  try {
    health(source, "Banco fonte");
    sourceObjects = schemaObjects(source);
    sourceMigrations = migrationRows(source);
    migrationCount = validateMigrationHistory(sourceMigrations);
  } finally {
    source.close();
  }

  if (sourceObjects.length === 0) {
    throw new Error("Banco fonte não possui objetos de schema reconhecidos.");
  }

  const seed = new DatabaseSync(tempFile);

  try {
    seed.exec("PRAGMA foreign_keys = OFF");
    seed.exec("BEGIN IMMEDIATE");

    try {
      for (const object of sourceObjects) {
        seed.exec(object.sql);
      }

      insertMigrationRows(seed, sourceMigrations);
      seed.exec("COMMIT");
    } catch (error) {
      try {
        seed.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    seed.exec("PRAGMA foreign_keys = ON");
    validateNoBusinessRows(seed);
    validateSchemaEquivalent(sourceObjects, seed);
    health(seed, "Seed");
  } finally {
    seed.close();
  }

  cleanup(seedFile);
  fs.renameSync(tempFile, seedFile);

  const finalSeed = new DatabaseSync(seedFile, { readOnly: true });

  try {
    const finalHealth = health(finalSeed, "Seed final");
    validateNoBusinessRows(finalSeed);
    validateSchemaEquivalent(sourceObjects, finalSeed);

    console.log(
      JSON.stringify({
        ok: true,
        stage: "4A.7B-SEED-SQLITE",
        seed: path
          .relative(root, seedFile)
          .replaceAll(path.sep, "/"),
        sizeBytes: fs.statSync(seedFile).size,
        tableCount: userTables(finalSeed).length,
        schemaObjectCount: sourceObjects.length,
        migrationCount,
        businessRows: 0,
        integrityCheck: finalHealth.integrityCheck,
        foreignKeyViolations:
          finalHealth.foreignKeyViolations,
        sourceSchemaRead: true,
        sourceMigrationHistoryRead: true,
        sourceBusinessRowsRead: false,
        sourceBusinessDatabaseCopied: false,
        prismaDbPushUsed: false,
        schemaMigratorBootstrapUsed: false,
        liveDatabaseChanged: false,
        promotionPerformed: false,
      }),
    );
  } finally {
    finalSeed.close();
  }
}

try {
  main();
} catch (error) {
  cleanup(tempFile);

  console.error(
    JSON.stringify({
      ok: false,
      stage: "4A.7B-SEED-SQLITE",
      message:
        error instanceof Error ? error.message : String(error),
      sourceSchemaRead: true,
      sourceBusinessRowsRead: false,
      sourceBusinessDatabaseCopied: false,
      prismaDbPushUsed: false,
      liveDatabaseChanged: false,
      promotionPerformed: false,
    }),
  );

  process.exit(1);
}
