#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14D-SUBSTITUICAO-LIMPA",
    message: "Este validador é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const stateFile = path.join(root, "ETAPA4A14D_SUBSTITUICAO_LIMPA_BASELINE.json");
const reportFile = path.join(root, "ETAPA4A14D_SUBSTITUICAO_LIMPA.json");
const packageFile = path.join(root, "package.json");
const releaseDir = path.join(root, "release");
const unpackedExe = path.join(releaseDir, "win-unpacked", "Nio-OS.exe");

const runtimeRoot = path.join(process.env.LOCALAPPDATA || "", "Nio-OS");
const runtimeDb = path.join(runtimeRoot, "data", "nio-os.db");
const projectDb = path.join(root, "data", "nio-os.db");
const roamingDb = path.join(process.env.APPDATA || "", "Nio-OS", "data", "nio-os.db");

function fail(message, extra = {}) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14D-SUBSTITUICAO-LIMPA",
    message,
    databaseChangedByValidator: false,
    installerExecutedByValidator: false,
    uninstallerExecutedByValidator: false,
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

function psJson(command) {
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

function registryEntries() {
  const command = String.raw`
$paths = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$items = foreach ($p in $paths) {
  Get-ItemProperty $p -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -match 'Nio[- ]?OS' } |
    Select-Object DisplayName, DisplayVersion, InstallLocation, DisplayIcon, UninstallString
}
@($items) | ConvertTo-Json -Compress
`;

  const parsed = psJson(command);
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function executableFromText(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    if (end > 1) return text.slice(1, end);
  }

  const exeIndex = text.toLowerCase().indexOf(".exe");
  if (exeIndex >= 0) return text.slice(0, exeIndex + 4).trim();

  return text;
}

function discoverInstallations() {
  const entries = registryEntries();
  const candidates = [];
  const local = process.env.LOCALAPPDATA || "";
  const pf = process.env.ProgramFiles || "";
  const pfx86 = process.env["ProgramFiles(x86)"] || "";

  for (const item of entries) {
    const location = String(item.InstallLocation || "").trim();
    const icon = executableFromText(item.DisplayIcon);
    const uninstall = executableFromText(item.UninstallString);

    if (location) {
      candidates.push(path.join(location, "Nio-OS.exe"));
      candidates.push(path.join(location, "Nio OS.exe"));
    }

    if (icon) candidates.push(icon);

    if (uninstall) {
      const dir = path.dirname(uninstall);
      candidates.push(path.join(dir, "Nio-OS.exe"));
      candidates.push(path.join(dir, "Nio OS.exe"));
    }
  }

  candidates.push(
    path.join(local, "Programs", "Nio-OS", "Nio-OS.exe"),
    path.join(local, "Programs", "nio-os", "Nio-OS.exe"),
    path.join(local, "Programs", "Nio OS", "Nio-OS.exe"),
    path.join(pf, "Nio-OS", "Nio-OS.exe"),
    path.join(pf, "Nio OS", "Nio-OS.exe"),
    path.join(pfx86, "Nio-OS", "Nio-OS.exe"),
    path.join(pfx86, "Nio OS", "Nio-OS.exe")
  );

  const seen = new Set();
  const existing = [];

  for (const candidate of candidates.filter(Boolean)) {
    const absolute = path.resolve(candidate);
    const key = absolute.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
        existing.push(absolute);
      }
    } catch {}
  }

  return { entries, existing };
}

function locateInstaller(productName, version) {
  const preferred = [
    `${productName} Setup ${version}.exe`,
    `${productName}-Setup-${version}.exe`
  ];

  for (const name of preferred) {
    const candidate = path.join(releaseDir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
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

function walkFiles(dir, maxDepth = 16, depth = 0, output = []) {
  if (!fs.existsSync(dir) || depth > maxDepth) return output;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return output;
  }

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) fail(`Link simbólico inesperado na instalação: ${absolute}`);

    if (entry.isDirectory()) walkFiles(absolute, maxDepth, depth + 1, output);
    else if (entry.isFile()) output.push(absolute);
  }

  return output;
}

