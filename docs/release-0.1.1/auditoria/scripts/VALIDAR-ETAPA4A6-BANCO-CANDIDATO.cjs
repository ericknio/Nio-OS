#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { spawnSync } = require("node:child_process");

const root = process.cwd();

const PROJECT_DB = path.join(root, "data", "nio-os.db");
const ROAMING_DB = path.join(
  process.env.APPDATA || "",
  "Nio-OS",
  "data",
  "nio-os.db"
);
const CANDIDATE_DB = path.join(
  root,
  "data",
  "nio-os-merge-preview-4a5b-2026-08-11T15-55-30-510Z.db"
);

const EXPECTED = {
  projectSha:
    "ffb4dc202a3ffc67632674fd8690864ad697a6e782bd1eada261e982c6c36fec",
  roamingSha:
    "bbda6b82df5d74af7e121146355afd8fbc9bec59e9acf6db3c6667906600628f",
  candidateSha:
    "bb0bf660bfc74528ee5355af787a835aaff75e288d7fe01a022518203569d675",
  tableCount: 22,
  counts: {
    Customer: 2,
    Product: 2,
    ServiceOrder: 6,
    ProductSale: 10,
    ProductSaleItem: 10,
    ServiceOrderPayment: 8,
    OrderFinalization: 6,
    OrderHistory: 60,
    StockMovement: 10,
    SystemUser: 2,
    TechnicalPart: 2,
    ServiceOrderPart: 3,
    TechnicalPartMovement: 8,
    TechnicalPartCommandLog: 2,
    ServiceOrderTechnicalCommandLog: 5,
    NioSchemaMigration: 5,
  },
  migrations: {
    "20260728_000_baseline_sqlite":
      "83c7dce7bd156207533762b7bcedb68233fc56f90a961309529a9828af01955d",
    "20260804_001_technical_parts":
      "57ad36c0c07e14457345ae506aa4c0e18dd1dfd28a71fc27d4c4e4639241224c",
    "20260806_002_technical_part_command_log":
      "20013162c5f4f15f08618c72904a970a08e6aa2baa01ad5e3e8b66cdecfe5750",
    "20260806_003_service_order_technical_command_log":
      "e7e05f31ccb1f8664030ea58e0d98172dd30681077e31b4052e1db92298eabd4",
    "20260810_004_technician_profit_share":
      "b3678f0bd3ec0457e73214cf6805ca3ae0e1f98f6437b50c3cbb5329755e8f0e",
  },
};

const REPORT_FILE = path.join(root, "ETAPA4A6_VALIDACAO_CANDIDATO.json");

const CURRENT_BRANCH_EXACT_TABLES = [
  "SystemUser",
  "SystemUserPermission",
  "TechnicalPart",
  "ServiceOrderPart",
  "TechnicalPartMovement",
  "TechnicalPartCommandLog",
  "ServiceOrderTechnicalCommandLog",
  "NioSchemaMigration",
];

const CURRENT_ROWS_MUST_SURVIVE_EXACT = [
  "Customer",
  "ServiceOrder",
  "ServiceOrderPayment",
  "OrderFinalization",
  "ProductSale",
  "ProductSaleItem",
  "StockMovement",
];

const LEGACY_ONLY_ROWS_MUST_BE_IMPORTED_EXACT = [
  "Customer",
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

function assertFile(file, expectedSha, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`${label} não encontrado: ${file}`);
  }

  if (fs.existsSync(`${file}-wal`) || fs.existsSync(`${file}-shm`)) {
    throw new Error(
      `${label} possui WAL/SHM ativo. Feche o Nio-OS e tente novamente.`
    );
  }

  const sha = sha256File(file);

  if (sha !== expectedSha) {
    throw new Error(
      `${label} mudou desde a etapa 4A.5B. Esperado ${expectedSha}, atual ${sha}.`
    );
  }

  return sha;
}

function openReadOnly(file) {
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
    .map((row) => String(row.name));
}

