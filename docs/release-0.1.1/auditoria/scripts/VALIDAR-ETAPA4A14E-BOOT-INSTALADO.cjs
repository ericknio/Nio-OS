#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14E-BOOT-INSTALADO",
    message: "Este validador é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const baselineFile = path.join(root, "ETAPA4A14D_SUBSTITUICAO_LIMPA_BASELINE.json");
const reportFile = path.join(root, "ETAPA4A14E_BOOT_INSTALADO.json");

const installedExe = path.join(
  process.env.ProgramFiles || "C:\\Program Files",
  "Nio-OS",
  "Nio-OS.exe"
);

const runtimeRoot = path.join(process.env.LOCALAPPDATA || "", "Nio-OS");
const runtimeDb = path.join(runtimeRoot, "data", "nio-os.db");
const runtimeEnv = path.join(runtimeRoot, ".env");
const projectDb = path.join(root, "data", "nio-os.db");
const roamingDb = path.join(process.env.APPDATA || "", "Nio-OS", "data", "nio-os.db");

const HOST = "127.0.0.1";
const PORT = 3000;

function fail(message, extra = {}) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14E-BOOT-INSTALADO",
    message,
    databaseChangedByValidator: false,
    installerExecutedByValidator: false,
    ...extra
  }));
  process.exit(1);
}

function normalize(value) {
  return String(value || "").replace(/\\/g, "/");
}

function sha256(file) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;

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

function fileState(file) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return { exists: false, sizeBytes: 0, sha256: null };
  }

  const stat = fs.statSync(file);
  return {
    exists: true,
    sizeBytes: stat.size,
    sha256: sha256(file)
  };
}

function sameState(before, after) {
  return (
    before.exists === after.exists &&
    before.sizeBytes === after.sizeBytes &&
    before.sha256 === after.sha256
  );
}

function nioProcessRunning() {
  const result = spawnSync(
    "tasklist.exe",
    ["/FI", "IMAGENAME eq Nio-OS.exe", "/FO", "CSV", "/NH"],
    { encoding: "utf8", windowsHide: true, shell: false }
  );

  if (result.status !== 0) return false;
  return String(result.stdout || "").toLowerCase().includes("nio-os.exe");
}

