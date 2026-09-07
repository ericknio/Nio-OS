#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  SchemaMigratorError,
  applyMigrations,
  inspectDatabase,
} = require("./core.cjs");

function parseArguments(argv) {
  const result = {
    databasePath: "",
    mode: "",
    json: false,
    backupDir: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--db") {
      result.databasePath = argv[index + 1] || "";
      index += 1;
    } else if (argument === "--dry-run") {
      result.mode = result.mode ? "invalid" : "dry-run";
    } else if (argument === "--apply") {
      result.mode = result.mode ? "invalid" : "apply";
    } else if (argument === "--json") {
      result.json = true;
    } else if (argument === "--backup-dir") {
      result.backupDir = argv[index + 1] || "";
      index += 1;
    } else {
      throw new SchemaMigratorError(
        "INVALID_ARGUMENT",
        `Argumento desconhecido: ${argument}`
      );
    }
  }
  if (!result.databasePath) {
    throw new SchemaMigratorError(
      "DATABASE_PATH_REQUIRED",
      "Informe um caminho explícito com --db."
    );
  }
  if (!["dry-run", "apply"].includes(result.mode)) {
    throw new SchemaMigratorError(
      "MODE_REQUIRED",
      "Informe exatamente um modo: --dry-run ou --apply."
    );
  }
  if (result.backupDir && !path.isAbsolute(result.backupDir)) {
    throw new SchemaMigratorError(
      "BACKUP_DIRECTORY_MUST_BE_ABSOLUTE",
      "O diretório de backup deve usar caminho absoluto."
    );
  }
  return result;
}

