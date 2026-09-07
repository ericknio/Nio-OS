#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();

if (process.platform !== "win32") {
  throw new Error("A etapa 4A.10D.2 foi preparada exclusivamente para Windows.");
}

const LOCALAPPDATA = process.env.LOCALAPPDATA || "";
const APPDATA = process.env.APPDATA || "";

if (!LOCALAPPDATA || !APPDATA) {
  throw new Error("LOCALAPPDATA/APPDATA não estão disponíveis.");
}

const runtimeRoot = path.join(LOCALAPPDATA, "Nio-OS");
const runtimeDb = path.join(runtimeRoot, "data", "nio-os.db");
const configFile = path.join(runtimeRoot, "nio-os-desktop-config.json");
const runtimeEnvFile = path.join(runtimeRoot, ".env");

const approvedDb = path.join(
  root,
  "data",
  "nio-os-merge-preview-4a5b-2026-08-11T15-55-30-510Z.db",
);
const projectDb = path.join(root, "data", "nio-os.db");
const roamingDb = path.join(APPDATA, "Nio-OS", "data", "nio-os.db");

const exeFile = path.join(root, "release", "win-unpacked", "Nio-OS.exe");
const packageValidator = path.join(
  root,
  "scripts",
  "validar-desktop-dir-seguro.cjs",
);
const reportFile = path.join(
  root,
  "ETAPA4A10D2_BOOT_EMPACOTADO.json",
);

const EXPECTED = {
  approvedDbSha:
    "bb0bf660bfc74528ee5355af787a835aaff75e288d7fe01a022518203569d675",
  projectDbSha:
    "ffb4dc202a3ffc67632674fd8690864ad697a6e782bd1eada261e982c6c36fec",
  roamingDbSha:
    "bbda6b82df5d74af7e121146355afd8fbc9bec59e9acf6db3c6667906600628f",
  tableCount: 22,
  migrationCount: 5,
  port: 3000,
};

const VOLATILE_COLUMNS = {
  SystemUser: new Set(["lastLoginAt", "updatedAt"]),
};

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

function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function requireFile(file, label) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`${label} não encontrado: ${file}`);
  }
}

function stableFileHash(file, expected, label) {
  requireFile(file, label);

  if (fs.existsSync(`${file}-wal`) || fs.existsSync(`${file}-shm`)) {
    throw new Error(`${label} possui WAL/SHM ativo. Feche completamente o Nio-OS.`);
  }

  const actual = sha256File(file);

  if (actual !== expected) {
    throw new Error(
      `${label} mudou. Esperado ${expected}, atual ${actual}.`,
    );
  }

  return actual;
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
      sha256: crypto.createHash("sha256").update(value).digest("hex"),
    };
  }

  if (typeof value === "bigint") return value.toString();

  return value;
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
      pk: Number(row.pk || 0),
    }));
}

function primaryKeyColumns(info) {
  return info
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
}

