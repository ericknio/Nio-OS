const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { DatabaseSync } = require("node:sqlite");
const {
  APP_VERSION,
  BASE_TABLES,
  CONTROL_TABLE,
  migrations,
  migrationChecksum,
} = require("./migrations.cjs");

const KNOWN_MIGRATION_TABLES = Object.freeze([
  ...new Set(migrations.flatMap((migration) => migration.ownedTables)),
].sort());

class SchemaMigratorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SchemaMigratorError";
    this.code = code;
    this.details = details;
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim().replace(/^\((.*)\)$/s, "$1");
}

function technicalLog(logger, event, fields = {}) {
  logger({ timestamp: new Date().toISOString(), event, ...fields });
}

function configureConnection(db, readOnly) {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (readOnly) db.exec("PRAGMA query_only = ON");
}

function runHealthChecks(db) {
  const integrityRows = db.prepare("PRAGMA integrity_check").all();
  if (
    integrityRows.length !== 1 ||
    String(integrityRows[0].integrity_check).toLowerCase() !== "ok"
  ) {
    throw new SchemaMigratorError(
      "INTEGRITY_CHECK_FAILED",
      "PRAGMA integrity_check não retornou ok."
    );
  }
  const foreignKeyRows = db.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyRows.length > 0) {
    throw new SchemaMigratorError(
      "FOREIGN_KEY_CHECK_FAILED",
      `PRAGMA foreign_key_check encontrou ${foreignKeyRows.length} violação(ões).`
    );
  }
  return { integrityCheck: "ok", foreignKeyViolations: 0 };
}

function listApplicationTables(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    )
    .all()
    .map((row) => String(row.name));
}

function tableColumns(db, table) {
  return db
    .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
    .all()
    .map((column) => ({
      name: String(column.name),
      type: String(column.type || "").toUpperCase(),
      notNull: Number(column.notnull) === 1,
      defaultValue: normalizeDefault(column.dflt_value),
      primaryKey: Number(column.pk) > 0,
    }));
}

function normalizeStructureSql(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function schemaObjectSql(db, type, name) {
  const row = db
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE type = ? AND name = ? LIMIT 1`
    )
    .get(type, name);
  return row?.sql ? String(row.sql) : "";
}

function validateStructureChecks(db, migration) {
  const checks = migration.structureChecks || {};

  for (const [table, from, targetTable, to, onDelete, onUpdate] of checks.foreignKeys || []) {
    const found = db
      .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`)
      .all()
      .some(
        (row) =>
          String(row.from) === from &&
          String(row.table) === targetTable &&
          String(row.to) === to &&
          String(row.on_delete).toUpperCase() === onDelete &&
          String(row.on_update).toUpperCase() === onUpdate
      );
    if (!found) {
      throw new SchemaMigratorError(
        "APPLIED_MIGRATION_STRUCTURE_MISMATCH",
        `Chave estrangeira incompatÃ­vel em ${table}.${from}.`,
        { migrationId: migration.id, table, column: from, structure: "foreignKey" }
      );
    }
  }

  for (const [name, table, unique, partial, expectedColumns, predicate] of checks.indexes || []) {
    const index = db
      .prepare(`PRAGMA index_list(${quoteIdentifier(table)})`)
      .all()
      .find((row) => String(row.name) === name);
    if (
      !index ||
      (Number(index.unique) === 1) !== unique ||
      (Number(index.partial) === 1) !== partial
    ) {
      throw new SchemaMigratorError(
        "APPLIED_MIGRATION_STRUCTURE_MISMATCH",
        `Ãndice incompatÃ­vel: ${name}.`,
        { migrationId: migration.id, table, index: name, structure: "index" }
      );
    }
    const actualColumns = db
      .prepare(`PRAGMA index_xinfo(${quoteIdentifier(name)})`)
      .all()
      .filter((row) => Number(row.key) === 1)
      .sort((a, b) => Number(a.seqno) - Number(b.seqno))
      .map((row) => [String(row.name), String(row.coll || "BINARY").toUpperCase()]);
    if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)) {
      throw new SchemaMigratorError(
        "APPLIED_MIGRATION_STRUCTURE_MISMATCH",
        `Colunas ou collation incompatÃ­veis no Ã­ndice ${name}.`,
        { migrationId: migration.id, table, index: name, structure: "indexColumns" }
      );
    }
    if (partial && predicate) {
      const sql = normalizeStructureSql(schemaObjectSql(db, "index", name));
      if (!sql.includes(normalizeStructureSql(predicate))) {
        throw new SchemaMigratorError(
          "APPLIED_MIGRATION_STRUCTURE_MISMATCH",
          `Predicado parcial incompatÃ­vel no Ã­ndice ${name}.`,
          { migrationId: migration.id, table, index: name, structure: "partialIndex" }
        );
      }
    }
  }

  for (const [name, table, fragments] of checks.triggers || []) {
    const sql = normalizeStructureSql(schemaObjectSql(db, "trigger", name));
    if (!sql || !fragments.every((fragment) => sql.includes(normalizeStructureSql(fragment)))) {
      throw new SchemaMigratorError(
        "APPLIED_MIGRATION_STRUCTURE_MISMATCH",
        `Trigger incompatÃ­vel: ${name}.`,
        { migrationId: migration.id, table, trigger: name, structure: "trigger" }
      );
    }
  }

  for (const [table, fragments] of Object.entries(checks.tableSqlIncludes || {})) {
    const sql = normalizeStructureSql(schemaObjectSql(db, "table", table));
    if (!sql || !fragments.every((fragment) => sql.includes(normalizeStructureSql(fragment)))) {
      throw new SchemaMigratorError(
        "APPLIED_MIGRATION_STRUCTURE_MISMATCH",
        `Constraints essenciais incompatÃ­veis na tabela ${table}.`,
        { migrationId: migration.id, table, structure: "tableSql" }
      );
    }
  }
}

