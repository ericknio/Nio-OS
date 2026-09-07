#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14C-INSTALACAO-CONTROLADA",
    message: "Este validador é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const baselineFile = path.join(root, "ETAPA4A14C_BASELINE_INSTALACAO.json");
const reportFile = path.join(root, "ETAPA4A14C_INSTALACAO_CONTROLADA.json");
const runtimeRoot = path.join(process.env.LOCALAPPDATA || "", "Nio-OS");
const runtimeDb = path.join(runtimeRoot, "data", "nio-os.db");
const projectDb = path.join(root, "data", "nio-os.db");
const roamingDb = path.join(process.env.APPDATA || "", "Nio-OS", "data", "nio-os.db");
const packageFile = path.join(root, "package.json");
const releaseDir = path.join(root, "release");
const unpackedExe = path.join(releaseDir, "win-unpacked", "Nio-OS.exe");

function fail(message) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14C-INSTALACAO-CONTROLADA",
    message,
    databaseChangedByValidator: false,
    installerExecutedByValidator: false
  }));
  process.exit(1);
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

function normalize(value) {
  return value.replace(/\\/g, "/");
}

function nioProcessRunning() {
  const result = spawnSync(
    "tasklist.exe",
    ["/FI", "IMAGENAME eq Nio-OS.exe", "/FO", "CSV", "/NH"],
    { encoding: "utf8", windowsHide: true, shell: false }
  );

  if (result.status !== 0) return false;

  return String(result.stdout || "")
    .toLowerCase()
    .includes("nio-os.exe");
}

function locateInstaller(productName, version) {
  const preferred = [
    `${productName} Setup ${version}.exe`,
    `${productName}-Setup-${version}.exe`
  ];

  for (const name of preferred) {
    const candidate = path.join(releaseDir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  const found = fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) =>
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".exe") &&
      entry.name.toLowerCase().includes("setup") &&
      entry.name.includes(version) &&
      !entry.name.includes(".__uninstaller")
    )
    .map((entry) => path.join(releaseDir, entry.name));

  if (found.length !== 1) {
    fail(`Não foi possível identificar unicamente o instalador da versão ${version}.`);
  }

  return found[0];
}

function walkFiles(dir, maxDepth = 12, depth = 0, output = []) {
  if (!fs.existsSync(dir) || depth > maxDepth) return output;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return output;
  }

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkFiles(absolute, maxDepth, depth + 1, output);
    } else if (entry.isFile()) {
      output.push(absolute);
    }
  }

  return output;
}