function schemaSql(db, table) {
  const row = db
    .prepare(
      `SELECT sql
       FROM sqlite_master
       WHERE type='table' AND name=?`,
    )
    .get(table);

  return String(row?.sql || "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalStableTable(db, table) {
  const info = tableInfo(db, table);
  const volatile = VOLATILE_COLUMNS[table] || new Set();
  const columns = info
    .map((column) => column.name)
    .filter((column) => !volatile.has(column));
  const pkColumns = primaryKeyColumns(info);

  if (columns.length === 0) {
    throw new Error(`Tabela ${table} não possui colunas estáveis para validação.`);
  }

  const rows = db.prepare(`SELECT * FROM ${safeIdent(table)}`).all();

  const canonical = rows.map((row, index) => {
    const key =
      pkColumns.length > 0
        ? pkColumns
            .map((column) => `${column}=${String(row[column])}`)
            .join("|")
        : `__row_${index}`;

    const stable = {};

    for (const column of columns) {
      stable[column] = normalizeValue(row[column]);
    }

    return {
      key,
      value: JSON.stringify(stable),
    };
  });

  canonical.sort((a, b) => a.key.localeCompare(b.key));

  return {
    count: rows.length,
    hash: sha256Text(
      canonical
        .map((item) => `${item.key}\n${item.value}`)
        .join("\n---\n"),
    ),
  };
}

function inspectHealth(db) {
  const integrity = db.prepare("PRAGMA integrity_check").all();
  const fk = db.prepare("PRAGMA foreign_key_check").all();

  return {
    integrityCheck:
      integrity.length === 1
        ? String(integrity[0].integrity_check)
        : integrity,
    foreignKeyViolations: fk.length,
    tableCount: tableNames(db).length,
    migrationCount: Number(
      db
        .prepare('SELECT COUNT(*) AS c FROM "NioSchemaMigration"')
        .get().c,
    ),
  };
}

function stableSnapshot(file) {
  requireFile(file, "Banco SQLite");

  const db = new DatabaseSync(file, { readOnly: true });

  try {
    const health = inspectHealth(db);

    if (
      health.integrityCheck !== "ok" ||
      health.foreignKeyViolations !== 0 ||
      health.tableCount !== EXPECTED.tableCount ||
      health.migrationCount !== EXPECTED.migrationCount
    ) {
      throw new Error(
        `Banco recusado na validação: ${JSON.stringify(health)}`,
      );
    }

    const tables = tableNames(db);
    const tableState = {};

    for (const table of tables) {
      tableState[table] = {
        schema: schemaSql(db, table),
        stable: canonicalStableTable(db, table),
      };
    }

    return {
      physicalSha256: sha256File(file),
      health,
      tables: tableState,
      stableDigest: sha256Text(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(tableState).map(([table, state]) => [
              table,
              {
                schema: state.schema,
                count: state.stable.count,
                hash: state.stable.hash,
              },
            ]),
          ),
        ),
      ),
    };
  } finally {
    db.close();
  }
}

function compareStableSnapshots(reference, current) {
  const refTables = Object.keys(reference.tables).sort();
  const curTables = Object.keys(current.tables).sort();

  if (JSON.stringify(refTables) !== JSON.stringify(curTables)) {
    return {
      ok: false,
      changedTables: [],
      reason: "TABLE_SET_CHANGED",
    };
  }

  const changedTables = [];

  for (const table of refTables) {
    const a = reference.tables[table];
    const b = current.tables[table];

    if (
      a.schema !== b.schema ||
      a.stable.count !== b.stable.count ||
      a.stable.hash !== b.stable.hash
    ) {
      changedTables.push(table);
    }
  }

  return {
    ok: changedTables.length === 0,
    changedTables,
    reason:
      changedTables.length === 0
        ? "STABLE_STATE_EQUIVALENT"
        : "STABLE_STATE_CHANGED",
  };
}

function readConfig() {
  requireFile(configFile, "Configuração desktop");

  let config;

  try {
    config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    throw new Error("Configuração desktop contém JSON inválido.");
  }

  const authSecret = String(config.authSecret || "");

  if (authSecret.length < 32) {
    throw new Error("Configuração desktop não possui AUTH_SECRET válido.");
  }

  const lastMode = String(config.lastMode || "");

  if (lastMode !== "server") {
    throw new Error(
      `Modo salvo atual é "${lastMode || "vazio"}"; esperado "server".`,
    );
  }

  if (config.autoStart === false) {
    throw new Error(
      "autoStart está desativado; o teste não altera configuração automaticamente.",
    );
  }

  return {
    lastMode,
    autoStart: config.autoStart !== false,
    authSecretPresent: true,
  };
}