function scanInstalledTree(installedExe) {
  const installRoot = path.dirname(installedExe);
  const files = walkFiles(installRoot);

  const envFiles = files
    .filter((file) => /^\.env(?:\.|$)/i.test(path.basename(file)))
    .map((file) => normalize(path.relative(installRoot, file)));

  const databases = files
    .filter((file) => /\.(db|sqlite|sqlite3)$/i.test(file))
    .map((file) => normalize(path.relative(installRoot, file)));

  const seedPattern = /(^|\/)resources\/seed\/data\/nio-os\.db$/i;
  const unexpectedDatabases = databases.filter((relative) => !seedPattern.test(relative));

  const suspiciousRealDataFiles = files
    .map((file) => normalize(path.relative(installRoot, file)))
    .filter((relative) => {
      const lower = relative.toLowerCase();

      if (seedPattern.test(relative)) return false;

      if (
        lower.startsWith("data/") ||
        lower.startsWith("storage/") ||
        lower.startsWith("public/uploads/") ||
        lower.includes("/resources/app/data/") ||
        lower.includes("/resources/app/storage/") ||
        lower.includes("/resources/app/public/uploads/")
      ) return true;

      if (lower.includes("/.next/standalone/release/")) return true;
      if (lower.includes("/.next/standalone/dist-local/")) return true;
      if (lower.includes("/.next/standalone/_arquivo_morto_nio_os/")) return true;

      return false;
    });

  return {
    installRoot,
    envFiles,
    databases,
    unexpectedDatabases,
    suspiciousRealDataFiles
  };
}

function assertBaselineIntegrity(baseline) {
  const runtimeAfter = fileState(runtimeDb);
  const projectAfter = fileState(projectDb);
  const roamingAfter = fileState(roamingDb);

  if (!sameState(baseline.runtimeDatabase, runtimeAfter)) {
    fail("O banco runtime mudou desde o baseline.");
  }

  if (!sameState(baseline.projectDatabase, projectAfter)) {
    fail("O banco do projeto mudou desde o baseline.");
  }

  if (!sameState(baseline.roamingDatabase, roamingAfter)) {
    fail("O banco legado Roaming mudou desde o baseline.");
  }
}

function pre() {
  if (nioProcessRunning()) fail("Feche completamente o Nio-OS antes do --pre.");
  if (!fs.existsSync(packageFile)) fail("package.json não encontrado.");
  if (!fs.existsSync(unpackedExe)) fail("release/win-unpacked/Nio-OS.exe não encontrado.");

  const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  const productName = String(pkg?.build?.productName || pkg?.name || "").trim();
  const version = String(pkg?.version || "").trim();
  if (!productName || !version) fail("productName/version inválidos.");

  const installer = locateInstaller(productName, version);
  const discovered = discoverInstallations();

  if (discovered.existing.length > 1) {
    fail("Mais de uma instalação existente foi encontrada.", {
      installedExecutables: discovered.existing.map(normalize)
    });
  }

  const previousExe = discovered.existing[0] || null;
  const previousInstallRoot = previousExe ? path.dirname(previousExe) : null;

  const baseline = {
    ok: true,
    stage: "4A.14D-PRE-SUBSTITUICAO",
    createdAt: new Date().toISOString(),
    package: { productName, version },
    installer: {
      path: normalize(path.relative(root, installer)),
      ...fileState(installer)
    },
    unpackedExe: {
      path: normalize(path.relative(root, unpackedExe)),
      ...fileState(unpackedExe)
    },
    runtimeDatabase: fileState(runtimeDb),
    projectDatabase: fileState(projectDb),
    roamingDatabase: fileState(roamingDb),
    previousInstallation: {
      exe: previousExe ? normalize(previousExe) : null,
      installRoot: previousInstallRoot ? normalize(previousInstallRoot) : null
    }
  };

  fs.writeFileSync(stateFile, JSON.stringify(baseline, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: baseline.stage,
    baseline: path.basename(stateFile),
    cleanInstaller: baseline.installer.path,
    cleanInstallerSha256: baseline.installer.sha256,
    previousInstallationFound: Boolean(previousExe),
    previousInstalledExe: baseline.previousInstallation.exe,
    runtimeDatabaseSha256: baseline.runtimeDatabase.sha256,
    next: previousExe
      ? "Desinstale manualmente o Nio-OS antigo pelo Windows. Não abra o app. Depois execute --post-uninstall."
      : "Nenhuma instalação antiga foi encontrada. Execute o instalador limpo sem abrir o app e depois use --post-install."
  }));
}

