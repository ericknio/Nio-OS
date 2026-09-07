#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();
const output = path.join(root, "ETAPA4A1_MAPA_BANCOS_APPDATA.json");

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);

  try {
    while (true) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!read) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }

  return hash.digest("hex");
}

function fileInfo(file) {
  if (!fs.existsSync(file)) return { exists: false };

  const stat = fs.statSync(file);

  return {
    exists: true,
    path: file,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    sha256: stat.isFile() ? sha256File(file) : null,
  };
}

function directoryStats(dir) {
  if (!fs.existsSync(dir)) {
    return { exists: false, files: 0, sizeBytes: 0 };
  }

  let files = 0;
  let sizeBytes = 0;

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files += 1;
        sizeBytes += fs.statSync(full).size;
      }
    }
  }

  walk(dir);

  return {
    exists: true,
    path: dir,
    files,
    sizeBytes,
  };
}

function readDatabaseUrl() {
  const envFile = path.join(root, ".env");
  if (!fs.existsSync(envFile)) return null;

  const source = fs.readFileSync(envFile, "utf8");
  const match = source.match(
    /^\s*DATABASE_URL\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\r\n#]*))\s*$/m
  );

  return match ? String(match[1] ?? match[2] ?? match[3] ?? "").trim() : null;
}

function resolveDatabaseUrl(databaseUrl) {
  if (!databaseUrl || !databaseUrl.startsWith("file:")) return null;

  let raw = databaseUrl.slice(5);

  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Mantém literal se não for URL-encoded válida.
  }

  if (/^\/[A-Za-z]:[\\/]/.test(raw)) raw = raw.slice(1);

  if (path.isAbsolute(raw)) return path.normalize(raw);

  // Sem alterar o projeto: mostra as duas interpretações relevantes.
  return {
    relativeToProject: path.resolve(root, raw),
    relativeToPrismaSchema: path.resolve(root, "prisma", raw),
  };
}

function inspectSqlite(dbFile) {
  if (!fs.existsSync(dbFile) || !fs.statSync(dbFile).isFile()) {
    return { exists: false };
  }

  const base = fileInfo(dbFile);
  const wal = fileInfo(`${dbFile}-wal`);
  const shm = fileInfo(`${dbFile}-shm`);

  let db;
  try {
    db = new DatabaseSync(dbFile, { readOnly: true });

    const integrity = db.prepare("PRAGMA integrity_check").all();
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((row) => String(row.name));

    const migrationTableCandidates = [
      "_nio_schema_migrations",
      "NioSchemaMigration",
      "SchemaMigration",
      "_prisma_migrations",
    ];

    const migrationTables = migrationTableCandidates.filter((name) =>
      tables.includes(name)
    );

    return {
      ...base,
      wal,
      shm,
      integrityCheck:
        integrity.length === 1 && String(integrity[0].integrity_check) === "ok"
          ? "ok"
          : integrity,
      foreignKeyViolations: foreignKeys.length,
      tableCount: tables.length,
      migrationTables,
    };
  } catch (error) {
    return {
      ...base,
      wal,
      shm,
      readOnlyOpenError:
        error instanceof Error ? error.message : "Falha ao abrir SQLite.",
    };
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

function runtimeRootInfo(name, base) {
  if (!base) return { name, available: false };

  const rootDir = path.join(base, "Nio-OS");
  const dbFile = path.join(rootDir, "data", "nio-os.db");

  return {
    name,
    available: true,
    root: rootDir,
    rootExists: fs.existsSync(rootDir),
    database: inspectSqlite(dbFile),
    data: directoryStats(path.join(rootDir, "data")),
    backups: directoryStats(path.join(rootDir, "backups")),
    publicUploads: directoryStats(path.join(rootDir, "public", "uploads")),
    storage: directoryStats(path.join(rootDir, "storage")),
    runtimeEnvExists: fs.existsSync(path.join(rootDir, ".env")),
    desktopConfigExists:
      fs.existsSync(path.join(rootDir, "nio-os-desktop-config.json")) ||
      fs.existsSync(path.join(rootDir, "data", "desktop-config.json")),
    desktopLogExists: fs.existsSync(path.join(rootDir, "nio-os-desktop.log")),
  };
}

function main() {
  const projectDb = path.join(root, "data", "nio-os.db");
  const databaseUrl = readDatabaseUrl();

  const report = {
    ok: true,
    stage: "4A.1-MAPA-BANCOS",
    generatedAt: new Date().toISOString(),
    safety: {
      readOnly: true,
      sqliteOpenedReadOnly: true,
      productFilesChanged: false,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
    },
    environment: {
      APPDATA: process.env.APPDATA || null,
      LOCALAPPDATA: process.env.LOCALAPPDATA || null,
      databaseUrlKind:
        databaseUrl === null
          ? "missing"
          : databaseUrl.startsWith("file:")
            ? "sqlite-file"
            : "other",
      databaseUrlResolved: resolveDatabaseUrl(databaseUrl),
    },
    project: {
      root,
      database: inspectSqlite(projectDb),
      data: directoryStats(path.join(root, "data")),
      backups: directoryStats(path.join(root, "backups")),
      publicUploads: directoryStats(path.join(root, "public", "uploads")),
      storage: directoryStats(path.join(root, "storage")),
    },
    roaming: runtimeRootInfo("APPDATA-Roaming", process.env.APPDATA || null),
    local: runtimeRootInfo(
      "LOCALAPPDATA-Local",
      process.env.LOCALAPPDATA || null
    ),
  };

  const dbs = [
    ["project", report.project.database],
    ["roaming", report.roaming.database],
    ["local", report.local.database],
  ].filter(([, info]) => info && info.exists);

  const hashes = dbs.map(([name, info]) => ({
    name,
    sha256: info.sha256,
    sizeBytes: info.sizeBytes,
    modifiedAt: info.modifiedAt,
  }));

  report.comparison = {
    databasesFound: hashes.length,
    hashes,
    allSameHash:
      hashes.length > 1 &&
      hashes.every((item) => item.sha256 === hashes[0].sha256),
  };

  fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      stage: "4A.1-MAPA-BANCOS",
      report: path.basename(output),
      projectDb: report.project.database.exists,
      roamingDb: report.roaming.database?.exists === true,
      localDb: report.local.database?.exists === true,
      databasesFound: hashes.length,
      databaseChanged: false,
      migrationExecuted: false,
    })
  );
}

main();