function validateTables(db) {
  const tables = listApplicationTables(db);
  if (tables.length === 0) {
    throw new SchemaMigratorError(
      "EMPTY_DATABASE",
      "Banco vazio ou sem tabelas reconhecidas; criação completa não é suportada."
    );
  }
  const missingTables = BASE_TABLES.filter((table) => !tables.includes(table));
  if (missingTables.length > 0) {
    throw new SchemaMigratorError(
      "MISSING_BASE_TABLE",
      "Uma ou mais tabelas obrigatórias da baseline estão ausentes.",
      { missingTables }
    );
  }
  const acceptedTables = new Set([
    ...BASE_TABLES,
    CONTROL_TABLE,
    ...KNOWN_MIGRATION_TABLES,
  ]);
  const unknownTables = tables.filter((table) => !acceptedTables.has(table));
  if (unknownTables.length > 0) {
    throw new SchemaMigratorError(
      "UNKNOWN_TABLE",
      "Banco contém tabela não declarada no manifesto de migrações.",
      { unknownTables }
    );
  }
  return tables;
}

function validateSchemaChecks(
  db,
  migration,
  tables,
  errorCode = "APPLIED_MIGRATION_SCHEMA_MISMATCH"
) {
  const required = new Set([
    ...migration.requiredTables,
    ...migration.ownedTables,
    ...Object.keys(migration.schemaChecks),
  ]);
  const missingTables = [...required].filter((table) => !tables.includes(table));
  if (missingTables.length > 0) {
    throw new SchemaMigratorError(
      errorCode,
      `Schema incompatível com a migração ${migration.id}.`,
      { migrationId: migration.id, missingTables }
    );
  }
  for (const [table, expectedColumns] of Object.entries(migration.schemaChecks)) {
    const actualColumns = new Map(
      tableColumns(db, table).map((column) => [column.name, column])
    );
    for (const [columnName, specification] of Object.entries(expectedColumns)) {
      const [expectedType, expectedNotNull, expectedDefault] = specification;
      const actual = actualColumns.get(columnName);
      let reason = null;
      if (!actual) reason = "missing";
      else if (actual.type !== expectedType) reason = "type";
      else if (actual.notNull !== expectedNotNull) reason = "nullability";
      else if (
        specification.length >= 3 &&
        actual.defaultValue !== expectedDefault
      ) {
        reason = "default";
      }
      if (reason) {
        throw new SchemaMigratorError(
          errorCode,
          `Estrutura incompatível com a migração ${migration.id}.`,
          { migrationId: migration.id, table, column: columnName, reason }
        );
      }
    }
  }
}

