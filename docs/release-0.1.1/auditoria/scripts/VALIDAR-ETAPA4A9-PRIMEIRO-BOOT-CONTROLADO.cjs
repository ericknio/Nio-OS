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
  throw new Error("A etapa 4A.9 foi preparada exclusivamente para Windows.");
}

const LOCALAPPDATA = process.env.LOCALAPPDATA || "";
const APPDATA = process.env.APPDATA || "";

if (!LOCALAPPDATA || !APPDATA) {
  throw new Error("LOCALAPPDATA/APPDATA não estão disponíveis.");
}

const runtimeRoot = path.join(LOCALAPPDATA, "Nio-OS");
const dbFile = path.join(runtimeRoot, "data", "nio-os.db");
const configFile = path.join(runtimeRoot, "nio-os-desktop-config.json");
const runtimeEnvFile = path.join(runtimeRoot, ".env");
const projectDb = path.join(root, "data", "nio-os.db");
const roamingDb = path.join(APPDATA, "Nio-OS", "data", "nio-os.db");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const buildId = path.join(root, ".next", "BUILD_ID");
const reportFile = path.join(root, "ETAPA4A9_PRIMEIRO_BOOT_CONTROLADO.json");

const EXPECTED = {
  runtimeDbSha:
    "bb0bf660bfc74528ee5355af787a835aaff75e288d7fe01a022518203569d675",
  projectDbSha:
    "ffb4dc202a3ffc67632674fd8690864ad697a6e782bd1eada261e982c6c36fec",
  roamingDbSha:
    "bbda6b82df5d74af7e121146355afd8fbc9bec59e9acf6db3c6667906600628f",
  tableCount: 22,
  migrationCount: 5,
  publicUploadsFiles: 7,
  storageFiles: 2,
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

function requireFile(file, label) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`${label} não encontrado: ${file}`);
  }
}

function assertStableDb(file, expectedSha, label) {
  requireFile(file, label);

  if (fs.existsSync(`${file}-wal`) || fs.existsSync(`${file}-shm`)) {
    throw new Error(`${label} possui WAL/SHM ativo. Feche completamente o Nio-OS.`);
  }

  const actual = sha256File(file);

  if (actual !== expectedSha) {
    throw new Error(`${label} mudou. Esperado ${expectedSha}, atual ${actual}.`);
  }

  return actual;
}

function countFiles(base) {
  if (!fs.existsSync(base)) return 0;

  let total = 0;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error(`Link simbólico recusado: ${full}`);
      }

      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) total += 1;
    }
  }

  walk(base);
  return total;
}

function inspectDb(file) {
  const db = new DatabaseSync(file, { readOnly: true });

  try {
    const integrity = db.prepare("PRAGMA integrity_check").all();
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();

    return {
      integrityCheck:
        integrity.length === 1 ? String(integrity[0].integrity_check) : integrity,
      foreignKeyViolations: foreignKeys.length,
      tableCount: Number(
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          )
          .get().c,
      ),
      migrationCount: Number(
        db.prepare('SELECT COUNT(*) AS c FROM "NioSchemaMigration"').get().c,
      ),
    };
  } finally {
    db.close();
  }
}

function readConfig() {
  requireFile(configFile, "Configuração desktop");

  let config;

  try {
    config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    throw new Error("Configuração desktop não contém JSON válido.");
  }

  const authSecret = String(config.authSecret || "");

  if (authSecret.length < 32) {
    throw new Error("AUTH_SECRET preservado não é válido para o primeiro boot.");
  }

  return {
    authSecret,
    hasSavedMode: typeof config.lastMode === "string" && config.lastMode.length > 0,
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);

    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Não foi possível reservar uma porta de teste."));
        return;
      }

      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function databaseUrl(file) {
  return `file:${file.replace(/\\/g, "/")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, timeoutMs = 2000) {
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
      contentType: response.headers.get("content-type") || "",
    };
  } catch {
    return { status: 0, contentType: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function waitServer(baseUrl, child) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Servidor encerrou durante a inicialização. exitCode=${child.exitCode}`);
    }

    const login = await request(`${baseUrl}/login`, 1200);
    if (login.status > 0) return;

    await sleep(400);
  }

  throw new Error("Servidor Next não respondeu em até 60 segundos.");
}

function stopChild(child) {
  if (!child || child.exitCode !== null) return;

  try {
    child.kill();
  } catch {}

  try {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } catch {}
}

function sanitizeTail(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-10)
    .map((line) =>
      line
        .replaceAll(runtimeRoot, "[runtime]")
        .replaceAll(root, "[project]"),
    );
}

