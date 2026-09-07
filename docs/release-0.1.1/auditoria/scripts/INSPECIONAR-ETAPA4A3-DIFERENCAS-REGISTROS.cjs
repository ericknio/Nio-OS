#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();
const projectDb = path.join(root, "data", "nio-os.db");
const roamingDb = path.join(
  process.env.APPDATA || "",
  "Nio-OS",
  "data",
  "nio-os.db"
);
const output = path.join(root, "ETAPA4A3_DIFERENCAS_REGISTROS.json");

const TABLES = [
  "Customer",
  "ServiceOrder",
  "ServiceOrderPayment",
  "SystemUser",
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
  "NioSchemaMigration",
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeIdent(value) {
  return String(value).replaceAll('"', '""');
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

function tableInfo(db, table) {
  return db.prepare(`PRAGMA table_info("${safeIdent(table)}")`).all();
}

function primaryKeyColumns(db, table) {
  return tableInfo(db, table)
    .filter((row) => Number(row.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((row) => String(row.name));
}

function allRows(db, table) {
  return db.prepare(`SELECT * FROM "${safeIdent(table)}"`).all();
}

function canonicalValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `buffer:${value.toString("hex")}`;
  if (value === undefined) return null;
  return value;
}

function canonicalRow(row) {
  const normalized = {};
  for (const key of Object.keys(row).sort()) {
    normalized[key] = canonicalValue(row[key]);
  }
  return JSON.stringify(normalized);
}

function keyForRow(row, pkColumns) {
  if (pkColumns.length > 0) {
    return pkColumns.map((column) => String(row[column] ?? "")).join("\u001f");
  }

  // Fallback raro: sem PK, usa o hash do conteúdo.
  return `row:${sha256(canonicalRow(row))}`;
}

function hashedKey(rawKey) {
  return sha256(`nio-os-row-key:${rawKey}`);
}

function mapRows(db, table) {
  const pkColumns = primaryKeyColumns(db, table);
  const rows = allRows(db, table);
  const map = new Map();

  for (const row of rows) {
    const rawKey = keyForRow(row, pkColumns);
    map.set(rawKey, {
      rowHash: sha256(canonicalRow(row)),
    });
  }

  return {
    pkColumns,
    rows: rows.length,
    map,
  };
}

function compareTable(projectDbHandle, roamingDbHandle, table) {
  const projectTables = new Set(listTables(projectDbHandle));
  const roamingTables = new Set(listTables(roamingDbHandle));

  const projectExists = projectTables.has(table);
  const roamingExists = roamingTables.has(table);

  if (!projectExists && !roamingExists) {
    return {
      existsProject: false,
      existsRoaming: false,
    };
  }

  if (!projectExists || !roamingExists) {
    const db = projectExists ? projectDbHandle : roamingDbHandle;
    const mapped = mapRows(db, table);

    return {
      existsProject: projectExists,
      existsRoaming: roamingExists,
      projectRows: projectExists ? mapped.rows : 0,
      roamingRows: roamingExists ? mapped.rows : 0,
      primaryKeyColumns: mapped.pkColumns,
      onlyProject: projectExists ? mapped.rows : 0,
      onlyRoaming: roamingExists ? mapped.rows : 0,
      common: 0,
      commonSameRow: 0,
      commonDifferentRow: 0,
    };
  }

  const project = mapRows(projectDbHandle, table);
  const roaming = mapRows(roamingDbHandle, table);

  const projectKeys = new Set(project.map.keys());
  const roamingKeys = new Set(roaming.map.keys());

  const onlyProject = [];
  const onlyRoaming = [];
  const commonSame = [];
  const commonDifferent = [];

  for (const key of projectKeys) {
    if (!roamingKeys.has(key)) {
      onlyProject.push(hashedKey(key));
      continue;
    }

    const p = project.map.get(key);
    const r = roaming.map.get(key);

    if (p.rowHash === r.rowHash) {
      commonSame.push(hashedKey(key));
    } else {
      commonDifferent.push(hashedKey(key));
    }
  }

  for (const key of roamingKeys) {
    if (!projectKeys.has(key)) {
      onlyRoaming.push(hashedKey(key));
    }
  }

  return {
    existsProject: true,
    existsRoaming: true,
    projectRows: project.rows,
    roamingRows: roaming.rows,
    primaryKeyColumns:
      JSON.stringify(project.pkColumns) === JSON.stringify(roaming.pkColumns)
        ? project.pkColumns
        : {
            project: project.pkColumns,
            roaming: roaming.pkColumns,
          },
    onlyProject: onlyProject.length,
    onlyRoaming: onlyRoaming.length,
    common: commonSame.length + commonDifferent.length,
    commonSameRow: commonSame.length,
    commonDifferentRow: commonDifferent.length,
    // Hashes permitem correlacionar diferenças entre execuções sem expor IDs reais.
    onlyProjectKeyHashes: onlyProject,
    onlyRoamingKeyHashes: onlyRoaming,
    commonDifferentKeyHashes: commonDifferent,
  };
}

function compareMigrations(projectDbHandle, roamingDbHandle) {
  const pTables = new Set(listTables(projectDbHandle));
  const rTables = new Set(listTables(roamingDbHandle));

  if (
    !pTables.has("NioSchemaMigration") ||
    !rTables.has("NioSchemaMigration")
  ) {
    return { comparable: false };
  }

  const getRows = (db) =>
    db.prepare('SELECT * FROM "NioSchemaMigration" ORDER BY rowid').all();

  const p = getRows(projectDbHandle);
  const r = getRows(roamingDbHandle);

  function extract(row) {
    const id = String(row.id ?? row.name ?? row.migration ?? "");
    const checksum = row.checksum == null ? null : String(row.checksum);
    return { id, checksum };
  }

  const pMap = new Map(p.map((row) => {
    const item = extract(row);
    return [item.id, item];
  }));
  const rMap = new Map(r.map((row) => {
    const item = extract(row);
    return [item.id, item];
  }));

  const ids = new Set([...pMap.keys(), ...rMap.keys()]);
  const onlyProject = [];
  const onlyRoaming = [];
  const checksumMismatch = [];

  for (const id of ids) {
    const pv = pMap.get(id);
    const rv = rMap.get(id);

    if (pv && !rv) {
      onlyProject.push(id);
    } else if (!pv && rv) {
      onlyRoaming.push(id);
    } else if ((pv?.checksum ?? null) !== (rv?.checksum ?? null)) {
      checksumMismatch.push({
        id,
        projectChecksum: pv?.checksum ?? null,
        roamingChecksum: rv?.checksum ?? null,
      });
    }
  }

  return {
    comparable: true,
    onlyProject,
    onlyRoaming,
    checksumMismatch,
  };
}

function main() {
  const project = openReadOnly(projectDb);
  const roaming = openReadOnly(roamingDb);

  if (!project) {
    throw new Error(`Banco do projeto não encontrado: ${projectDb}`);
  }
  if (!roaming) {
    project.close();
    throw new Error(`Banco do Roaming não encontrado: ${roamingDb}`);
  }

  try {
    const tables = {};
    for (const table of TABLES) {
      tables[table] = compareTable(project, roaming, table);
    }

    const report = {
      ok: true,
      stage: "4A.3-DIFERENCAS-REGISTROS",
      generatedAt: new Date().toISOString(),
      safety: {
        readOnly: true,
        databaseChanged: false,
        schemaChanged: false,
        migrationExecuted: false,
        rawIdsExported: false,
        personalDataExported: false,
        rowContentsExported: false,
      },
      project: {
        path: projectDb,
        integrityCheck: project.prepare("PRAGMA integrity_check").get().integrity_check,
        foreignKeyViolations: project.prepare("PRAGMA foreign_key_check").all().length,
      },
      roaming: {
        path: roamingDb,
        integrityCheck: roaming.prepare("PRAGMA integrity_check").get().integrity_check,
        foreignKeyViolations: roaming.prepare("PRAGMA foreign_key_check").all().length,
      },
      migrations: compareMigrations(project, roaming),
      tables,
    };

    fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

    const interesting = Object.entries(tables)
      .filter(([, value]) => Number(value.onlyRoaming || 0) > 0)
      .map(([table, value]) => ({
        table,
        onlyRoaming: value.onlyRoaming,
        commonDifferentRow: value.commonDifferentRow || 0,
      }));

    console.log(
      JSON.stringify({
        ok: true,
        stage: "4A.3-DIFERENCAS-REGISTROS",
        report: path.basename(output),
        tablesWithRoamingOnlyRows: interesting,
        migrationChecksumMismatches:
          report.migrations.checksumMismatch?.length || 0,
        databaseChanged: false,
        migrationExecuted: false,
      })
    );
  } finally {
    roaming.close();
    project.close();
  }
}

main();