function request(pathname, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path: pathname,
        method: "GET",
        timeout: timeoutMs,
        headers: { "User-Agent": "Nio-OS-4A14E-Validator" }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: Number(res.statusCode || 0),
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function waitForServer(maxMs = 90000) {
  const started = Date.now();
  let lastError = "";

  while (Date.now() - started < maxMs) {
    try {
      const health = await request("/api/local/health", 2000);
      if (health.status === 200) return health;
      lastError = `health status ${health.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Servidor não ficou disponível em ${maxMs}ms. Último erro: ${lastError}`);
}

async function waitPortClosed(maxMs = 30000) {
  const started = Date.now();

  while (Date.now() - started < maxMs) {
    try {
      await request("/api/local/health", 800);
    } catch {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

function killTree(pid) {
  if (!pid) return;

  spawnSync(
    "taskkill.exe",
    ["/PID", String(pid), "/T", "/F"],
    { encoding: "utf8", windowsHide: true, shell: false }
  );
}

function inspectDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true });

  try {
    const integrityRows = db.prepare("PRAGMA integrity_check").all();
    const fkRows = db.prepare("PRAGMA foreign_key_check").all();
    const tableRows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();

    const migrationCount = Number(
      db.prepare('SELECT COUNT(*) AS c FROM "NioSchemaMigration"').get().c
    );

    return {
      integrityCheck:
        integrityRows.length === 1 ? String(integrityRows[0].integrity_check) : "invalid",
      foreignKeyViolations: fkRows.length,
      tableCount: tableRows.length,
      migrationCount
    };
  } finally {
    db.close();
  }
}

async function main() {
  if (nioProcessRunning()) {
    fail("Feche completamente o Nio-OS antes de executar o validador.");
  }

  if (!fs.existsSync(baselineFile)) fail("Baseline 4A.14D não encontrado.");
  if (!fs.existsSync(installedExe)) fail(`Executável instalado não encontrado: ${installedExe}`);
  if (!fs.existsSync(runtimeDb)) fail(`Banco runtime não encontrado: ${runtimeDb}`);

  try {
    const prePort = await request("/api/local/health", 800);
    fail("A porta 3000 já está respondendo antes do teste.", {
      preExistingHealthStatus: prePort.status
    });
  } catch {}

  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));

  const installedBefore = fileState(installedExe);
  const runtimeBefore = fileState(runtimeDb);
  const projectBefore = fileState(projectDb);
  const roamingBefore = fileState(roamingDb);

  if (
    baseline?.unpackedExe?.sha256 &&
    installedBefore.sha256 !== baseline.unpackedExe.sha256
  ) {
    fail("O executável instalado diverge do win-unpacked validado.", {
      installedExeSha256: installedBefore.sha256,
      validatedUnpackedExeSha256: baseline.unpackedExe.sha256
    });
  }

  if (
    baseline?.runtimeDatabase &&
    !sameState(baseline.runtimeDatabase, runtimeBefore)
  ) {
    fail("O banco runtime já divergiu do baseline antes do boot instalado.");
  }

  const child = spawn(installedExe, [], {
    cwd: path.dirname(installedExe),
    windowsHide: false,
    detached: false,
    stdio: "ignore"
  });

  let health;
  let login;
  let authSetup;

  try {
    health = await waitForServer();
    login = await request("/login", 5000);
    authSetup = await request("/api/auth/setup", 5000);

    if (health.status !== 200) throw new Error(`health retornou ${health.status}`);
    if (login.status !== 200) throw new Error(`login retornou ${login.status}`);
    if (authSetup.status !== 200) throw new Error(`auth/setup retornou ${authSetup.status}`);
  } finally {
    killTree(child.pid);
  }

  const serverPortClosedAfterTest = await waitPortClosed();

  if (!serverPortClosedAfterTest) {
    fail("A porta 3000 permaneceu aberta após encerrar o Nio-OS.");
  }

  const runtimeAfter = fileState(runtimeDb);
  const projectAfter = fileState(projectDb);
  const roamingAfter = fileState(roamingDb);
  const installedAfter = fileState(installedExe);

  if (!sameState(installedBefore, installedAfter)) fail("O executável instalado mudou durante o teste.");

  if (!sameState(runtimeBefore, runtimeAfter)) {
    fail("O banco runtime mudou durante o primeiro boot instalado.", {
      runtimeBeforeSha256: runtimeBefore.sha256,
      runtimeAfterSha256: runtimeAfter.sha256
    });
  }

  if (!sameState(projectBefore, projectAfter)) fail("O banco do projeto mudou durante o teste.");
  if (!sameState(roamingBefore, roamingAfter)) fail("O banco legado Roaming mudou durante o teste.");

  const db = inspectDatabase(runtimeDb);

  if (db.integrityCheck !== "ok") fail("PRAGMA integrity_check falhou.", db);
  if (db.foreignKeyViolations !== 0) fail("Foram encontradas violações de foreign key.", db);

  if (db.tableCount !== 22 || db.migrationCount !== 5) {
    fail("Estrutura/migrações do runtime divergiram do esperado.", db);
  }

  const report = {
    ok: true,
    stage: "4A.14E-BOOT-INSTALADO-VALIDADO",
    validatedAt: new Date().toISOString(),
    installedExe: {
      path: normalize(installedExe),
      sha256: installedAfter.sha256,
      matchesValidatedPackage: true
    },
    http: {
      healthStatus: health.status,
      loginStatus: login.status,
      authSetupStatus: authSetup.status
    },
    runtime: {
      root: normalize(runtimeRoot),
      envPresent: fs.existsSync(runtimeEnv),
      physicalHashChanged: false,
      databaseSha256: runtimeAfter.sha256,
      integrityCheck: db.integrityCheck,
      foreignKeyViolations: db.foreignKeyViolations,
      tableCount: db.tableCount,
      migrationCount: db.migrationCount
    },
    sourceDatabases: {
      projectUnchanged: true,
      roamingUnchanged: true
    },
    process: {
      installedExeStarted: true,
      serverPortClosedAfterTest: true
    },
    safety: {
      databaseChangedByValidator: false,
      installerExecutedByValidator: false
    },
    nextStep:
      "Diagnosticar e endurecer a regra do Windows Firewall para TCP 3000 em rede Private/LocalSubnet."
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: report.stage,
    report: path.basename(reportFile),
    installedExeStarted: true,
    installedExeMatchesValidatedPackage: true,
    healthStatus: health.status,
    loginStatus: login.status,
    authSetupStatus: authSetup.status,
    runtimePhysicalHashChanged: false,
    integrityCheck: db.integrityCheck,
    foreignKeyViolations: db.foreignKeyViolations,
    tableCount: db.tableCount,
    migrationCount: db.migrationCount,
    runtimeEnvPresent: report.runtime.envPresent,
    serverPortClosedAfterTest: true,
    installedDesktopUseAllowed: true,
    firewallHardeningStillPending: true
  }));
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
