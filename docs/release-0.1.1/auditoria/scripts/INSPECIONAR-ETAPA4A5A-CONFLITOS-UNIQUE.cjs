#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();
const projectDbFile = path.join(root, "data", "nio-os.db");
const roamingDbFile = path.join(
  process.env.APPDATA || "",
  "Nio-OS",
  "data",
  "nio-os.db"
);
const output = path.join(root, "ETAPA4A5A_CONFLITOS_UNIQUE.json");

const TABLES = [
  "Customer",
  "Product",
  "ServiceOrder",
  "ProductSale",
  "ProductSaleItem",
  "ServiceOrderPayment",
  "OrderFinalization",
  "OrderHistory",
  "StockMovement",
];

function safeIdent(value) {
  return String(value).replaceAll('"', '""');
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(`nio-os-unique:${String(value)}`)
    .digest("hex");
}

function canonical(value) {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `buffer:${value.toString("hex")}`;
  if (value === undefined) return null;
  return value;
}

function same(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function openReadOnly(file) {
  if (!file || !fs.existsSync(file)) return null;
  return new DatabaseSync(file, { readOnly: true });
}

function tableExists(db, table) {
  return Boolean(
    db
      .prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1"
      )
      .get(table)
  );
}

function tableInfo(db, table) {
  return db.prepare(`PRAGMA table_info("${safeIdent(table)}")`).all();
}

function columns(db, table) {
  return tableInfo(db, table).map((row) => String(row.name));
}

function pkColumns(db, table) {
  return tableInfo(db, table)
    .filter((row) => Number(row.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((row) => String(row.name));
}

function allRows(db, table) {
  return db.prepare(`SELECT * FROM "${safeIdent(table)}"`).all();
}

function rowKey(row, primaryKeyColumns) {
  return primaryKeyColumns
    .map((column) => String(row[column] ?? ""))
    .join("\u001f");
}

function rowMap(db, table) {
  const pk = pkColumns(db, table);
  const rows = allRows(db, table);
  const map = new Map();

  for (const row of rows) {
    map.set(rowKey(row, pk), row);
  }

  return { pk, rows, map };
}

function uniqueIndexes(db, table) {
  const indexes = db
    .prepare(`PRAGMA index_list("${safeIdent(table)}")`)
    .all()
    .filter((row) => Number(row.unique) === 1);

  const result = [];

  for (const index of indexes) {
    const name = String(index.name);
    const indexColumns = db
      .prepare(`PRAGMA index_info("${safeIdent(name)}")`)
      .all()
      .sort((a, b) => Number(a.seqno) - Number(b.seqno))
      .map((row) => String(row.name))
      .filter(Boolean);

    if (!indexColumns.length) continue;

    result.push({
      name,
      origin: String(index.origin || ""),
      columns: indexColumns,
    });
  }

  return result;
}

function findByUnique(db, table, indexColumns, row) {
  const values = indexColumns.map((column) => row[column]);

  // SQLite permite vários NULLs em UNIQUE; não trate NULL como colisão.
  if (values.some((value) => value === null || value === undefined)) {
    return null;
  }

  const where = indexColumns
    .map((column) => `"${safeIdent(column)}" = ?`)
    .join(" AND ");

  return (
    db
      .prepare(`SELECT * FROM "${safeIdent(table)}" WHERE ${where} LIMIT 1`)
      .get(...values) || null
  );
}

function differingColumns(projectDb, roamingDb, table, projectRow, roamingRow) {
  const pCols = new Set(columns(projectDb, table));
  const common = columns(roamingDb, table).filter((column) => pCols.has(column));

  return common.filter((column) => !same(projectRow[column], roamingRow[column]));
}

function inspectTable(projectDb, roamingDb, table) {
  if (!tableExists(projectDb, table) || !tableExists(roamingDb, table)) {
    return {
      existsProject: tableExists(projectDb, table),
      existsRoaming: tableExists(roamingDb, table),
      roamingOnlyRows: 0,
      collisions: [],
    };
  }

  const project = rowMap(projectDb, table);
  const roaming = rowMap(roamingDb, table);
  const indexes = uniqueIndexes(projectDb, table);

  const roamingOnly = [...roaming.map.entries()].filter(
    ([key]) => !project.map.has(key)
  );

  const collisions = [];

  for (const [sourceKey, sourceRow] of roamingOnly) {
    for (const index of indexes) {
      // PK duplicada já foi excluída pela definição de "roaming only".
      if (index.origin === "pk") continue;

      const targetRow = findByUnique(
        projectDb,
        table,
        index.columns,
        sourceRow
      );

      if (!targetRow) continue;

      const targetKey = rowKey(targetRow, project.pk);

      collisions.push({
        sourceKeyHash: hash(sourceKey),
        targetKeyHash: hash(targetKey),
        uniqueIndex: index.name,
        uniqueColumns: index.columns,
        differingColumns: differingColumns(
          projectDb,
          roamingDb,
          table,
          targetRow,
          sourceRow
        ),
      });
    }
  }

  return {
    existsProject: true,
    existsRoaming: true,
    primaryKeyColumns: project.pk,
    uniqueIndexes: indexes,
    roamingOnlyRows: roamingOnly.length,
    collisions,
  };
}

function main() {
  const projectDb = openReadOnly(projectDbFile);
  const roamingDb = openReadOnly(roamingDbFile);

  if (!projectDb) {
    throw new Error(`Banco do projeto não encontrado: ${projectDbFile}`);
  }

  if (!roamingDb) {
    projectDb.close();
    throw new Error(`Banco do Roaming não encontrado: ${roamingDbFile}`);
  }

  try {
    const tables = {};

    for (const table of TABLES) {
      tables[table] = inspectTable(projectDb, roamingDb, table);
    }

    const collisions = Object.entries(tables)
      .flatMap(([table, info]) =>
        info.collisions.map((collision) => ({
          table,
          ...collision,
        }))
      );

    const report = {
      ok: true,
      stage: "4A.5A-CONFLITOS-UNIQUE",
      generatedAt: new Date().toISOString(),
      safety: {
        readOnly: true,
        databaseChanged: false,
        schemaChanged: false,
        migrationExecuted: false,
        rawIdsExported: false,
        rowValuesExported: false,
        personalDataExported: false,
      },
      project: {
        path: projectDbFile,
        integrityCheck: projectDb
          .prepare("PRAGMA integrity_check")
          .get().integrity_check,
        foreignKeyViolations: projectDb
          .prepare("PRAGMA foreign_key_check")
          .all().length,
      },
      roaming: {
        path: roamingDbFile,
        integrityCheck: roamingDb
          .prepare("PRAGMA integrity_check")
          .get().integrity_check,
        foreignKeyViolations: roamingDb
          .prepare("PRAGMA foreign_key_check")
          .all().length,
      },
      tables,
      summary: {
        collisionCount: collisions.length,
        collisions,
      },
    };

    fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

    console.log(
      JSON.stringify({
        ok: true,
        stage: "4A.5A-CONFLITOS-UNIQUE",
        report: path.basename(output),
        collisionCount: collisions.length,
        collisions: collisions.map((item) => ({
          table: item.table,
          uniqueColumns: item.uniqueColumns,
          differingColumns: item.differingColumns,
        })),
        databaseChanged: false,
        migrationExecuted: false,
      })
    );
  } finally {
    roamingDb.close();
    projectDb.close();
  }
}

main();