function runPackageValidator() {
  requireFile(packageValidator, "Validador do pacote");

  const result = spawnSync(
    process.execPath,
    [packageValidator],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Validador do pacote falhou: ${String(
        result.stderr || result.stdout || "",
      ).trim()}`,
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(String(result.stdout || "").trim());
  } catch {
    throw new Error("Validador do pacote retornou JSON inválido.");
  }

  if (parsed?.ok !== true) {
    throw new Error("Validador do pacote não retornou ok=true.");
  }

  return parsed;
}

function portOpen(host, port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    return {
      status: response.status,
      contentType:
        response.headers.get("content-type") || "",
    };
  } catch {
    return { status: 0, contentType: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealth(child) {
  const baseUrl = `http://127.0.0.1:${EXPECTED.port}`;
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Nio-OS.exe encerrou antes do servidor responder. exitCode=${child.exitCode}`,
      );
    }

    const health = await request(
      `${baseUrl}/api/local/health`,
      1200,
    );

    if (health.status === 200) return baseUrl;

    await sleep(500);
  }

  throw new Error(
    "Servidor empacotado não respondeu em 127.0.0.1:3000 em até 90 segundos.",
  );
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return;

  try {
    spawnSync(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        windowsHide: true,
        stdio: "ignore",
      },
    );
  } catch {}
}

function parseEnvFile(file) {
  requireFile(file, "Env runtime");

  const values = {};

  for (const rawLine of fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)) {
    const line = rawLine.trim();

    if (
      !line ||
      line.startsWith("#") ||
      !line.includes("=")
    ) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function normalizedFileUrl(file) {
  return `file:${file.replace(/\\/g, "/")}`;
}

function validateRuntimeEnv() {
  const env = parseEnvFile(runtimeEnvFile);
  const expectedRoot = runtimeRoot.replace(/\\/g, "/");

  const checks = {
    databaseUrl:
      env.DATABASE_URL === normalizedFileUrl(runtimeDb),
    dataDir:
      String(env.NIO_OS_DATA_DIR || "")
        .replace(/\\/g, "/") === expectedRoot,
    runtimeDir:
      String(env.NIO_OS_RUNTIME_DIR || "")
        .replace(/\\/g, "/") === expectedRoot,
    host:
      env.HOST === "0.0.0.0" &&
      env.HOSTNAME === "0.0.0.0",
    port:
      env.PORT === String(EXPECTED.port),
    authSecretPresent:
      typeof env.AUTH_SECRET === "string" &&
      env.AUTH_SECRET.length >= 32,
  };

  if (Object.values(checks).some((value) => value !== true)) {
    throw new Error(
      `Env runtime não passou: ${JSON.stringify(checks)}`,
    );
  }

  return {
    keys: Object.keys(env).sort(),
    checks,
  };
}

async function main() {
  requireFile(exeFile, "Executável empacotado");

  const packageValidation = runPackageValidator();

  stableFileHash(
    approvedDb,
    EXPECTED.approvedDbSha,
    "Banco candidato aprovado",
  );
  stableFileHash(
    projectDb,
    EXPECTED.projectDbSha,
    "Banco do projeto",
  );
  stableFileHash(
    roamingDb,
    EXPECTED.roamingDbSha,
    "Banco do Roaming",
  );

  if (
    fs.existsSync(`${runtimeDb}-wal`) ||
    fs.existsSync(`${runtimeDb}-shm`)
  ) {
    throw new Error(
      "Banco runtime possui WAL/SHM. Feche completamente o Nio-OS.",
    );
  }

  const approvedStable = stableSnapshot(approvedDb);
  const before = stableSnapshot(runtimeDb);

  const approvedVsRuntime = compareStableSnapshots(
    approvedStable,
    before,
  );

  if (!approvedVsRuntime.ok) {
    throw new Error(
      `Runtime divergiu do candidato fora da allowlist de metadados. Tabelas: ${approvedVsRuntime.changedTables.join(", ")}`,
    );
  }

  const config = readConfig();

  if (await portOpen("127.0.0.1", EXPECTED.port)) {
    throw new Error(
      "A porta 3000 já está em uso. Feche Nio-OS/Next antes do teste.",
    );
  }

  const envExistedBefore = fs.existsSync(runtimeEnvFile);

  if (envExistedBefore) {
    validateRuntimeEnv();
  }

  const child = spawn(exeFile, [], {
    cwd: path.dirname(exeFile),
    windowsHide: false,
    detached: false,
    stdio: "ignore",
  });

  try {
    const baseUrl = await waitForHealth(child);

    const http = {
      health: await request(`${baseUrl}/api/local/health`),
      login: await request(`${baseUrl}/login`),
      authSetup: await request(`${baseUrl}/api/auth/setup`),
    };

    if (
      http.health.status !== 200 ||
      http.login.status !== 200 ||
      http.authSetup.status === 0 ||
      http.authSetup.status >= 500
    ) {
      throw new Error(
        `Smoke HTTP do executável falhou: ${JSON.stringify(http)}`,
      );
    }

    if (!fs.existsSync(runtimeEnvFile)) {
      throw new Error(
        "O Electron empacotado não criou o .env runtime esperado.",
      );
    }

    const runtimeEnv = validateRuntimeEnv();

    stopProcessTree(child);

    const deadline = Date.now() + 15_000;

    while (
      Date.now() < deadline &&
      (await portOpen("127.0.0.1", EXPECTED.port))
    ) {
      await sleep(400);
    }

    if (await portOpen("127.0.0.1", EXPECTED.port)) {
      throw new Error(
        "Servidor permaneceu ativo após encerrar o executável.",
      );
    }

    await sleep(700);

    if (
      fs.existsSync(`${runtimeDb}-wal`) ||
      fs.existsSync(`${runtimeDb}-shm`)
    ) {
      throw new Error(
        "WAL/SHM permaneceram após encerrar o executável.",
      );
    }

    const after = stableSnapshot(runtimeDb);

    const beforeVsAfter = compareStableSnapshots(
      before,
      after,
    );

    if (!beforeVsAfter.ok) {
      throw new Error(
        `Estado estável do banco mudou durante o boot. Tabelas: ${beforeVsAfter.changedTables.join(", ")}`,
      );
    }

    const approvedVsAfter = compareStableSnapshots(
      approvedStable,
      after,
    );

    if (!approvedVsAfter.ok) {
      throw new Error(
        `Runtime pós-boot divergiu do candidato fora da allowlist. Tabelas: ${approvedVsAfter.changedTables.join(", ")}`,
      );
    }

    stableFileHash(
      projectDb,
      EXPECTED.projectDbSha,
      "Banco do projeto pós-boot",
    );
    stableFileHash(
      roamingDb,
      EXPECTED.roamingDbSha,
      "Banco do Roaming pós-boot",
    );

    const report = {
      ok: true,
      stage: "4A.10D.2-BOOT-EMPACOTADO",
      generatedAt: new Date().toISOString(),
      validationModel: {
        physicalHashRequiredForApprovedCandidate: true,
        physicalHashRequiredForRuntime: false,
        stableLogicalStateRequired: true,
        volatileColumnsAllowed: {
          SystemUser: [
            "lastLoginAt",
            "updatedAt",
          ],
        },
      },
      packageValidation: {
        ok: packageValidation.ok === true,
        stage: packageValidation.stage,
        unexpectedDatabases:
          packageValidation.unexpectedDatabases,
        envFilesInsideApp:
          packageValidation.envFilesInsideApp,
        realDataPathsWithFiles:
          packageValidation.realDataPathsWithFiles,
        seedBusinessRows:
          packageValidation.seed?.businessRows,
      },
      runtime: {
        root: runtimeRoot,
        physicalShaBefore:
          before.physicalSha256,
        physicalShaAfter:
          after.physicalSha256,
        physicalHashChanged:
          before.physicalSha256 !==
          after.physicalSha256,
        stableDigestBefore:
          before.stableDigest,
        stableDigestAfter:
          after.stableDigest,
        stableStateChanged: false,
        envExistedBefore,
        envPresentAfter: true,
        envKeys: runtimeEnv.keys,
        envChecks: runtimeEnv.checks,
      },
      database: {
        healthBefore: before.health,
        healthAfter: after.health,
        approvedEquivalentBefore: true,
        approvedEquivalentAfter: true,
        businessStateChanged: false,
      },
      config,
      http,
      process: {
        packagedExeStarted: true,
        packagedExeStopped: true,
        serverPortClosedAfterTest: true,
      },
      safety: {
        projectDatabaseChanged: false,
        roamingDatabaseChanged: false,
        businessDataMutationDetected: false,
        installerBuildRun: false,
      },
      nextStep: {
        manualPackagedDesktopUseAllowed: true,
        installerBuildStillPending: true,
      },
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
        packagedExeStarted: true,
        healthStatus: http.health.status,
        loginStatus: http.login.status,
        authSetupStatus:
          http.authSetup.status,
        runtimePhysicalHashChanged:
          report.runtime.physicalHashChanged,
        stableBusinessStateChanged: false,
        approvedEquivalentAfter: true,
        integrityCheck:
          after.health.integrityCheck,
        foreignKeyViolations:
          after.health.foreignKeyViolations,
        tableCount:
          after.health.tableCount,
        migrationCount:
          after.health.migrationCount,
        runtimeEnvPresent: true,
        serverPortClosedAfterTest: true,
        manualPackagedDesktopUseAllowed: true,
        installerBuildStillPending: true,
      }),
    );
  } finally {
    stopProcessTree(child);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      stage: "4A.10D.2-BOOT-EMPACOTADO",
      message:
        error instanceof Error
          ? error.message
          : String(error),
      installerBuildRun: false,
    }),
  );

  process.exit(1);
});
