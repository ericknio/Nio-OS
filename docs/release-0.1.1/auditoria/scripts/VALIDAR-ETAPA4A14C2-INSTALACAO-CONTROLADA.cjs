#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14C.2-INSTALACAO-CONTROLADA",
    message: "Este validador é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const baselineFile = path.join(root, "ETAPA4A14C_BASELINE_INSTALACAO.json");
const reportFile = path.join(root, "ETAPA4A14C2_INSTALACAO_CONTROLADA.json");
const runtimeRoot = path.join(process.env.LOCALAPPDATA || "", "Nio-OS");
const runtimeDb = path.join(runtimeRoot, "data", "nio-os.db");
const projectDb = path.join(root, "data", "nio-os.db");
const roamingDb = path.join(process.env.APPDATA || "", "Nio-OS", "data", "nio-os.db");

function fail(message, extra = {}) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14C.2-INSTALACAO-CONTROLADA",
    message,
    databaseChangedByValidator: false,
    installerExecutedByValidator: false,
    ...extra
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

function sameState(before, after) {
  return (
    before.exists === after.exists &&
    before.sizeBytes === after.sizeBytes &&
    before.sha256 === after.sha256
  );
}

function normalize(value) {
  return String(value || "").replace(/\\/g, "/");
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

function powershellJson(command) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8", windowsHide: true, shell: false }
  );

  if (result.status !== 0) return null;

  const text = String(result.stdout || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function registryInstallEntries() {
  const command = String.raw`
$paths = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$items = foreach ($p in $paths) {
  Get-ItemProperty $p -ErrorAction SilentlyContinue |
    Where-Object {
      $_.DisplayName -match 'Nio[- ]?OS'
    } |
    Select-Object DisplayName, DisplayVersion, InstallLocation, DisplayIcon, UninstallString
}
@($items) | ConvertTo-Json -Compress
`;

  const parsed = powershellJson(command);

  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function cleanQuotedExecutable(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    if (end > 1) return text.slice(1, end);
  }

  const exe = text.toLowerCase().indexOf(".exe");
  if (exe >= 0) return text.slice(0, exe + 4).trim();

  return text;
}

function uniqueExistingFiles(candidates) {
  const seen = new Set();
  const output = [];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const absolute = path.resolve(candidate);
    const key = absolute.toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);

    try {
      if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
        output.push(absolute);
      }
    } catch {}
  }

  return output;
}

function findInstalledExe() {
  const entries = registryInstallEntries();
  const candidates = [];
  const local = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.ProgramFiles || "";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "";

  for (const item of entries) {
    const installLocation = String(item.InstallLocation || "").trim();
    const displayIcon = cleanQuotedExecutable(item.DisplayIcon);
    const uninstall = cleanQuotedExecutable(item.UninstallString);

    if (installLocation) {
      candidates.push(path.join(installLocation, "Nio-OS.exe"));
      candidates.push(path.join(installLocation, "Nio OS.exe"));
    }

    if (displayIcon) candidates.push(displayIcon);

    if (uninstall) {
      candidates.push(path.join(path.dirname(uninstall), "Nio-OS.exe"));
      candidates.push(path.join(path.dirname(uninstall), "Nio OS.exe"));
    }
  }

  candidates.push(
    path.join(local, "Programs", "Nio-OS", "Nio-OS.exe"),
    path.join(local, "Programs", "nio-os", "Nio-OS.exe"),
    path.join(local, "Programs", "Nio OS", "Nio-OS.exe"),
    path.join(programFiles, "Nio-OS", "Nio-OS.exe"),
    path.join(programFiles, "Nio OS", "Nio-OS.exe"),
    path.join(programFilesX86, "Nio-OS", "Nio-OS.exe"),
    path.join(programFilesX86, "Nio OS", "Nio-OS.exe")
  );

  const existing = uniqueExistingFiles(candidates);

  return {
    entries,
    candidates: [...new Set(candidates.filter(Boolean))],
    existing
  };
}

function walkFiles(dir, maxDepth = 14, depth = 0, output = []) {
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

function scanInstalledTree(installedExe) {
  const installRoot = path.dirname(installedExe);
  const files = walkFiles(installRoot);

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

function main() {
  if (nioProcessRunning()) {
    fail("O Nio-OS está aberto. Feche-o antes desta validação.");
  }

  if (!fs.existsSync(baselineFile)) {
    fail("Baseline 4A.14C não encontrado. Não reinstale: apenas restaure o arquivo baseline correto.");
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

  if (!sameState(baseline.installer, installerAfter)) {
    fail("O instalador mudou entre o baseline e esta validação.");
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

  const discovery = findInstalledExe();

  if (discovery.existing.length === 0) {
    fail(
      "A instalação não foi localizada pelo Registro nem pelos caminhos padrão. Informe o caminho escolhido no instalador.",
      {
        registryEntries: discovery.entries,
        checkedCandidates: discovery.candidates
      }
    );
  }

  if (discovery.existing.length > 1) {
    fail(
      "Mais de uma instalação do Nio-OS foi encontrada. Precisamos identificar qual foi instalada agora.",
      {
        installedExecutables: discovery.existing.map(normalize),
        registryEntries: discovery.entries
      }
    );
  }

  const installedExe = discovery.existing[0];
  const installedTree = scanInstalledTree(installedExe);

  if (installedTree.envFiles.length > 0) {
    fail(`Arquivos .env encontrados dentro da instalação: ${installedTree.envFiles.join(", ")}`);
  }

  if (installedTree.unexpectedDatabases.length > 0) {
    fail(`Banco inesperado dentro da instalação: ${installedTree.unexpectedDatabases.join(", ")}`);
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
    unpackedExeState?.exists &&
    installedExeState.sha256 !== unpackedExeState.sha256
  ) {
    fail("O Nio-OS.exe instalado diverge do executável win-unpacked validado.", {
      installedExe: normalize(installedExe),
      installedExeSha256: installedExeState.sha256,
      validatedUnpackedExeSha256: unpackedExeState.sha256
    });
  }

  const report = {
    ok: true,
    stage: "4A.14C.2-INSTALACAO-CONTROLADA-VALIDADA",
    validatedAt: new Date().toISOString(),
    installation: {
      installedExe: normalize(installedExe),
      installedExeSha256: installedExeState.sha256,
      matchesValidatedUnpackedExe: true,
      installRoot: installedTree.installRoot,
      envFilesInsideInstall: 0,
      unexpectedDatabasesInsideInstall: 0,
      suspiciousRealDataFilesInsideInstall: 0,
      seedDatabasesInsideInstall: installedTree.databases.filter((relative) =>
        /(^|\/)resources\/seed\/data\/nio-os\.db$/i.test(relative)
      ).length
    },
    discovery: {
      registryEntries: discovery.entries,
      candidatesChecked: discovery.candidates.length
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
    installRoot: report.installation.installRoot,
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

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
