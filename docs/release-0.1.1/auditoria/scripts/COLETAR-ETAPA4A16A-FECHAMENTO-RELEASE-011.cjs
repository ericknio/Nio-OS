#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();
const reportFile = path.join(root, "ETAPA4A16A_FECHAMENTO_RELEASE_011.json");

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

function state(file) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return { exists: false, sizeBytes: 0, sha256: null };
  }
  return {
    exists: true,
    sizeBytes: fs.statSync(file).size,
    sha256: sha256(file)
  };
}

function normalize(value) {
  return String(value || "").replace(/\\/g, "/");
}

function psJson(command) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { cwd: root, encoding: "utf8", windowsHide: true, shell: false }
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

function inspectDb(file) {
  if (!fs.existsSync(file)) {
    return {
      exists: false,
      integrityCheck: null,
      foreignKeyViolations: null,
      tableCount: null,
      migrationCount: null
    };
  }

  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrityRows = db.prepare("PRAGMA integrity_check").all();
    const fkRows = db.prepare("PRAGMA foreign_key_check").all();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();

    const hasMigrations = tables.some((row) => String(row.name) === "NioSchemaMigration");
    const migrationCount = hasMigrations
      ? Number(db.prepare('SELECT COUNT(*) AS c FROM "NioSchemaMigration"').get().c)
      : null;

    return {
      exists: true,
      integrityCheck:
        integrityRows.length === 1 ? String(integrityRows[0].integrity_check) : "invalid",
      foreignKeyViolations: fkRows.length,
      tableCount: tables.length,
      migrationCount
    };
  } finally {
    db.close();
  }
}

function gitStatus() {
  const result = spawnSync(
    "git",
    ["status", "--short"],
    { cwd: root, encoding: "utf8", windowsHide: true, shell: false }
  );

  if (result.status !== 0) {
    return { available: false, clean: null, lines: [] };
  }

  const lines = String(result.stdout || "").split(/\r?\n/).filter(Boolean);
  return { available: true, clean: lines.length === 0, lines };
}

function topLevelMatching(regex) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && regex.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function findBackups(base, maxDepth = 5, depth = 0, out = []) {
  if (!fs.existsSync(base) || depth > maxDepth) return out;

  let entries = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(base, entry.name);

    if (entry.isDirectory()) {
      if (["node_modules", ".next", "release"].includes(entry.name)) continue;
      findBackups(full, maxDepth, depth + 1, out);
      continue;
    }

    if (entry.isFile() && /\.bak-[^/\\]+$/i.test(entry.name)) {
      out.push(full);
    }
  }

  return out;
}