async function main() {
  requireFile(nextBin, "Next.js CLI");
  requireFile(buildId, "Build de produção");

  const before = {
    runtimeDbSha: assertStableDb(dbFile, EXPECTED.runtimeDbSha, "Banco runtime"),
    projectDbSha: assertStableDb(projectDb, EXPECTED.projectDbSha, "Banco do projeto"),
    roamingDbSha: assertStableDb(roamingDb, EXPECTED.roamingDbSha, "Banco do Roaming"),
    runtimeEnvExists: fs.existsSync(runtimeEnvFile),
    publicUploadsFiles: countFiles(path.join(runtimeRoot, "public", "uploads")),
    storageFiles: countFiles(path.join(runtimeRoot, "storage")),
  };

  if (before.runtimeEnvExists) {
    throw new Error("O .env runtime já existe antes do primeiro boot controlado.");
  }

  if (
    before.publicUploadsFiles !== EXPECTED.publicUploadsFiles ||
    before.storageFiles !== EXPECTED.storageFiles
  ) {
    throw new Error(
      `Contagem de mídias mudou. public=${before.publicUploadsFiles}, storage=${before.storageFiles}.`,
    );
  }

  const healthBefore = inspectDb(dbFile);

  if (
    healthBefore.integrityCheck !== "ok" ||
    healthBefore.foreignKeyViolations !== 0 ||
    healthBefore.tableCount !== EXPECTED.tableCount ||
    healthBefore.migrationCount !== EXPECTED.migrationCount
  ) {
    throw new Error(`Banco runtime falhou no preflight: ${JSON.stringify(healthBefore)}`);
  }

  const config = readConfig();
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  let child;
  let stdout = "";
  let stderr = "";

  try {
    child = spawn(
      process.execPath,
      [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)],
      {
        cwd: root,
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          NODE_ENV: "production",
          HOST: "127.0.0.1",
          HOSTNAME: "127.0.0.1",
          PORT: String(port),
          COOKIE_SECURE: "false",
          NEXT_TELEMETRY_DISABLED: "1",
          DATABASE_URL: databaseUrl(dbFile),
          AUTH_SECRET: config.authSecret,
          NIO_OS_DATA_DIR: runtimeRoot,
          NIO_OS_RUNTIME_DIR: runtimeRoot,
          NIO_OS_ENV_PATH: runtimeEnvFile,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-64 * 1024);
    });

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-64 * 1024);
    });

    await waitServer(baseUrl, child);

    const http = {
      login: await request(`${baseUrl}/login`),
      health: await request(`${baseUrl}/api/local/health`),
      authSetup: await request(`${baseUrl}/api/auth/setup`),
    };

    if (
      http.login.status !== 200 ||
      http.health.status !== 200 ||
      http.authSetup.status === 0 ||
      http.authSetup.status >= 500
    ) {
      throw new Error(`Smoke HTTP recusado: ${JSON.stringify(http)}`);
    }

    stopChild(child);
    await sleep(1000);

    const after = {
      runtimeDbSha: sha256File(dbFile),
      projectDbSha: sha256File(projectDb),
      roamingDbSha: sha256File(roamingDb),
      runtimeEnvExists: fs.existsSync(runtimeEnvFile),
      walExists: fs.existsSync(`${dbFile}-wal`),
      shmExists: fs.existsSync(`${dbFile}-shm`),
    };

    const healthAfter = inspectDb(dbFile);

    if (
      after.runtimeDbSha !== EXPECTED.runtimeDbSha ||
      after.projectDbSha !== EXPECTED.projectDbSha ||
      after.roamingDbSha !== EXPECTED.roamingDbSha
    ) {
      throw new Error("Um dos bancos mudou durante o boot controlado.");
    }

    if (after.runtimeEnvExists || after.walExists || after.shmExists) {
      throw new Error(
        `Artefato inesperado após smoke: env=${after.runtimeEnvExists}, wal=${after.walExists}, shm=${after.shmExists}.`,
      );
    }

    if (
      healthAfter.integrityCheck !== "ok" ||
      healthAfter.foreignKeyViolations !== 0 ||
      healthAfter.tableCount !== EXPECTED.tableCount ||
      healthAfter.migrationCount !== EXPECTED.migrationCount
    ) {
      throw new Error(`Banco runtime falhou após o smoke: ${JSON.stringify(healthAfter)}`);
    }

    const report = {
      ok: true,
      stage: "4A.9-PRIMEIRO-BOOT-CONTROLADO",
      generatedAt: new Date().toISOString(),
      safety: {
        desktopElectronStarted: false,
        nextProductionServerStarted: true,
        serverBoundToLoopbackOnly: true,
        databaseChanged: false,
        sourceDatabasesChanged: false,
        runtimeEnvCreated: false,
        migrationExecuted: false,
        prismaDbPushUsed: false,
        desktopBuildRun: false,
      },
      runtime: {
        root: runtimeRoot,
        databaseSha256: after.runtimeDbSha,
        publicUploadsFiles: before.publicUploadsFiles,
        storageFiles: before.storageFiles,
        configPresent: true,
        authSecretPresent: true,
        savedModePresent: config.hasSavedMode,
      },
      databaseHealth: {
        before: healthBefore,
        after: healthAfter,
      },
      http,
      process: {
        stopped: true,
        stdoutTail: sanitizeTail(stdout),
        stderrTail: sanitizeTail(stderr),
      },
      nextStep: {
        desktopDirBuildAllowed: true,
        packagedDesktopBootStillPending: true,
      },
    };

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");

    console.log(
      JSON.stringify({
        ok: true,
        stage: report.stage,
        report: path.basename(reportFile),
        runtimeDbSha256: after.runtimeDbSha,
        integrityCheck: healthAfter.integrityCheck,
        foreignKeyViolations: healthAfter.foreignKeyViolations,
        tableCount: healthAfter.tableCount,
        migrationCount: healthAfter.migrationCount,
        loginStatus: http.login.status,
        healthStatus: http.health.status,
        authSetupStatus: http.authSetup.status,
        databaseChanged: false,
        runtimeEnvCreated: false,
        desktopBuildRun: false,
        packagedDesktopBootStillPending: true,
      }),
    );
  } finally {
    stopChild(child);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      stage: "4A.9-PRIMEIRO-BOOT-CONTROLADO",
      message: error instanceof Error ? error.message : String(error),
      desktopBuildRun: false,
    }),
  );
  process.exit(1);
});