function postUninstall() {
  if (nioProcessRunning()) fail("O Nio-OS está aberto.");
  if (!fs.existsSync(stateFile)) fail("Baseline 4A.14D não encontrado.");

  const baseline = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assertBaselineIntegrity(baseline);

  const discovered = discoverInstallations();

  if (discovered.existing.length > 0) {
    fail("Ainda existe uma instalação ativa do Nio-OS após a desinstalação.", {
      installedExecutables: discovered.existing.map(normalize)
    });
  }

  const previousRoot = baseline.previousInstallation?.installRoot
    ? path.resolve(baseline.previousInstallation.installRoot)
    : null;

  if (previousRoot && fs.existsSync(previousRoot)) {
    const leftovers = walkFiles(previousRoot, 16);

    if (leftovers.length > 0) {
      fail("A pasta da instalação antiga ainda contém arquivos residuais. Não instale por cima.", {
        previousInstallRoot: normalize(previousRoot),
        leftoverCount: leftovers.length,
        leftoverExamples: leftovers.slice(0, 20).map((file) =>
          normalize(path.relative(previousRoot, file))
        )
      });
    }
  }

  baseline.postUninstall = {
    validatedAt: new Date().toISOString(),
    oldInstallationRemoved: true,
    oldInstallTreeClean: true
  };

  fs.writeFileSync(stateFile, JSON.stringify(baseline, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: "4A.14D-POS-DESINSTALACAO-VALIDADO",
    oldInstallationRemoved: true,
    oldInstallTreeClean: true,
    runtimeDatabaseUnchanged: true,
    projectDatabaseUnchanged: true,
    roamingDatabaseUnchanged: true,
    next: "Execute o instalador limpo sem abrir o Nio-OS e depois use --post-install."
  }));
}

function postInstall() {
  if (nioProcessRunning()) fail("O Nio-OS está aberto. Feche-o antes do --post-install.");
  if (!fs.existsSync(stateFile)) fail("Baseline 4A.14D não encontrado.");

  const baseline = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assertBaselineIntegrity(baseline);

  if (baseline.previousInstallation?.exe && !baseline.postUninstall?.oldInstallationRemoved) {
    fail("A instalação antiga existia no baseline, mas --post-uninstall ainda não foi validado.");
  }

  const installer = path.join(root, ...String(baseline.installer.path).split("/"));
  const installerAfter = fileState(installer);

  if (!sameState(baseline.installer, installerAfter)) {
    fail("O instalador limpo mudou desde o baseline.");
  }

  const discovered = discoverInstallations();

  if (discovered.existing.length !== 1) {
    fail("Esperado exatamente 1 Nio-OS instalado após a instalação limpa.", {
      installedExecutables: discovered.existing.map(normalize)
    });
  }

  const installedExe = discovered.existing[0];
  const installedExeState = fileState(installedExe);

  if (installedExeState.sha256 !== baseline.unpackedExe.sha256) {
    fail("O executável instalado diverge do win-unpacked validado.", {
      installedExe: normalize(installedExe),
      installedExeSha256: installedExeState.sha256,
      validatedUnpackedExeSha256: baseline.unpackedExe.sha256
    });
  }

  const tree = scanInstalledTree(installedExe);

  if (tree.envFiles.length > 0) {
    fail("Arquivos .env encontrados dentro da instalação.", { envFiles: tree.envFiles });
  }

  if (tree.unexpectedDatabases.length > 0) {
    fail("Banco inesperado encontrado dentro da instalação.", {
      unexpectedDatabases: tree.unexpectedDatabases
    });
  }

  if (tree.suspiciousRealDataFiles.length > 0) {
    fail("Dados reais/artefatos proibidos encontrados dentro da instalação limpa.", {
      suspiciousFiles: tree.suspiciousRealDataFiles.slice(0, 30)
    });
  }

  const report = {
    ok: true,
    stage: "4A.14D-SUBSTITUICAO-LIMPA-VALIDADA",
    validatedAt: new Date().toISOString(),
    installer: {
      path: baseline.installer.path,
      sha256: installerAfter.sha256,
      unchangedSinceBaseline: true
    },
    installation: {
      installedExe: normalize(installedExe),
      installRoot: normalize(tree.installRoot),
      installedExeSha256: installedExeState.sha256,
      matchesValidatedUnpackedExe: true,
      envFilesInsideInstall: 0,
      unexpectedDatabasesInsideInstall: 0,
      suspiciousRealDataFilesInsideInstall: 0,
      seedDatabasesInsideInstall: tree.databases.filter((relative) =>
        /(^|\/)resources\/seed\/data\/nio-os\.db$/i.test(relative)
      ).length
    },
    runtime: {
      databaseUnchanged: true,
      databaseSha256: baseline.runtimeDatabase.sha256
    },
    sourceDatabases: {
      projectUnchanged: true,
      roamingUnchanged: true
    },
    safety: {
      installedApplicationBootStillPending: true,
      databaseChangedByValidator: false,
      installerExecutedByValidator: false,
      uninstallerExecutedByValidator: false
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
    installedApplicationBootStillPending: true
  }));
}

const mode = String(process.argv[2] || "").toLowerCase();

if (mode === "--pre") pre();
else if (mode === "--post-uninstall") postUninstall();
else if (mode === "--post-install") postInstall();
else fail("Use --pre, --post-uninstall ou --post-install.");
