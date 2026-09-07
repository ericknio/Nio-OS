#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();
const projectDb = path.join(root, "data", "nio-os.db");
const roamingDb = path.join(
  process.env.APPDATA || "",
  "Nio-OS",
  "data",
  "nio-os.db"
);
const output = path.join(root, "ETAPA4A2_COMPARACAO_BANCOS.json");

const TABLES_OF_INTEREST = [
  "Customer",
  "ServiceOrder",
  "ServiceOrderPayment",
  "SystemUser",
  "TechnicalPart",
  "ServiceOrderPart",
  "TechnicalPartMovement",
  "TechnicalPartCommandLog",
  "ServiceOrderTechnicalCommandLog",
  "Product",
  "ProductSale",
  "Warranty",
  "CompanySettings",
  "NioSchemaMigration",
];

function openReadOnly(file) {
  if (!file || !fs.existsSync(file)) return null;
  return new DatabaseSync(file, { readOnly: true });
}

function listTables(db) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => String(row.name));
}

function safeIdent(value) {
  return String(value).replaceAll('"', '""');
}

function tableColumns(db, table) {
  return db
    .prepare(`PRAGMA table_info("${safeIdent(table)}")`)
    .all()
    .map((row) => String(row.name));
}

function countRows(db, table) {
  return Number(
    db.prepare(`SELECT COUNT(*) AS c FROM "${safeIdent(table)}"`).get().c
  );
}

function maxValue(db, table, column) {
  return (
    db
      .prepare(
        `SELECT MAX("${safeIdent(column)}") AS v FROM "${safeIdent(table)}"`
      )
      .get().v ?? null
  );
}

function summarizeTable(db, table) {
  const columns = tableColumns(db, table);
  const summary = {
    exists: true,
    rows: countRows(db, table),
  };

  for (const column of [
    "updatedAt",
    "createdAt",
    "openedAt",
    "paidAt",
    "finishedAt",
    "deliveredAt",
  ]) {
    if (columns.includes(column)) {
      summary[`max_${column}`] = maxValue(db, table, column);
    }
  }

  return summary;
}

function safeMigrationRows(db, tables) {
  if (!tables.includes("NioSchemaMigration")) return [];

  const columns = tableColumns(db, "NioSchemaMigration");
  const allowed = ["id", "name", "migration", "checksum", "appliedAt", "createdAt"];
  const selected = allowed.filter((column) => columns.includes(column));

  if (selected.length === 0) return [];

  const sql =
    `SELECT ${selected.map((column) => `"${safeIdent(column)}"`).join(", ")} ` +
    `FROM "NioSchemaMigration" ORDER BY rowid`;

  return db.prepare(sql).all().map((row) => {
    const safe = {};
    for (const column of selected) safe[column] = row[column];
    return safe;
  });
}

function inspect(dbFile) {
  const db = openReadOnly(dbFile);

  if (!db) {
    return {
      exists: false,
      path: dbFile,
    };
  }

  try {
    const tables = listTables(db);
    const tableSet = new Set(tables);

    const summary = {};
    for (const table of TABLES_OF_INTEREST) {
      summary[table] = tableSet.has(table)
        ? summarizeTable(db, table)
        : { exists: false };
    }

    return {
      exists: true,
      path: dbFile,
      sizeBytes: fs.statSync(dbFile).size,
      integrityCheck: db.prepare("PRAGMA integrity_check").get().integrity_check,
      foreignKeyViolations: db.prepare("PRAGMA foreign_key_check").all().length,
      tableCount: tables.length,
      tables,
      summary,
      migrations: safeMigrationRows(db, tables),
    };
  } finally {
    db.close();
  }
}

function compare(project, roaming) {
  const allTables = Array.from(
    new Set([...(project.tables || []), ...(roaming.tables || [])])
  ).sort();

  const onlyProject = allTables.filter(
    (table) =>
      (project.tables || []).includes(table) &&
      !(roaming.tables || []).includes(table)
  );

  const onlyRoaming = allTables.filter(
    (table) =>
      (roaming.tables || []).includes(table) &&
      !(project.tables || []).includes(table)
  );

  const rowDifferences = {};
  for (const table of TABLES_OF_INTEREST) {
    const p = project.summary?.[table];
    const r = roaming.summary?.[table];

    if (!p?.exists && !r?.exists) continue;

    rowDifferences[table] = {
      project: p || { exists: false },
      roaming: r || { exists: false },
      sameRowCount: Boolean(
        p?.exists && r?.exists && p.rows === r.rows
      ),
    };
  }

  return {
    onlyProject,
    onlyRoaming,
    rowDifferences,
  };
}

function main() {
  const project = inspect(projectDb);
  const roaming = inspect(roamingDb);

  if (!project.exists) {
    throw new Error(`Banco do projeto não encontrado: ${projectDb}`);
  }

  if (!roaming.exists) {
    throw new Error(`Banco do Roaming não encontrado: ${roamingDb}`);
  }

  const report = {
    ok: true,
    stage: "4A.2-COMPARACAO-BANCOS",
    generatedAt: new Date().toISOString(),
    safety: {
      readOnly: true,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
      personalRecordsExported: false,
    },
    project,
    roaming,
    comparison: compare(project, roaming),
  };

  fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      stage: "4A.2-COMPARACAO-BANCOS",
      report: path.basename(output),
      projectTables: project.tableCount,
      roamingTables: roaming.tableCount,
      onlyProjectTables: report.comparison.onlyProject.length,
      onlyRoamingTables: report.comparison.onlyRoaming.length,
      databaseChanged: false,
      migrationExecuted: false,
    })
  );
}

main();
