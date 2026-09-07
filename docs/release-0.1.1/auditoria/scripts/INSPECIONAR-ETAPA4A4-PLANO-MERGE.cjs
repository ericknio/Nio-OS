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
const output = path.join(root, "ETAPA4A4_PLANO_MERGE_READONLY.json");

const BUSINESS_TABLES = [
  "Customer",
  "ServiceOrder",
  "ServiceOrderPayment",
  "SystemUser",
  "SystemUserPermission",
  "Product",
  "ProductSale",
  "ProductSaleItem",
  "CompanySettings",
  "HistoricoOrdem",
  "OrderFinalization",
  "OrderHistory",
  "ServiceOrderAttachment",
  "ServiceOrderInternalNote",
  "StockMovement",
  "User",
];

function safeIdent(value) {
  return String(value).replaceAll('"', '""');
}

function hashKey(value) {
  return crypto
    .createHash("sha256")
    .update(`nio-os-merge-key:${String(value)}`)
    .digest("hex");
}

function canonical(value) {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `buffer:${value.toString("hex")}`;
  if (value === undefined) return null;
  return value;
}

function sameValue(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

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

function columns(db, table) {
  return db
    .prepare(`PRAGMA table_info("${safeIdent(table)}")`)
    .all()
    .map((row) => ({
      name: String(row.name),
      type: String(row.type || ""),
      notnull: Number(row.notnull || 0),
      pk: Number(row.pk || 0),
    }));
}

function primaryKeyColumns(db, table) {
  return columns(db, table)
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
}

function foreignKeys(db, table) {
  return db
    .prepare(`PRAGMA foreign_key_list("${safeIdent(table)}")`)
    .all()
    .map((row) => ({
      table: String(row.table),
      from: String(row.from),
      to: String(row.to || "id"),
      onUpdate: String(row.on_update || ""),
      onDelete: String(row.on_delete || ""),
    }));
}

function allRows(db, table) {
  return db.prepare(`SELECT * FROM "${safeIdent(table)}"`).all();
}

function keyForRow(row, pkColumns) {
  if (!pkColumns.length) {
    const keys = Object.keys(row).sort();
    return JSON.stringify(keys.map((key) => [key, canonical(row[key])]));
  }

  return pkColumns.map((column) => String(row[column] ?? "")).join("\u001f");
}

function rowMap(db, table) {
  const pk = primaryKeyColumns(db, table);
  const rows = allRows(db, table);
  const map = new Map();

  for (const row of rows) {
    map.set(keyForRow(row, pk), row);
  }

  return { pk, rows, map };
}

function columnShapeComparison(projectDb, roamingDb, table) {
  const p = columns(projectDb, table);
  const r = columns(roamingDb, table);
  const pNames = new Set(p.map((item) => item.name));
  const rNames = new Set(r.map((item) => item.name));

  return {
    projectOnlyColumns: p.filter((item) => !rNames.has(item.name)).map((item) => item.name),
    roamingOnlyColumns: r.filter((item) => !pNames.has(item.name)).map((item) => item.name),
    commonColumns: p.filter((item) => rNames.has(item.name)).map((item) => item.name),
  };
}

function compareCommonRows(projectDb, roamingDb, table) {
  const shape = columnShapeComparison(projectDb, roamingDb, table);
  const project = rowMap(projectDb, table);
  const roaming = rowMap(roamingDb, table);

  const commonKeys = [...project.map.keys()].filter((key) => roaming.map.has(key));
  const changedRows = [];

  for (const key of commonKeys) {
    const p = project.map.get(key);
    const r = roaming.map.get(key);

    const differingColumns = shape.commonColumns.filter(
      (column) => !sameValue(p[column], r[column])
    );

    if (differingColumns.length) {
      changedRows.push({
        keyHash: hashKey(key),
        differingColumns,
      });
    }
  }

  return {
    ...shape,
    commonRows: commonKeys.length,
    commonRowsWithDifferentSharedData: changedRows.length,
    changedRows,
  };
}

function buildTableIndex(db, table) {
  const info = rowMap(db, table);
  return {
    pk: info.pk,
    keys: new Set(info.map.keys()),
    rows: info.map,
  };
}

function valueExists(db, table, column, value) {
  const sql =
    `SELECT 1 AS ok FROM "${safeIdent(table)}" ` +
    `WHERE "${safeIdent(column)}" = ? LIMIT 1`;

  return Boolean(db.prepare(sql).get(value));
}

function analyzeRoamingOnlyRows(projectDb, roamingDb, table) {
  const p = rowMap(projectDb, table);
  const r = rowMap(roamingDb, table);
  const fks = foreignKeys(roamingDb, table);

  const roamingOnlyKeys = [...r.map.keys()].filter((key) => !p.map.has(key));
  const rows = [];

  for (const key of roamingOnlyKeys) {
    const row = r.map.get(key);

    let refsAlreadyInProject = 0;
    let refsAvailableOnlyInRoaming = 0;
    let refsMissingEverywhere = 0;
    const dependencies = [];

    for (const fk of fks) {
      const value = row[fk.from];
      if (value === null || value === undefined) continue;

      const parentProjectExists = listTables(projectDb).includes(fk.table);
      const parentRoamingExists = listTables(roamingDb).includes(fk.table);

      const inProject =
        parentProjectExists && valueExists(projectDb, fk.table, fk.to, value);
      const inRoaming =
        parentRoamingExists && valueExists(roamingDb, fk.table, fk.to, value);

      if (inProject) refsAlreadyInProject += 1;
      else if (inRoaming) refsAvailableOnlyInRoaming += 1;
      else refsMissingEverywhere += 1;

      dependencies.push({
        parentTable: fk.table,
        childColumn: fk.from,
        parentColumn: fk.to,
        state: inProject
          ? "ALREADY_IN_PROJECT"
          : inRoaming
            ? "NEEDS_PARENT_IMPORT"
            : "MISSING_EVERYWHERE",
      });
    }

    rows.push({
      keyHash: hashKey(key),
      refsAlreadyInProject,
      refsAvailableOnlyInRoaming,
      refsMissingEverywhere,
      dependencies,
      insertableAfterDependencies:
        refsMissingEverywhere === 0,
    });
  }

  return {
    roamingOnlyRows: roamingOnlyKeys.length,
    rows,
  };
}

function summarizeDependencyOrder(tableAnalyses) {
  const edges = new Set();

  for (const [table, analysis] of Object.entries(tableAnalyses)) {
    for (const row of analysis.roamingOnly?.rows || []) {
      for (const dep of row.dependencies || []) {
        if (dep.state === "NEEDS_PARENT_IMPORT") {
          edges.add(`${dep.parentTable}->${table}`);
        }
      }
    }
  }

  return [...edges].sort();
}

function inspectTable(projectDb, roamingDb, table) {
  const pTables = new Set(listTables(projectDb));
  const rTables = new Set(listTables(roamingDb));

  const existsProject = pTables.has(table);
  const existsRoaming = rTables.has(table);

  if (!existsProject && !existsRoaming) {
    return { existsProject: false, existsRoaming: false };
  }

  if (!existsProject || !existsRoaming) {
    return {
      existsProject,
      existsRoaming,
      note: "Tabela não existe nos dois bancos; merge automático não deve usar esta análise.",
    };
  }

  return {
    existsProject: true,
    existsRoaming: true,
    sharedRows: compareCommonRows(projectDb, roamingDb, table),
    roamingOnly: analyzeRoamingOnlyRows(projectDb, roamingDb, table),
  };
}

function baselineChecksumInfo(db) {
  const tables = new Set(listTables(db));
  if (!tables.has("NioSchemaMigration")) return null;

  const row = db
    .prepare(
      'SELECT * FROM "NioSchemaMigration" WHERE "id" = ? LIMIT 1'
    )
    .get("20260728_000_baseline_sqlite");

  if (!row) return null;

  return {
    id: "20260728_000_baseline_sqlite",
    checksum: row.checksum == null ? null : String(row.checksum),
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
    const tableAnalyses = {};

    for (const table of BUSINESS_TABLES) {
      tableAnalyses[table] = inspectTable(projectDb, roamingDb, table);
    }

    const baselineProject = baselineChecksumInfo(projectDb);
    const baselineRoaming = baselineChecksumInfo(roamingDb);

    const report = {
      ok: true,
      stage: "4A.4-PLANO-MERGE-READONLY",
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
      baseline: {
        project: baselineProject,
        roaming: baselineRoaming,
        checksumMatches:
          Boolean(
            baselineProject &&
            baselineRoaming &&
            baselineProject.checksum === baselineRoaming.checksum
          ),
      },
      tables: tableAnalyses,
      dependencyEdgesForRoamingOnlyRows:
        summarizeDependencyOrder(tableAnalyses),
    };

    fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

    const conflicts = Object.entries(tableAnalyses)
      .filter(([, analysis]) =>
        Number(
          analysis.sharedRows?.commonRowsWithDifferentSharedData || 0
        ) > 0
      )
      .map(([table, analysis]) => ({
        table,
        rows:
          analysis.sharedRows.commonRowsWithDifferentSharedData,
        differingColumns: Array.from(
          new Set(
            analysis.sharedRows.changedRows.flatMap(
              (row) => row.differingColumns
            )
          )
        ).sort(),
      }));

    const roamingOnly = Object.entries(tableAnalyses)
      .filter(([, analysis]) =>
        Number(analysis.roamingOnly?.roamingOnlyRows || 0) > 0
      )
      .map(([table, analysis]) => ({
        table,
        rows: analysis.roamingOnly.roamingOnlyRows,
        allDependenciesResolvable:
          analysis.roamingOnly.rows.every(
            (row) => row.insertableAfterDependencies
          ),
      }));

    console.log(
      JSON.stringify({
        ok: true,
        stage: "4A.4-PLANO-MERGE-READONLY",
        report: path.basename(output),
        conflicts,
        roamingOnly,
        dependencyEdges:
          report.dependencyEdgesForRoamingOnlyRows,
        baselineChecksumMatches:
          report.baseline.checksumMatches,
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