function main() {
  const packageFile = path.join(root, "package.json");
  if (!fs.existsSync(packageFile)) throw new Error("package.json não encontrado.");

  const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  const version = String(pkg.version || "");
  const productName = String(pkg?.build?.productName || pkg.name || "");

  const installer = path.join(root, "release", `${productName} Setup ${version}.exe`);
  const unpackedExe = path.join(root, "release", "win-unpacked", "Nio-OS.exe");
  const installedExe = path.join(
    process.env.ProgramFiles || "C:\\Program Files",
    "Nio-OS",
    "Nio-OS.exe"
  );
  const runtimeRoot = path.join(process.env.LOCALAPPDATA || "", "Nio-OS");
  const runtimeDb = path.join(runtimeRoot, "data", "nio-os.db");

  const prismaPkg = path.join(root, "node_modules", "prisma", "package.json");
  const prismaClientPkg = path.join(root, "node_modules", "@prisma", "client", "package.json");

  const installerState = state(installer);
  const unpackedState = state(unpackedExe);
  const installedState = state(installedExe);
  const runtimeState = state(runtimeDb);
  const runtimeDbHealth = inspectDb(runtimeDb);

  const firewall = psJson(String.raw`
$r = Get-NetFirewallRule -Name 'Nio-OS-LAN-TCP-3000' -ErrorAction SilentlyContinue
if (-not $r) {
  $null | ConvertTo-Json -Compress
  exit
}
$p = $r | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
$a = $r | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
$addr = $r | Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue
[pscustomobject]@{
  Name = [string]$r.Name
  DisplayName = [string]$r.DisplayName
  Enabled = [string]$r.Enabled
  Direction = [string]$r.Direction
  Action = [string]$r.Action
  Profile = [string]$r.Profile
  Program = if ($a) { [string]$a.Program } else { '' }
  Protocol = if ($p) { [string]$p.Protocol } else { '' }
  LocalPort = if ($p) { [string]$p.LocalPort } else { '' }
  RemoteAddress = if ($addr) { [string]$addr.RemoteAddress } else { '' }
  EdgeTraversalPolicy = [string]$r.EdgeTraversalPolicy
} | ConvertTo-Json -Compress
`);

  const network = psJson(String.raw`
Get-NetIPConfiguration -ErrorAction SilentlyContinue |
  Where-Object {
    $_.NetAdapter -and
    $_.NetAdapter.Status -eq 'Up' -and
    $_.NetProfile -and
    [string]$_.NetProfile.NetworkCategory -eq 'Private' -and
    $_.IPv4Address -and
    $_.IPv4DefaultGateway
  } |
  Select-Object -First 1 |
  ForEach-Object {
    [pscustomobject]@{
      InterfaceAlias = [string]$_.InterfaceAlias
      IPv4Address = [string]$_.IPv4Address.IPAddress
      PrefixLength = [int]$_.IPv4Address.PrefixLength
      Gateway = [string]$_.IPv4DefaultGateway.NextHop
      NetworkCategory = [string]$_.NetProfile.NetworkCategory
    }
  } | ConvertTo-Json -Compress
`);

  const auth = psJson(String.raw`
$s = Get-AuthenticodeSignature -LiteralPath 'C:\Program Files\Nio-OS\Nio-OS.exe' -ErrorAction SilentlyContinue
if ($s) {
  [pscustomobject]@{
    Status = [string]$s.Status
    SignerSubject = if ($s.SignerCertificate) { [string]$s.SignerCertificate.Subject } else { '' }
  } | ConvertTo-Json -Compress
}
`);

  const releaseDir = path.join(root, "release");
  const releaseFiles = fs.existsSync(releaseDir)
    ? fs.readdirSync(releaseDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => ({
          name: entry.name,
          sizeBytes: fs.statSync(path.join(releaseDir, entry.name)).size
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const rootReports = topLevelMatching(/^ETAPA.*\.json$/i);
  const rootScripts = topLevelMatching(/^(COLETAR|VALIDAR|DIAGNOSTICAR|INSPECIONAR|IMPLEMENTAR|CORRIGIR|APLICAR)-.*\.cjs$/i);
  const backupFiles = findBackups(root);

  const firewallExact =
    firewall &&
    String(firewall.Enabled).toLowerCase() === "true" &&
    String(firewall.Direction).toLowerCase() === "inbound" &&
    String(firewall.Action).toLowerCase() === "allow" &&
    String(firewall.Profile).toLowerCase() === "private" &&
    String(firewall.Protocol).toUpperCase() === "TCP" &&
    String(firewall.LocalPort) === "3000" &&
    String(firewall.RemoteAddress).toLowerCase().includes("localsubnet") &&
    normalize(firewall.Program).toLowerCase() === normalize(installedExe).toLowerCase() &&
    String(firewall.EdgeTraversalPolicy).toLowerCase() === "block";

  const packageMatch =
    unpackedState.exists &&
    installedState.exists &&
    unpackedState.sha256 === installedState.sha256;

  const runtimeHealthy =
    runtimeState.exists &&
    runtimeDbHealth.integrityCheck === "ok" &&
    runtimeDbHealth.foreignKeyViolations === 0 &&
    runtimeDbHealth.tableCount === 22 &&
    runtimeDbHealth.migrationCount === 5;

  const releaseReady =
    version === "0.1.1" &&
    installerState.exists &&
    packageMatch &&
    runtimeHealthy &&
    Boolean(firewallExact);

  const report = {
    ok: true,
    stage: "4A.16A-FECHAMENTO-RELEASE-0.1.1",
    generatedAt: new Date().toISOString(),
    release: {
      productName,
      version,
      readyForLocalServerAndLanUse: releaseReady
    },
    versions: {
      node: process.version,
      prisma: fs.existsSync(prismaPkg)
        ? JSON.parse(fs.readFileSync(prismaPkg, "utf8")).version
        : null,
      prismaClient: fs.existsSync(prismaClientPkg)
        ? JSON.parse(fs.readFileSync(prismaClientPkg, "utf8")).version
        : null
    },
    artifacts: {
      installer: {
        path: normalize(path.relative(root, installer)),
        ...installerState
      },
      unpackedExe: {
        path: normalize(path.relative(root, unpackedExe)),
        ...unpackedState
      },
      installedExe: {
        path: normalize(installedExe),
        ...installedState
      },
      installedExeMatchesUnpacked: packageMatch,
      releaseFiles
    },
    runtime: {
      root: normalize(runtimeRoot),
      database: runtimeState,
      health: runtimeDbHealth,
      healthy: runtimeHealthy
    },
    lan: {
      network,
      firewallRule: firewall,
      firewallRuleExact: Boolean(firewallExact),
      physicalLanAccessPreviouslyValidated: true
    },
    signing: {
      authenticode: auth || { Status: "Unknown", SignerSubject: "" },
      trustedCodeSigningPending:
        !auth || String(auth.Status).toLowerCase() !== "valid"
    },
    repository: {
      git: gitStatus(),
      generatedReportsAtRoot: {
        count: rootReports.length,
        examples: rootReports.slice(0, 25)
      },
      operationalScriptsAtRoot: {
        count: rootScripts.length,
        examples: rootScripts.slice(0, 25)
      },
      backupFiles: {
        count: backupFiles.length,
        examples: backupFiles.slice(0, 25).map((file) =>
          normalize(path.relative(root, file))
        )
      }
    },
    knownPendingItems: [
      {
        id: "4A.12C",
        description:
          "Validar em segundo computador físico que o modo cliente não cria/usa banco runtime local.",
        blocking: false
      },
      {
        id: "AUTHENTICODE",
        description:
          "Assinar o instalador/executável com certificado de code signing antes de distribuição pública/comercial.",
        blocking: false
      }
    ],
    safety: {
      readOnly: true,
      databaseChanged: false,
      firewallChanged: false,
      filesDeleted: false,
      buildExecuted: false
    }
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: report.stage,
    report: path.basename(reportFile),
    version,
    releaseReadyForLocalServerAndLanUse: releaseReady,
    installerExists: installerState.exists,
    installedExeMatchesUnpacked: packageMatch,
    runtimeHealthy,
    firewallRuleExact: Boolean(firewallExact),
    authenticodeStatus: report.signing.authenticode.Status,
    gitAvailable: report.repository.git.available,
    gitClean: report.repository.git.clean,
    generatedReportCount: rootReports.length,
    operationalScriptCount: rootScripts.length,
    backupFileCount: backupFiles.length,
    pendingPhysicalClientValidation: true,
    codeSigningPending: report.signing.trustedCodeSigningPending,
    filesDeleted: false
  }));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.16A-FECHAMENTO-RELEASE-0.1.1",
    message: error instanceof Error ? error.message : String(error),
    databaseChanged: false,
    firewallChanged: false,
    filesDeleted: false
  }));
  process.exit(1);
}