function validateBaselineSchema(db, tables) {
  validateSchemaChecks(
    db,
    migrations[0],
    tables,
    "INCOMPATIBLE_BASE_SCHEMA"
  );
  return {
    compatible: true,
    baseTableCount: BASE_TABLES.length,
    knownMigrationTableCount: KNOWN_MIGRATION_TABLES.length,
    criticalTableCount: Object.keys(migrations[0].schemaChecks).length,
  };
}

function effectiveSchemaMigration(appliedCount) {
  const appliedManifest = migrations.slice(0, appliedCount);
  const schemaChecks = {};
  const requiredTables = new Set(BASE_TABLES);
  const ownedTables = new Set();
  for (const migration of appliedManifest) {
    for (const table of migration.requiredTables || []) requiredTables.add(table);
    for (const table of migration.ownedTables || []) ownedTables.add(table);
    for (const [table, columns] of Object.entries(migration.schemaChecks || {})) {
      schemaChecks[table] = { ...(schemaChecks[table] || {}), ...columns };
    }
  }
  return {
    id: appliedManifest.at(-1)?.id || "unapplied_baseline",
    requiredTables: [...requiredTables],
    ownedTables: [...ownedTables],
    schemaChecks,
  };
}

function validateEffectiveSchema(db, tables, state) {
  const effective = effectiveSchemaMigration(state.applied.length);
  validateSchemaChecks(db, effective, tables);
  for (const migration of migrations.slice(0, state.applied.length)) {
    validateStructureChecks(db, migration);
  }
  return {
    compatible: true,
    baseTableCount: BASE_TABLES.length,
    knownMigrationTableCount: KNOWN_MIGRATION_TABLES.length,
    criticalTableCount: Object.keys(effective.schemaChecks).length,
  };
}

