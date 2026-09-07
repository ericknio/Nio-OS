#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();

if (process.platform !== "win32") {
  throw new Error("A inspeção 4A.10D.1 foi preparada exclusivamente para Windows.");
}

const LOCALAPPDATA = process.env.LOCALAPPDATA || "";

if (!LOCALAPPDATA) {
  throw new Error("LOCALAPPDATA não está disponível.");
}

const approvedDb = path.join(
  root,
  "data",
  "nio-os-merge-preview-4a5b-2026-08-11T15-55-30-510Z.db",
);

const runtimeDb = path.join(
  LOCALAPPDATA,
  "Nio-OS",
  "data",
  "nio-os.db",
);

const EXPECTED_APPROVED_SHA =
  "bb0bf660bfc74528ee5355af787a835aaff75e288d7fe01a022518203569d675";

const reportFile = path.join(
  root,
  "ETAPA4A10D1_COMPARAR_RUNTIME_CANDIDATO.json",
);

const MAX_ROW_DIFFS_PER_TABLE = 100;

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

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

function requireFile(file, label) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`${label} não encontrado: ${file}`);
  }
}

function safeIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizeValue(value) {
  if (value === null || value === undefined) return null;

  if (Buffer.isBuffer(value)) {
    return {
      type: "blob",
      size: value.length,
      sha256: sha256Buffer(value),
    };
  }

  if (typeof value === "bigint") {
    return {
      type: "bigint",
      value: value.toString(),
    };
  }

  if (typeof value === "number") {
    if (Number.isNaN(value)) return { type: "number", value: "NaN" };
    if (!Number.isFinite(value)) {
      return { type: "number", value: String(value) };
    }
  }

  return value;
}

function canonicalRow(row, columns) {
  const normalized = {};

  for (const column of columns) {
    normalized[column] = normalizeValue(row[column]);
  }

  return JSON.stringify(normalized);
}

function dbHealth(db) {
  const integrity = db.prepare("PRAGMA integrity_check").all();
  const fk = db.prepare("PRAGMA foreign_key_check").all();

  return {
    integrityCheck:
      integrity.length === 1
        ? String(integrity[0].integrity_check)
        : integrity,
    foreignKeyViolations: fk.length,
  };
}

function tableNames(db) {
  return db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type='table'
         AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .map((row) => String(row.name));
}

function tableInfo(db, table) {
  return db
    .prepare(`PRAGMA table_info(${safeIdent(table)})`)
    .all()
    .map((row) => ({
      name: String(row.name),
      type: String(row.type || ""),
      notnull: Number(row.notnull || 0),
      defaultValue: row.dflt_value ?? null,
      pk: Number(row.pk || 0),
    }));
}

function schemaSql(db, table) {
  const row = db
    .prepare(
      `SELECT sql
       FROM sqlite_master
       WHERE type='table' AND name=?`,
    )
    .get(table);

  return String(row?.sql || "");
}

function primaryKeyColumns(info) {
  return info
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
}

function rowKey(row, pkColumns, fallbackIndex) {
  if (pkColumns.length === 0) {
    return `__row_${fallbackIndex}`;
  }

  return pkColumns
    .map((column) => `${column}=${String(row[column])}`)
    .join("|");
}