function findInstalledExe() {
  const local = process.env.LOCALAPPDATA || "";
  const candidates = [
    path.join(local, "Programs", "Nio-OS", "Nio-OS.exe"),
    path.join(local, "Programs", "nio-os", "Nio-OS.exe"),
    path.join(local, "Programs", "Nio OS", "Nio-OS.exe")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  const programs = path.join(local, "Programs");

  if (!fs.existsSync(programs)) return null;

  const matches = walkFiles(programs, 4)
    .filter((file) => path.basename(file).toLowerCase() === "nio-os.exe");

  return matches.length === 1 ? matches[0] : null;
}

function scanInstalledTree(installedExe) {
  const installRoot = path.dirname(installedExe);
  const files = walkFiles(installRoot, 14);

  const envFiles = files
    .filter((file) => {
      const base = path.basename(file).toLowerCase();
      return base === ".env" || base.startsWith(".env.");
    })
    .map((file) => normalize(path.relative(installRoot, file)));

  const databases = files
    .filter((file) => /\.(db|sqlite|sqlite3)$/i.test(file))
    .map((file) => normalize(path.relative(installRoot, file)));

  const allowedSeedPattern = /(^|\/)resources\/seed\/data\/nio-os\.db$/i;

  const unexpectedDatabases = databases.filter(
    (relative) => !allowedSeedPattern.test(relative)
  );

  const suspiciousRealDataFiles = files
    .map((file) => normalize(path.relative(installRoot, file)))
    .filter((relative) => {
      const lower = relative.toLowerCase();

      if (allowedSeedPattern.test(relative)) return false;

      return (
        lower.startsWith("data/") ||
        lower.startsWith("storage/") ||
        lower.startsWith("public/uploads/") ||
        lower.includes("/resources/app/data/") ||
        lower.includes("/resources/app/storage/") ||
        lower.includes("/resources/app/public/uploads/") ||
        lower.includes("/.next/standalone/data/") ||
        lower.includes("/.next/standalone/storage/") ||
        lower.includes("/.next/standalone/public/uploads/")
      );
    });

  return {
    installRoot: normalize(installRoot),
    envFiles,
    databases,
    unexpectedDatabases,
    suspiciousRealDataFiles
  };
}

function authenticode(file) {
  const escaped = file.replace(/'/g, "''");
  const command =
    `$s=Get-AuthenticodeSignature -LiteralPath '${escaped}';` +
    `[pscustomobject]@{Status=[string]$s.Status;` +
    `SignerSubject=if($s.SignerCertificate){[string]$s.SignerCertificate.Subject}else{''}}` +
    `| ConvertTo-Json -Compress`;

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8", windowsHide: true, shell: false }
  );

  if (result.status !== 0) {
    return { checked: false, status: "UNKNOWN", signerSubject: "" };
  }

  try {
    const parsed = JSON.parse(String(result.stdout || "").trim());

    return {
      checked: true,
      status: parsed.Status || "Unknown",
      signerSubject: parsed.SignerSubject || ""
    };
  } catch {
    return { checked: false, status: "UNKNOWN", signerSubject: "" };
  }
}

function pre() {
  if (!fs.existsSync(packageFile)) fail("package.json não encontrado.");
  if (!fs.existsSync(releaseDir)) fail("Pasta release não encontrada.");
  if (nioProcessRunning()) {
    fail("Feche completamente o Nio-OS antes de criar o baseline da instalação.");
  }

  const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  const productName = String(pkg?.build?.productName || pkg?.name || "").trim();
  const version = String(pkg?.version || "").trim();

  if (!productName || !version) fail("productName/version inválidos.");

  const installer = locateInstaller(productName, version);
  const installerState = fileState(installer);

  if (!installerState.exists) fail("Instalador não encontrado.");
  if (!fs.existsSync(unpackedExe)) fail("release/win-unpacked/Nio-OS.exe não encontrado.");

  const baseline = {
    ok: true,
    stage: "4A.14C-PRE-INSTALACAO",
    createdAt: new Date().toISOString(),
    package: {
      productName,
      version
    },
    installer: {
      path: normalize(path.relative(root, installer)),
      ...installerState
    },
    unpackedExe: {
      path: normalize(path.relative(root, unpackedExe)),
      ...fileState(unpackedExe)
    },
    runtime: {
      root: normalize(runtimeRoot),
      database: fileState(runtimeDb)
    },
    sourceDatabases: {
      project: fileState(projectDb),
      roaming: fileState(roamingDb)
    },
    installedExeBefore: findInstalledExe()
      ? normalize(findInstalledExe())
      : null,
    safety: {
      readOnly: true,
      databaseChanged: false,
      installerExecuted: false,
      applicationExecuted: false
    }
  };

  fs.writeFileSync(baselineFile, JSON.stringify(baseline, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: baseline.stage,
    baseline: path.basename(baselineFile),
    installer: baseline.installer.path,
    installerSha256: baseline.installer.sha256,
    runtimeDatabaseExists: baseline.runtime.database.exists,
    runtimeDatabaseSha256: baseline.runtime.database.sha256,
    nioOSProcessRunning: false,
    next:
      "Execute manualmente o instalador. Se aparecer opção para abrir o Nio-OS ao terminar, deixe desmarcada. Depois execute este script com --post."
  }));
}

function sameState(before, after) {
  return (
    before.exists === after.exists &&
    before.sizeBytes === after.sizeBytes &&
    before.sha256 === after.sha256
  );
}