function fileHash(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function sanitizeMigrationId(migrationId) {
  const sanitized = String(migrationId)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  if (!sanitized) {
    throw new SchemaMigratorError(
      "INVALID_MIGRATION_ID_FOR_BACKUP",
      "ID da migração não pode ser usado com segurança no nome do backup."
    );
  }
  return sanitized;
}

function backupPathFor(databasePath, migrationId, backupDir = "") {
  const parsed = path.parse(databasePath);
  const suffix = sanitizeMigrationId(migrationId);
  const destinationDir = backupDir || parsed.dir;
  const basePath = path.join(
    destinationDir,
    `${parsed.name}.before-schema-${suffix}${parsed.ext || ".db"}`
  );
  if (!fs.existsSync(basePath)) return basePath;
  let sequence = 2;
  while (true) {
    const candidate = path.join(
      destinationDir,
      `${parsed.name}.before-schema-${suffix}-${sequence}${parsed.ext || ".db"}`
    );
    if (!fs.existsSync(candidate)) return candidate;
    sequence += 1;
  }
}

function createVerifiedBackup(databasePath, migrationId, backupDir = "") {
  const walPath = `${databasePath}-wal`;
  const shmPath = `${databasePath}-shm`;
  if (fs.existsSync(walPath) || fs.existsSync(shmPath)) {
    throw new SchemaMigratorError(
      "WAL_OR_SHM_PRESENT",
      "Backup pré-migração recusado: existem arquivos WAL ou SHM."
    );
  }

  const lockDb = new DatabaseSync(databasePath);
  let locked = false;
  try {
    lockDb.exec("PRAGMA busy_timeout = 5000");
    lockDb.exec("BEGIN EXCLUSIVE");
    locked = true;
    const beforeHash = fileHash(databasePath);
    const destinationDir = backupDir || path.dirname(databasePath);
    fs.mkdirSync(destinationDir, { recursive: true });
    const backupPath = backupPathFor(databasePath, migrationId, destinationDir);
    if (path.resolve(backupPath) === path.resolve(databasePath)) {
      throw new SchemaMigratorError(
        "BACKUP_DESTINATION_INVALID",
        "O backup não pode substituir o próprio banco."
      );
    }
    fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
    const backupHash = fileHash(backupPath);
    if (beforeHash !== backupHash) {
      throw new SchemaMigratorError(
        "BACKUP_HASH_MISMATCH",
        "Hash do backup pré-migração diverge do banco de teste."
      );
    }
    lockDb.exec("ROLLBACK");
    locked = false;
    return { backupPath, beforeHash, backupHash };
  } finally {
    if (locked) {
      try {
        lockDb.exec("ROLLBACK");
      } catch {
        // O fechamento da conexão libera o lock em último caso.
      }
    }
    lockDb.close();
  }
}

let jsonMode = process.argv.includes("--json");
let jsonContext = {
  mode: process.argv.includes("--dry-run") ? "dry-run" : "apply",
  database: null,
  pending: [],
  applied: [],
  backupPath: null,
  schemaVersion: null,
  migrationId: null,
};

function logTechnical(entry) {
  const fields = Object.entries(entry)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
  const output = `[schema-migrator] ${fields}`;
  if (jsonMode) console.error(output);
  else console.log(output);
}

function printReport(report, backup = null) {
  console.log(`modo=${report.mode}`);
  console.log(`banco=${report.databasePath}`);
  console.log(`appVersion=${report.appVersion}`);
  console.log(`integrity_check=${report.healthAfter?.integrityCheck || report.health.integrityCheck}`);
  console.log(
    `foreign_key_violations=${
      report.healthAfter?.foreignKeyViolations ?? report.health.foreignKeyViolations
    }`
  );
  console.log(`aplicadas_agora=${(report.appliedNow || []).join(",") || "nenhuma"}`);
  console.log(`pendentes=${report.pending.map((item) => item.id || item).join(",") || "nenhuma"}`);
  if (backup) {
    console.log(`backup=${backup.backupPath}`);
    console.log(`backup_hash_ok=${backup.beforeHash === backup.backupHash}`);
  }
}

function sanitizeErrorMessage(message) {
  let sanitized = String(message);
  const databaseArgument = process.argv[process.argv.indexOf("--db") + 1] || "";
  if (databaseArgument) {
    sanitized = sanitized.replaceAll(String(databaseArgument), "[banco]");
  }
  if (jsonContext.backupPath) {
    sanitized = sanitized.replaceAll(String(jsonContext.backupPath), "[backup]");
  }
  return sanitized;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  jsonMode = options.json;
  jsonContext.mode = options.mode;
  jsonContext.database = path.basename(options.databasePath);
  const databasePath = path.resolve(options.databasePath);
  if (!fs.existsSync(databasePath)) {
    throw new SchemaMigratorError(
      "DATABASE_NOT_FOUND",
      `Banco não encontrado: ${databasePath}`
    );
  }

  if (options.mode === "dry-run") {
    const report = inspectDatabase(databasePath, { logger: logTechnical });
    if (options.json) {
      const applied = report.applied.map((item) => item.id);
      console.log(JSON.stringify({
        ok: true,
        mode: "dry-run",
        database: path.basename(databasePath),
        pending: report.pending.map((item) => item.id),
        applied,
        backupPath: null,
        schemaVersion: applied.at(-1) || null,
        migrationId: null,
        integrityCheck: report.health.integrityCheck,
        foreignKeyViolations: report.health.foreignKeyViolations,
        code: "OK",
      }));
    } else {
      printReport(report);
    }
    return;
  }

  const inspection = inspectDatabase(databasePath, { logger: logTechnical });
  jsonContext.pending = inspection.pending.map((item) => item.id);
  jsonContext.applied = inspection.applied.map((item) => item.id);
  if (inspection.pending.length === 0) {
    const report = {
      ...inspection,
      mode: "apply",
      appliedNow: [],
    };
    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        mode: "apply",
        database: path.basename(databasePath),
        pending: [],
        applied: [],
        backupPath: null,
        schemaVersion: jsonContext.applied.at(-1) || null,
        migrationId: null,
        integrityCheck: report.health.integrityCheck,
        foreignKeyViolations: report.health.foreignKeyViolations,
        code: "OK",
      }));
    } else {
      printReport(report);
    }
    return;
  }

  const lastPendingMigration = inspection.pending.at(-1);
  jsonContext.migrationId = lastPendingMigration.id;
  const backup = createVerifiedBackup(
    databasePath,
    lastPendingMigration.id,
    options.backupDir
  );
  jsonContext.backupPath = backup.backupPath;
  const report = applyMigrations(databasePath, { logger: logTechnical });
  if (options.json) {
    console.log(JSON.stringify({
      ok: true,
      mode: "apply",
      database: path.basename(databasePath),
      pending: report.pending,
      applied: report.appliedNow,
      backupPath: backup.backupPath,
      schemaVersion: report.applied.at(-1) || null,
      migrationId: report.appliedNow.at(-1) || lastPendingMigration.id,
      integrityCheck: report.healthAfter.integrityCheck,
      foreignKeyViolations: report.healthAfter.foreignKeyViolations,
      code: "OK",
    }));
  } else {
    printReport(report, backup);
  }
}

try {
  main();
} catch (error) {
  const code =
    error instanceof SchemaMigratorError ? error.code : "UNEXPECTED_ERROR";
  const message =
    error instanceof Error ? error.message : "Falha desconhecida no migrador.";
  const migrationId =
    error instanceof SchemaMigratorError ? error.details?.migrationId || null : null;
  if (jsonMode) {
    console.log(JSON.stringify({
      ok: false,
      ...jsonContext,
      migrationId: migrationId || jsonContext.migrationId,
      code,
      message: sanitizeErrorMessage(message),
    }));
  } else {
    console.error(`[schema-migrator] erro=${code} mensagem=${JSON.stringify(message)}`);
  }
  process.exitCode = 1;
}