function loadTable(db, table) {
  const info = tableInfo(db, table);
  const columns = info.map((column) => column.name);
  const pkColumns = primaryKeyColumns(info);

  const rows = db
    .prepare(`SELECT * FROM ${safeIdent(table)}`)
    .all();

  const map = new Map();

  rows.forEach((row, index) => {
    const key = rowKey(row, pkColumns, index);
    const canonical = canonicalRow(row, columns);

    map.set(key, {
      row,
      canonical,
      hash: sha256Text(canonical),
    });
  });

  const logicalHash = sha256Text(
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${key}\n${item.canonical}`)
      .join("\n---\n"),
  );

  return {
    info,
    columns,
    pkColumns,
    count: rows.length,
    logicalHash,
    rows: map,
  };
}

function changedColumns(a, b, columns) {
  const changed = [];

  for (const column of columns) {
    const av = JSON.stringify(normalizeValue(a[column]));
    const bv = JSON.stringify(normalizeValue(b[column]));

    if (av !== bv) changed.push(column);
  }

  return changed;
}

function compareTable(approvedDbHandle, runtimeDbHandle, table) {
  const approvedSchema = schemaSql(approvedDbHandle, table);
  const runtimeSchema = schemaSql(runtimeDbHandle, table);

  const approved = loadTable(approvedDbHandle, table);
  const runtime = loadTable(runtimeDbHandle, table);

  const schemaSame =
    approvedSchema.replace(/\s+/g, " ").trim() ===
    runtimeSchema.replace(/\s+/g, " ").trim();

  const keys = new Set([
    ...approved.rows.keys(),
    ...runtime.rows.keys(),
  ]);

  const added = [];
  const removed = [];
  const changed = [];

  for (const key of [...keys].sort()) {
    const a = approved.rows.get(key);
    const r = runtime.rows.get(key);

    if (!a && r) {
      if (added.length < MAX_ROW_DIFFS_PER_TABLE) {
        added.push({ key });
      }
      continue;
    }

    if (a && !r) {
      if (removed.length < MAX_ROW_DIFFS_PER_TABLE) {
        removed.push({ key });
      }
      continue;
    }

    if (a && r && a.hash !== r.hash) {
      if (changed.length < MAX_ROW_DIFFS_PER_TABLE) {
        changed.push({
          key,
          changedColumns: changedColumns(
            a.row,
            r.row,
            approved.columns,
          ),
        });
      }
    }
  }

  return {
    schemaSame,
    approvedCount: approved.count,
    runtimeCount: runtime.count,
    logicalSame:
      schemaSame &&
      approved.logicalHash === runtime.logicalHash,
    approvedLogicalHash: approved.logicalHash,
    runtimeLogicalHash: runtime.logicalHash,
    primaryKeyColumns: approved.pkColumns,
    addedCount: [...keys].filter(
      (key) =>
        !approved.rows.has(key) &&
        runtime.rows.has(key),
    ).length,
    removedCount: [...keys].filter(
      (key) =>
        approved.rows.has(key) &&
        !runtime.rows.has(key),
    ).length,
    changedCount: [...keys].filter((key) => {
      const a = approved.rows.get(key);
      const r = runtime.rows.get(key);
      return Boolean(a && r && a.hash !== r.hash);
    }).length,
    sample: {
      added,
      removed,
      changed,
    },
  };
}

function inspectFile(file) {
  requireFile(file, path.basename(file));

  const stat = fs.statSync(file);

  return {
    path: file,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    sha256: sha256File(file),
    walExists: fs.existsSync(`${file}-wal`),
    shmExists: fs.existsSync(`${file}-shm`),
  };
}

function main() {
  const approvedFile = inspectFile(approvedDb);
  const runtimeFile = inspectFile(runtimeDb);

  if (approvedFile.sha256 !== EXPECTED_APPROVED_SHA) {
    throw new Error(
      `Banco candidato aprovado mudou. Esperado ${EXPECTED_APPROVED_SHA}, atual ${approvedFile.sha256}.`,
    );
  }

  if (
    approvedFile.walExists ||
    approvedFile.shmExists ||
    runtimeFile.walExists ||
    runtimeFile.shmExists
  ) {
    throw new Error(
      "Existe WAL/SHM ativo. Feche completamente o Nio-OS antes da inspeção.",
    );
  }

  const approved = new DatabaseSync(approvedDb, {
    readOnly: true,
  });
  const runtime = new DatabaseSync(runtimeDb, {
    readOnly: true,
  });

  try {
    const approvedHealth = dbHealth(approved);
    const runtimeHealth = dbHealth(runtime);

    const approvedTables = tableNames(approved);
    const runtimeTables = tableNames(runtime);

    const allTables = new Set([
      ...approvedTables,
      ...runtimeTables,
    ]);

    const tables = {};
    const changedTables = [];
    const missingInRuntime = [];
    const extraInRuntime = [];

    for (const table of [...allTables].sort()) {
      const inApproved = approvedTables.includes(table);
      const inRuntime = runtimeTables.includes(table);

      if (!inApproved) {
        extraInRuntime.push(table);
        continue;
      }

      if (!inRuntime) {
        missingInRuntime.push(table);
        continue;
      }

      const comparison = compareTable(
        approved,
        runtime,
        table,
      );

      tables[table] = comparison;

      if (!comparison.logicalSame) {
        changedTables.push(table);
      }
    }

    const logicalEquivalent =
      changedTables.length === 0 &&
      missingInRuntime.length === 0 &&
      extraInRuntime.length === 0;

    const report = {
      ok: true,
      stage: "4A.10D.1-COMPARAR-RUNTIME-CANDIDATO",
      generatedAt: new Date().toISOString(),
      safety: {
        readOnly: true,
        databaseChanged: false,
        schemaChanged: false,
        migrationExecuted: false,
        valuesExported: false,
        sensitiveValuesExported: false,
      },
      approved: {
        file: approvedFile,
        health: approvedHealth,
        tableCount: approvedTables.length,
      },
      runtime: {
        file: runtimeFile,
        health: runtimeHealth,
        tableCount: runtimeTables.length,
      },
      comparison: {
        physicalHashSame:
          approvedFile.sha256 === runtimeFile.sha256,
        logicalEquivalent,
        changedTables,
        missingInRuntime,
        extraInRuntime,
      },
      tables,
    };

    fs.writeFileSync(
      reportFile,
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log(
      JSON.stringify({
        ok: true,
        stage: report.stage,
        report: path.basename(reportFile),
        approvedSha256: approvedFile.sha256,
        runtimeSha256: runtimeFile.sha256,
        approvedIntegrity:
          approvedHealth.integrityCheck,
        runtimeIntegrity:
          runtimeHealth.integrityCheck,
        runtimeForeignKeyViolations:
          runtimeHealth.foreignKeyViolations,
        physicalHashSame:
          report.comparison.physicalHashSame,
        logicalEquivalent,
        changedTables,
        databaseChanged: false,
      }),
    );
  } finally {
    approved.close();
    runtime.close();
  }
}

main();
