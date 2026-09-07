#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14D.2-INSPECAO-POS-INSTALACAO",
    message: "Este inspetor é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const baselineFile = path.join(root, "ETAPA4A14D_SUBSTITUICAO_LIMPA_BASELINE.json");
const runtimeDb = path.join(process.env.LOCALAPPDATA || "", "Nio-OS", "data", "nio-os.db");

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

  const stat = fs.statSync(file);
  return { exists: true, sizeBytes: stat.size, sha256: sha256(file) };
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
    Where-Object {
      ($_.DisplayName -match 'Nio[- ]?OS') -or
      ($_.DisplayIcon -match 'Nio[- ]?OS') -or
      ($_.UninstallString -match 'Nio[- ]?OS')
    } |
    Select-Object PSPath, DisplayName, DisplayVersion, InstallLocation, DisplayIcon, UninstallString, QuietUninstallString
}
@($items) | ConvertTo-Json -Compress
`;

  const parsed = psJson(command);
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function shortcutTargets() {
  const command = String.raw`
$folders = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$wsh = New-Object -ComObject WScript.Shell
$items = foreach ($folder in $folders) {
  Get-ChildItem -LiteralPath $folder -Filter *.lnk -File -Recurse -ErrorAction SilentlyContinue |
    ForEach-Object {
      $s = $wsh.CreateShortcut($_.FullName)
      if ($_.Name -match 'Nio[- ]?OS' -or $s.TargetPath -match 'Nio[- ]?OS') {
        [pscustomobject]@{
          Shortcut = $_.FullName
          Target = $s.TargetPath
          Arguments = $s.Arguments
        }
      }
    }
}
@($items) | ConvertTo-Json -Compress
`;

  const parsed = psJson(command);
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
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

function walkForExe(base, maxDepth = 5, depth = 0, out = []) {
  if (!base || !fs.existsSync(base) || depth > maxDepth) return out;

  let entries = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(base, entry.name);

    if (entry.isDirectory()) {
      walkForExe(full, maxDepth, depth + 1, out);
      continue;
    }

    if (
      entry.isFile() &&
      ["nio-os.exe", "nio os.exe"].includes(entry.name.toLowerCase())
    ) {
      out.push(full);
    }
  }

  return out;
}

function normalize(value) {
  return String(value || "").replace(/\\/g, "/");
}

function main() {
  if (!fs.existsSync(baselineFile)) {
    throw new Error("Baseline 4A.14D não encontrado.");
  }

  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    path.join(process.env.LOCALAPPDATA || "", "Programs")
  ].filter(Boolean);

  const found = [];
  const seen = new Set();

  for (const base of roots) {
    for (const exe of walkForExe(base)) {
      const key = path.resolve(exe).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(exe);
    }
  }

  const exeStates = found.map((exe) => ({
    path: normalize(exe),
    ...state(exe),
    matchesValidatedUnpackedExe:
      Boolean(baseline?.unpackedExe?.sha256) &&
      sha256(exe) === baseline.unpackedExe.sha256
  }));

  const runtime = state(runtimeDb);
  const runtimeMatchesBaseline =
    runtime.exists === baseline.runtimeDatabase.exists &&
    runtime.sizeBytes === baseline.runtimeDatabase.sizeBytes &&
    runtime.sha256 === baseline.runtimeDatabase.sha256;

  const report = {
    ok: true,
    stage: "4A.14D.2-INSPECAO-POS-INSTALACAO",
    nioOSProcessRunning: nioProcessRunning(),
    registryEntries: registryEntries(),
    shortcutTargets: shortcutTargets(),
    searchedRoots: roots.map(normalize),
    foundExecutables: exeStates,
    runtimeDatabase: runtime,
    runtimeMatchesBaseline,
    cleanInstallerSha256: baseline?.installer?.sha256 || null,
    validatedUnpackedExeSha256: baseline?.unpackedExe?.sha256 || null,
    readOnly: true,
    databaseChanged: false,
    filesDeleted: false,
    installerExecuted: false
  };

  console.log(JSON.stringify(report));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14D.2-INSPECAO-POS-INSTALACAO",
    message: error instanceof Error ? error.message : String(error),
    databaseChanged: false,
    filesDeleted: false,
    installerExecuted: false
  }));
  process.exit(1);
}