function pkColumns(db, table) {
  return db
    .prepare(`PRAGMA table_info("${safeIdent(table)}")`)
    .all()
    .filter((row) => Number(row.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((row) => String(row.name));
}

function allRows(db, table) {
  return db.prepare(`SELECT * FROM "${safeIdent(table)}"`).all();
}

function rowKey(row, pk, table) {
  if (!pk.length) {
    throw new Error(`Tabela ${table} sem PK não suportada.`);
  }

  return pk.map((column) => String(row[column] ?? "")).join("\u001f");
}

function normalizeValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `buffer:${value.toString("hex")}`;
  if (value === undefined) return null;
  return value;
}

function canonicalRow(row, includeColumns = null) {
  const keys = (includeColumns || Object.keys(row)).slice().sort();
  const normalized = {};

  for (const key of keys) {
    normalized[key] = normalizeValue(row[key]);
  }

  return JSON.stringify(normalized);
}

function mapRows(db, table) {
  const pk = pkColumns(db, table);
  const rows = allRows(db, table);
  const map = new Map();

  for (const row of rows) {
    map.set(rowKey(row, pk, table), row);
  }

  return { pk, rows, map };
}

function countRows(db, table) {
  return Number(
    db.prepare(`SELECT COUNT(*) AS c FROM "${safeIdent(table)}"`).get().c
  );
}

function exactTableMatch(a, b, table) {
  if (!tableExists(a, table) || !tableExists(b, table)) return false;

  const am = mapRows(a, table);
  const bm = mapRows(b, table);

  if (am.map.size !== bm.map.size) return false;

  for (const [key, row] of am.map.entries()) {
    const other = bm.map.get(key);
    if (!other) return false;
    if (canonicalRow(row) !== canonicalRow(other)) return false;
  }

  return true;
}

function projectRowsSurviveExact(project, candidate, table) {
  const p = mapRows(project, table);
  const c = mapRows(candidate, table);

  for (const [key, row] of p.map.entries()) {
    const other = c.map.get(key);
    if (!other) return false;
    if (canonicalRow(row) !== canonicalRow(other)) return false;
  }

  return true;
}

function legacyOnlyRowsImportedExact(project, roaming, candidate, table) {
  const p = mapRows(project, table);
  const r = mapRows(roaming, table);
  const c = mapRows(candidate, table);

  let expected = 0;

  for (const [key, row] of r.map.entries()) {
    if (p.map.has(key)) continue;

    expected += 1;
    const imported = c.map.get(key);
    if (!imported) {
      return { ok: false, expected, reason: "missing-row" };
    }

    const sharedColumns = columns(roaming, table).filter((column) =>
      columns(candidate, table).includes(column)
    );

    if (
      canonicalRow(row, sharedColumns) !==
      canonicalRow(imported, sharedColumns)
    ) {
      return {
        ok: false,
        expected,
        reason: "row-content-differs",
      };
    }
  }

  return { ok: true, expected };
}

function validateProductMerge(project, roaming, candidate) {
  const p = mapRows(project, "Product");
  const r = mapRows(roaming, "Product");
  const c = mapRows(candidate, "Product");

  let importedLegacyOnly = 0;
  let reconciledCommon = 0;

  for (const [key, legacy] of r.map.entries()) {
    const current = p.map.get(key);
    const merged = c.map.get(key);

    if (!merged) {
      return { ok: false, reason: "candidate-missing-product" };
    }

    if (!current) {
      importedLegacyOnly += 1;

      const expectedStock =
        Number(legacy.stockQuantity) === 0
          ? null
          : legacy.stockQuantity;

      const commonColumns = columns(roaming, "Product").filter((column) =>
        columns(candidate, "Product").includes(column)
      );

      for (const column of commonColumns) {
        const expected =
          column === "stockQuantity"
            ? expectedStock
            : legacy[column];

        if (
          JSON.stringify(normalizeValue(merged[column])) !==
          JSON.stringify(normalizeValue(expected))
        ) {
          return {
            ok: false,
            reason: `legacy-only-product-${column}`,
          };
        }
      }

      continue;
    }

    const differences = columns(project, "Product").filter(
      (column) =>
        JSON.stringify(normalizeValue(current[column])) !==
        JSON.stringify(normalizeValue(merged[column]))
    );

    if (!differences.length) continue;

    const allowed = new Set(["stockQuantity", "updatedAt"]);

    if (!differences.every((column) => allowed.has(column))) {
      return {
        ok: false,
        reason: "common-product-unexpected-column-change",
        differences,
      };
    }

    const expectedStock =
      Number(legacy.stockQuantity) === 0
        ? null
        : legacy.stockQuantity;

    if (
      JSON.stringify(normalizeValue(merged.stockQuantity)) !==
        JSON.stringify(normalizeValue(expectedStock)) ||
      JSON.stringify(normalizeValue(merged.updatedAt)) !==
        JSON.stringify(normalizeValue(legacy.updatedAt))
    ) {
      return {
        ok: false,
        reason: "common-product-not-matching-legacy-reconciliation",
      };
    }

    reconciledCommon += 1;
  }

  return {
    ok: true,
    importedLegacyOnly,
    reconciledCommon,
  };
}

function validateCompanySettings(project, roaming, candidate) {
  const p = mapRows(project, "CompanySettings");
  const r = mapRows(roaming, "CompanySettings");
  const c = mapRows(candidate, "CompanySettings");

  if (p.map.size !== 1 || r.map.size !== 1 || c.map.size !== 1) {
    return { ok: false, reason: "unexpected-settings-row-count" };
  }

  const pRow = [...p.map.values()][0];
  const rRow = [...r.map.values()][0];
  const cRow = [...c.map.values()][0];

  if (
    JSON.stringify(normalizeValue(cRow.id)) !==
    JSON.stringify(normalizeValue(pRow.id))
  ) {
    return { ok: false, reason: "settings-id-changed" };
  }

  if (
    JSON.stringify(normalizeValue(cRow.createdAt)) !==
    JSON.stringify(normalizeValue(pRow.createdAt))
  ) {
    return { ok: false, reason: "settings-createdAt-changed" };
  }

  const shared = columns(roaming, "CompanySettings").filter(
    (column) =>
      columns(candidate, "CompanySettings").includes(column) &&
      !["id", "createdAt"].includes(column)
  );

  for (const column of shared) {
    if (
      JSON.stringify(normalizeValue(cRow[column])) !==
      JSON.stringify(normalizeValue(rRow[column]))
    ) {
      return {
        ok: false,
        reason: `settings-column-not-from-newer-legacy:${column}`,
      };
    }
  }

  return { ok: true };
}

function validateRenumberedLegacyOrder(project, roaming, candidate) {
  const p = mapRows(project, "ServiceOrder");
  const r = mapRows(roaming, "ServiceOrder");
  const c = mapRows(candidate, "ServiceOrder");

  const legacyOnly = [...r.map.entries()].filter(
    ([key]) => !p.map.has(key)
  );

  if (legacyOnly.length !== 1) {
    return {
      ok: false,
      reason: `expected-one-legacy-only-order-got-${legacyOnly.length}`,
    };
  }

  const [key, legacy] = legacyOnly[0];
  const merged = c.map.get(key);

  if (!merged) {
    return { ok: false, reason: "renumbered-order-missing" };
  }

  if (Number(legacy.osNumber) !== 3 || Number(merged.osNumber) !== 6) {
    return {
      ok: false,
      reason: "unexpected-renumbering",
      oldNumber: legacy.osNumber,
      newNumber: merged.osNumber,
    };
  }

  const sharedColumns = columns(roaming, "ServiceOrder").filter(
    (column) =>
      columns(candidate, "ServiceOrder").includes(column) &&
      column !== "osNumber"
  );

  if (
    canonicalRow(legacy, sharedColumns) !==
    canonicalRow(merged, sharedColumns)
  ) {
    return {
      ok: false,
      reason: "renumbered-order-content-changed-beyond-osNumber",
    };
  }

  const duplicates = candidate
    .prepare(
      `SELECT "osNumber", COUNT(*) AS c
       FROM "ServiceOrder"
       GROUP BY "osNumber"
       HAVING COUNT(*) > 1`
    )
    .all();

  if (duplicates.length !== 0) {
    return { ok: false, reason: "duplicate-osNumber-remains" };
  }

  const audit = candidate
    .prepare(
      `SELECT COUNT(*) AS c
       FROM "OrderHistory"
       WHERE "serviceOrderId"=?
         AND "action"='MIGRACAO_MERGE'
         AND "oldValue"='3'
         AND "newValue"='6'`
    )
    .get(merged.id);

  if (Number(audit.c) !== 1) {
    return {
      ok: false,
      reason: "merge-audit-history-not-found",
    };
  }

  return {
    ok: true,
    oldNumber: 3,
    newNumber: 6,
    auditRows: 1,
  };
}

function validateMigrations(candidate) {
  const rows = candidate
    .prepare(
      'SELECT "id","checksum" FROM "NioSchemaMigration" ORDER BY "id"'
    )
    .all();

  if (rows.length !== Object.keys(EXPECTED.migrations).length) {
    return {
      ok: false,
      reason: "migration-count-mismatch",
      count: rows.length,
    };
  }

  for (const row of rows) {
    if (EXPECTED.migrations[String(row.id)] !== String(row.checksum)) {
      return {
        ok: false,
        reason: "migration-checksum-mismatch",
        id: String(row.id),
      };
    }
  }

  return { ok: true, count: rows.length };
}

function validateUniqueConstraints(candidate) {
  const checks = [];

  if (tableExists(candidate, "ServiceOrder")) {
    checks.push({
      table: "ServiceOrder",
      columns: ["osNumber"],
      duplicates: candidate
        .prepare(
          `SELECT COUNT(*) AS c FROM (
             SELECT "osNumber"
             FROM "ServiceOrder"
             WHERE "osNumber" IS NOT NULL
             GROUP BY "osNumber"
             HAVING COUNT(*) > 1
           )`
        )
        .get().c,
    });
  }

  if (tableExists(candidate, "ProductSale")) {
    checks.push({
      table: "ProductSale",
      columns: ["saleNumber"],
      duplicates: candidate
        .prepare(
          `SELECT COUNT(*) AS c FROM (
             SELECT "saleNumber"
             FROM "ProductSale"
             WHERE "saleNumber" IS NOT NULL
             GROUP BY "saleNumber"
             HAVING COUNT(*) > 1
           )`
        )
        .get().c,
    });
  }

  if (tableExists(candidate, "OrderFinalization")) {
    checks.push({
      table: "OrderFinalization",
      columns: ["serviceOrderId"],
      duplicates: candidate
        .prepare(
          `SELECT COUNT(*) AS c FROM (
             SELECT "serviceOrderId"
             FROM "OrderFinalization"
             WHERE "serviceOrderId" IS NOT NULL
             GROUP BY "serviceOrderId"
             HAVING COUNT(*) > 1
           )`
        )
        .get().c,
    });
  }

  return {
    ok: checks.every((item) => Number(item.duplicates) === 0),
    checks,
  };
}

function prismaSmokeTest(candidateFile) {
  const prismaDir = path.join(root, "prisma");
  const smokeDb = path.join(
    prismaDir,
    `nio-os-4a6-prisma-smoke-${Date.now()}.db`
  );

  if (!fs.existsSync(prismaDir)) {
    return {
      ok: false,
      error: `Diretório Prisma não encontrado: ${prismaDir}`,
    };
  }

  fs.copyFileSync(candidateFile, smokeDb);

  const smokeUrl = `file:./${path.basename(smokeDb)}`;

  const smokeScript = `
const { PrismaClient } = require("@prisma/client");

const url = process.argv[1];

const prisma = new PrismaClient({
  datasources: { db: { url } }
});

(async () => {
  try {
    const rows = {};
    for (const table of [
      "Customer",
      "ServiceOrder",
      "ServiceOrderPayment",
      "SystemUser",
      "TechnicalPart",
      "ServiceOrderPart",
      "Product",
      "ProductSale"
    ]) {
      const result = await prisma.$queryRawUnsafe(
        'SELECT COUNT(*) AS c FROM "' + table + '"'
      );
      rows[table] = Number(result[0].c);
    }

    process.stdout.write(JSON.stringify({ ok: true, rows }) + "\\n");
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
`;

  const result = spawnSync(
    process.execPath,
    ["-e", smokeScript, smokeUrl],
    {
      cwd: prismaDir,
      encoding: "utf8",
      shell: false,
    }
  );

  try {
    fs.rmSync(smokeDb, { force: true });
    fs.rmSync(`${smokeDb}-journal`, { force: true });
    fs.rmSync(`${smokeDb}-wal`, { force: true });
    fs.rmSync(`${smokeDb}-shm`, { force: true });
  } catch {}

  if (result.status !== 0 || result.error) {
    return {
      ok: false,
      error: result.error
        ? String(result.error.message || result.error)
        : String(result.stderr || result.stdout || "Prisma smoke falhou."),
    };
  }

  try {
    return JSON.parse(String(result.stdout || "").trim());
  } catch {
    return {
      ok: false,
      error: "Saída do Prisma smoke não pôde ser interpretada.",
      stdout: String(result.stdout || ""),
    };
  }
}

function main() {
  const sourceHashes = {
    project: assertFile(
      PROJECT_DB,
      EXPECTED.projectSha,
      "Banco do projeto"
    ),
    roaming: assertFile(
      ROAMING_DB,
      EXPECTED.roamingSha,
      "Banco do Roaming"
    ),
    candidate: assertFile(
      CANDIDATE_DB,
      EXPECTED.candidateSha,
      "Banco candidato"
    ),
  };

  const project = openReadOnly(PROJECT_DB);
  const roaming = openReadOnly(ROAMING_DB);
  const candidate = openReadOnly(CANDIDATE_DB);

  try {
    const integrity = candidate.prepare("PRAGMA integrity_check").all();
    const fk = candidate.prepare("PRAGMA foreign_key_check").all();
    const tables = listTables(candidate);

    const counts = Object.fromEntries(
      Object.entries(EXPECTED.counts).map(([table, expected]) => {
        const actual = countRows(candidate, table);
        return [
          table,
          {
            expected,
            actual,
            ok: actual === expected,
          },
        ];
      })
    );

    const exactCurrentTables = Object.fromEntries(
      CURRENT_BRANCH_EXACT_TABLES.map((table) => [
        table,
        exactTableMatch(project, candidate, table),
      ])
    );

    const currentRowsSurvive = Object.fromEntries(
      CURRENT_ROWS_MUST_SURVIVE_EXACT.map((table) => [
        table,
        projectRowsSurviveExact(project, candidate, table),
      ])
    );

    const legacyRowsImported = Object.fromEntries(
      LEGACY_ONLY_ROWS_MUST_BE_IMPORTED_EXACT.map((table) => [
        table,
        legacyOnlyRowsImportedExact(
          project,
          roaming,
          candidate,
          table
        ),
      ])
    );

    const productMerge = validateProductMerge(
      project,
      roaming,
      candidate
    );
    const companySettings = validateCompanySettings(
      project,
      roaming,
      candidate
    );
    const renumberedOrder = validateRenumberedLegacyOrder(
      project,
      roaming,
      candidate
    );
    const migrations = validateMigrations(candidate);
    const uniqueConstraints = validateUniqueConstraints(candidate);
    const prismaSmoke = prismaSmokeTest(CANDIDATE_DB);

    const checks = {
      integrityCheck:
        integrity.length === 1 &&
        String(integrity[0].integrity_check) === "ok",
      foreignKeys: fk.length === 0,
      tableCount: tables.length === EXPECTED.tableCount,
      counts: Object.values(counts).every((item) => item.ok),
      exactCurrentTables: Object.values(exactCurrentTables).every(Boolean),
      currentRowsSurvive: Object.values(currentRowsSurvive).every(Boolean),
      legacyRowsImported: Object.values(legacyRowsImported).every(
        (item) => item.ok
      ),
      productMerge: productMerge.ok,
      companySettings: companySettings.ok,
      renumberedOrder: renumberedOrder.ok,
      migrations: migrations.ok,
      uniqueConstraints: uniqueConstraints.ok,
      prismaSmoke: prismaSmoke.ok === true,
    };

    const report = {
      ok: Object.values(checks).every(Boolean),
      stage: "4A.6-VALIDACAO-CANDIDATO",
      generatedAt: new Date().toISOString(),
      safety: {
        candidateReadOnly: true,
        sourceDatabasesReadOnly: true,
        liveDatabaseChanged: false,
        promotionPerformed: false,
        migrationExecuted: false,
        prismaSmokeUsedDisposableCopy: true,
      },
      sourceHashes,
      candidate: {
        path: CANDIDATE_DB,
        sizeBytes: fs.statSync(CANDIDATE_DB).size,
        tableCount: tables.length,
      },
      checks,
      details: {
        integrityCheck:
          integrity.length === 1
            ? String(integrity[0].integrity_check)
            : integrity,
        foreignKeyViolations: fk.length,
        counts,
        exactCurrentTables,
        currentRowsSurvive,
        legacyRowsImported,
        productMerge,
        companySettings,
        renumberedOrder,
        migrations,
        uniqueConstraints,
        prismaSmoke,
      },
    };

    fs.writeFileSync(
      REPORT_FILE,
      JSON.stringify(report, null, 2),
      "utf8"
    );

    console.log(
      JSON.stringify({
        ok: report.ok,
        stage: report.stage,
        report: path.basename(REPORT_FILE),
        checks,
        integrityCheck: report.details.integrityCheck,
        foreignKeyViolations:
          report.details.foreignKeyViolations,
        prismaSmoke: prismaSmoke.ok === true,
        liveDatabaseChanged: false,
        promotionPerformed: false,
      })
    );

    if (!report.ok) process.exitCode = 1;
  } finally {
    candidate.close();
    roaming.close();
    project.close();
  }
}

main();