function post() {
  if (nioProcessRunning()) {
    fail(
      "O Nio-OS está aberto. Feche-o antes do --post para provar que apenas o instalador foi testado."
    );
  }

  if (!fs.existsSync(baselineFile)) {
    fail("Baseline 4A.14C não encontrado. Execute primeiro com --pre.");
  }

  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  const installer = path.join(
    root,
    ...String(baseline.installer.path).split("/")
  );

  const installerAfter = fileState(installer);
  const runtimeDbAfter = fileState(runtimeDb);
  const projectDbAfter = fileState(projectDb);
  const roamingDbAfter = fileState(roamingDb);
  const installedExe = findInstalledExe();

  if (!sameState(baseline.installer, installerAfter)) {
    fail("O instalador mudou entre o --pre e o --post.");
  }

  if (!sameState(baseline.runtime.database, runtimeDbAfter)) {
    fail("O banco runtime foi alterado durante a instalação.");
  }

  if (!sameState(baseline.sourceDatabases.project, projectDbAfter)) {
    fail("O banco do projeto foi alterado durante a instalação.");
  }

  if (!sameState(baseline.sourceDatabases.roaming, roamingDbAfter)) {
    fail("O banco legado Roaming foi alterado durante a instalação.");
  }

  if (!installedExe) {
    fail("Nio-OS.exe instalado não foi localizado em %LOCALAPPDATA%\\Programs.");
  }

  const installedTree = scanInstalledTree(installedExe);

  if (installedTree.envFiles.length > 0) {
    fail(
      `Arquivos .env encontrados dentro da instalação: ${installedTree.envFiles.join(", ")}`
    );
  }

  if (installedTree.unexpectedDatabases.length > 0) {
    fail(
      `Banco inesperado dentro da instalação: ${installedTree.unexpectedDatabases.join(", ")}`
    );
  }

  if (installedTree.suspiciousRealDataFiles.length > 0) {
    fail(
      `Dados reais suspeitos dentro da instalação: ${installedTree.suspiciousRealDataFiles
        .slice(0, 10)
        .join(", ")}`
    );
  }

  const installedExeState = fileState(installedExe);
  const unpackedExeState = baseline.unpackedExe;

  if (
    unpackedExeState.exists &&
    installedExeState.sha256 !== unpackedExeState.sha256
  ) {
    fail("O Nio-OS.exe instalado diverge do executável win-unpacked validado.");
  }

  const report = {
    ok: true,
    stage: "4A.14C-INSTALACAO-CONTROLADA-VALIDADA",
    validatedAt: new Date().toISOString(),
    installer: {
      path: baseline.installer.path,
      sha256: installerAfter.sha256,
      unchangedSincePre: true
    },
    installation: {
      installedExe: normalize(installedExe),
      installedExeSha256: installedExeState.sha256,
      matchesValidatedUnpackedExe: true,
      envFilesInsideInstall: 0,
      unexpectedDatabasesInsideInstall: 0,
      suspiciousRealDataFilesInsideInstall: 0,
      seedDatabasesInsideInstall: installedTree.databases.filter((relative) =>
        /(^|\/)resources\/seed\/data\/nio-os\.db$/i.test(relative)
      ).length,
      authenticode: authenticode(installedExe)
    },
    runtime: {
      root: normalize(runtimeRoot),
      databaseUnchanged: true,
      databaseBeforeSha256: baseline.runtime.database.sha256,
      databaseAfterSha256: runtimeDbAfter.sha256
    },
    sourceDatabases: {
      projectUnchanged: true,
      roamingUnchanged: true
    },
    safety: {
      applicationBootStillPending: true,
      databaseChangedByValidator: false,
      installerExecutedByValidator: false
    }
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: report.stage,
    report: path.basename(reportFile),
    installedExe: report.installation.installedExe,
    installedExeMatchesValidatedPackage: true,
    runtimeDatabaseUnchanged: true,
    projectDatabaseUnchanged: true,
    roamingDatabaseUnchanged: true,
    envFilesInsideInstall: 0,
    unexpectedDatabasesInsideInstall: 0,
    suspiciousRealDataFilesInsideInstall: 0,
    applicationBootStillPending: true
  }));
}

const mode = String(process.argv[2] || "").toLowerCase();

if (mode === "--pre") {
  pre();
} else if (mode === "--post") {
  post();
} else {
  fail("Use --pre antes de instalar e --post depois da instalação.");
}