function controlTableExists(db) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 AS found FROM sqlite_master
         WHERE type = 'table' AND name = ? LIMIT 1`
      )
      .get(CONTROL_TABLE)
  );
}

function validateControlTable(db) {
  if (!controlTableExists(db)) return false;
  const columns = new Map(
    tableColumns(db, CONTROL_TABLE).map((column) => [column.name, column])
  );
  const expected = {
    id: ["TEXT", true],
    checksum: ["TEXT", true],
    appVersion: ["TEXT", true],
    appliedAt: ["DATETIME", true, "CURRENT_TIMESTAMP"],
  };
  for (const [name, specification] of Object.entries(expected)) {
    const column = columns.get(name);
    if (
      !column ||
      column.type !== specification[0] ||
      column.notNull !== specification[1] ||
      (specification.length >= 3 &&
        column.defaultValue !== specification[2])
    ) {
      throw new SchemaMigratorError(
        "INVALID_CONTROL_TABLE",
        `Tabela de controle incompatível: ${CONTROL_TABLE}.${name}.`
      );
    }
  }
  if (!columns.get("id").primaryKey) {
    throw new SchemaMigratorError(
      "INVALID_CONTROL_TABLE",
      `Tabela de controle incompatível: ${CONTROL_TABLE}.id não é chave primária.`
    );
  }
  return true;
}

function readAppliedMigrations(db) {
  if (!controlTableExists(db)) return [];
  const duplicates = db
    .prepare(
      `SELECT "id", COUNT(*) AS total FROM "NioSchemaMigration"
       GROUP BY "id" HAVING COUNT(*) > 1 LIMIT 1`
    )
    .get();
  if (duplicates) {
    throw new SchemaMigratorError(
      "DUPLICATE_MIGRATION_RECORD",
      `Migração duplicada no histórico: ${duplicates.id}.`,
      { migrationId: String(duplicates.id) }
    );
  }
  validateControlTable(db);
  return db
    .prepare(
      `SELECT "id", "checksum", "appVersion", "appliedAt"
       FROM "NioSchemaMigration" ORDER BY rowid`
    )
    .all()
    .map((row) => ({
      id: String(row.id),
      checksum: String(row.checksum),
      appVersion: String(row.appVersion),
      appliedAt: String(row.appliedAt),
    }));
}

function migrationState(db, tables = listApplicationTables(db)) {
  const applied = readAppliedMigrations(db);
  const manifestById = new Map(
    migrations.map((migration, index) => [migration.id, { migration, index }])
  );
  const positions = [];
  for (const row of applied) {
    const entry = manifestById.get(row.id);
    if (!entry) {
      throw new SchemaMigratorError(
        "UNKNOWN_MIGRATION",
        `Banco contém migração desconhecida ou mais nova: ${row.id}.`,
        { migrationId: row.id }
      );
    }
    positions.push(entry.index);
    if (row.checksum !== entry.migration.checksum) {
      throw new SchemaMigratorError(
        "CHECKSUM_MISMATCH",
        `Checksum divergente para a migração ${row.id}.`,
        { migrationId: row.id }
      );
    }
    if (row.appVersion !== entry.migration.appVersion) {
      throw new SchemaMigratorError(
        "APP_VERSION_MISMATCH",
        `Versão divergente para a migração ${row.id}.`,
        { migrationId: row.id }
      );
    }
  }
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
    throw new SchemaMigratorError(
      "MIGRATION_ORDER_INVALID",
      "Histórico de migrações está fora de ordem."
    );
  }
  if (positions.some((position, index) => position !== index)) {
    throw new SchemaMigratorError(
      "MIGRATION_HISTORY_GAP",
      "Histórico de migrações não é um prefixo contínuo do manifesto."
    );
  }
  return { applied, pending: migrations.slice(applied.length) };
}

function assertManifestIntegrity() {
  const ids = new Set();
  const tableOwners = new Map();
  for (const migration of migrations) {
    if (ids.has(migration.id)) {
      throw new SchemaMigratorError(
        "DUPLICATE_MANIFEST_ID",
        `ID duplicado no manifesto: ${migration.id}.`
      );
    }
    ids.add(migration.id);
    for (const table of migration.ownedTables) {
      if (BASE_TABLES.includes(table) || table === CONTROL_TABLE || tableOwners.has(table)) {
        throw new SchemaMigratorError(
          "INVALID_MIGRATION_METADATA",
          `Propriedade de tabela inválida ou duplicada: ${table}.`
        );
      }
      tableOwners.set(table, migration.id);
    }
    const altered = new Set();
    for (const table of migration.alteredTables || []) {
      if (!BASE_TABLES.includes(table) || altered.has(table) || migration.ownedTables.includes(table)) {
        throw new SchemaMigratorError(
          "INVALID_MIGRATION_METADATA",
          `Tabela alterada invÃ¡lida ou duplicada: ${table}.`
        );
      }
      altered.add(table);
    }
    if (/\bPRAGMA\s+foreign_keys\b/i.test(migration.sql)) {
      throw new SchemaMigratorError(
        "INVALID_MIGRATION_METADATA",
        `A migraÃ§Ã£o ${migration.id} nÃ£o pode alterar foreign_keys por SQL.`
      );
    }
    if (migration.requiresForeignKeysOff && altered.size === 0) {
      throw new SchemaMigratorError(
        "INVALID_MIGRATION_METADATA",
        `A migraÃ§Ã£o ${migration.id} solicita foreign_keys=OFF sem tabela-base alterada.`
      );
    }
    if (migrationChecksum(migration) !== migration.checksum) {
      throw new SchemaMigratorError(
        "MANIFEST_CHECKSUM_INVALID",
        `Manifesto interno inválido para ${migration.id}.`
      );
    }
  }
}

function validateDatabaseState(db) {
  const health = runHealthChecks(db);
  const tables = validateTables(db);
  const state = migrationState(db, tables);
  const compatibility = validateEffectiveSchema(db, tables, state);
  return { health, compatibility, state };
}

function foreignKeysEnabled(db) {
  return Number(db.prepare("PRAGMA foreign_keys").get().foreign_keys) === 1;
}

function setForeignKeys(db, enabled) {
  db.exec(`PRAGMA foreign_keys = ${enabled ? "ON" : "OFF"}`);
  if (foreignKeysEnabled(db) !== enabled) {
    throw new SchemaMigratorError(
      "FOREIGN_KEYS_PRAGMA_FAILED",
      `NÃ£o foi possÃ­vel confirmar foreign_keys=${enabled ? "ON" : "OFF"}.`
    );
  }
}

function inspectDatabase(databasePath, { logger = () => {} } = {}) {
  const startedAt = performance.now();
  const resolvedPath = path.resolve(databasePath);
  const db = new DatabaseSync(resolvedPath, { readOnly: true });
  try {
    configureConnection(db, true);
    assertManifestIntegrity();
    const { health, compatibility, state } = validateDatabaseState(db);
    const report = {
      mode: "dry-run",
      databasePath: resolvedPath,
      appVersion: APP_VERSION,
      health,
      compatibility,
      applied: state.applied.map(({ id, checksum, appVersion }) => ({
        id,
        checksum,
        appVersion,
      })),
      pending: state.pending.map(({ id, checksum, appVersion }) => ({
        id,
        checksum,
        appVersion,
      })),
      durationMs: Math.round(performance.now() - startedAt),
    };
    technicalLog(logger, "dry_run_complete", {
      databasePath: resolvedPath,
      pending: report.pending.map((item) => item.id),
      durationMs: report.durationMs,
    });
    return report;
  } finally {
    db.close();
  }
}

function applyMigrations(databasePath, { logger = () => {} } = {}) {
  const startedAt = performance.now();
  const resolvedPath = path.resolve(databasePath);
  const db = new DatabaseSync(resolvedPath);
  const appliedNow = [];
  let transactionOpen = false;
  let foreignKeysTemporarilyDisabled = false;
  try {
    configureConnection(db, false);
    assertManifestIntegrity();
    const before = validateDatabaseState(db);
    let state = before.state;
    foreignKeysTemporarilyDisabled = state.pending.some(
      (migration) => migration.requiresForeignKeysOff
    );
    if (foreignKeysTemporarilyDisabled) setForeignKeys(db, false);
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    for (const migration of state.pending) {
      db.exec(migration.sql);
      validateControlTable(db);
      db.prepare(
        `INSERT INTO "NioSchemaMigration" ("id", "checksum", "appVersion")
         VALUES (?, ?, ?)`
      ).run(migration.id, migration.checksum, migration.appVersion);
      const tables = validateTables(db);
      state = migrationState(db, tables);
      appliedNow.push(migration.id);
      technicalLog(logger, "migration_applied", {
        databasePath: resolvedPath,
        migrationId: migration.id,
        checksum: migration.checksum.slice(0, 12),
      });
    }
    const after = validateDatabaseState(db);
    db.exec("COMMIT");
    transactionOpen = false;
    if (foreignKeysTemporarilyDisabled) {
      setForeignKeys(db, true);
      foreignKeysTemporarilyDisabled = false;
    }
    return {
      mode: "apply",
      databasePath: resolvedPath,
      appVersion: APP_VERSION,
      healthBefore: before.health,
      healthAfter: after.health,
      appliedNow,
      applied: after.state.applied.map((item) => item.id),
      pending: after.state.pending.map((item) => item.id),
      foreignKeysEnabled: foreignKeysEnabled(db),
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    if (transactionOpen) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // O fechamento da conexão libera a transação em último caso.
      }
    }
    throw error;
  } finally {
    if (foreignKeysTemporarilyDisabled) {
      setForeignKeys(db, true);
    }
    db.close();
  }
}

module.exports = {
  APP_VERSION,
  BASE_TABLES,
  CONTROL_TABLE,
  KNOWN_MIGRATION_TABLES,
  SchemaMigratorError,
  applyMigrations,
  inspectDatabase,
  runHealthChecks,
  validateBaselineSchema,
  validateDatabaseState,
  validateStructureChecks,
};
