#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({ ok: false, stage: "4A.14D.1-INSPECAO-RESIDUO", message: "Windows obrigatório." }));
  process.exit(1);
}

const root = process.cwd();
const baselineFile = path.join(root, "ETAPA4A14D_SUBSTITUICAO_LIMPA_BASELINE.json");
const installRoot = path.join(process.env.ProgramFiles || "C:\\Program Files", "Nio-OS");
const installedExe = path.join(installRoot, "Nio-OS.exe");
const runtimeDb = path.join(process.env.LOCALAPPDATA || "", "Nio-OS", "data", "nio-os.db");

function sha256(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      h.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}

function state(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { exists: false, sizeBytes: 0, sha256: null };
  return { exists: true, sizeBytes: fs.statSync(file).size, sha256: sha256(file) };
}

function walk(dir, depth = 0, out = []) {
  if (!fs.existsSync(dir) || depth > 16) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }

  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, depth + 1, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function psJson(command) {
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8", windowsHide: true, shell: false }
  );
  if (r.status !== 0) return null;
  const text = String(r.stdout || "").trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
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
    Select-Object PSPath, DisplayName, DisplayVersion, InstallLocation, DisplayIcon, UninstallString, QuietUninstallString
}
@($items) | ConvertTo-Json -Compress
`;
  const parsed = psJson(command);
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function main() {
  if (!fs.existsSync(baselineFile)) {
    throw new Error("Baseline 4A.14D não encontrado.");
  }

  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  const files = walk(installRoot);
  const rel = files.map((f) => path.relative(installRoot, f).replace(/\\/g, "/"));

  const suspicious = rel.filter((r) => {
    const s = r.toLowerCase();
    return (
      s.includes("/.next/standalone/release/") ||
      s.includes("/resources/app/.next/standalone/release/") ||
      s.startsWith("public/uploads/") ||
      s.includes("/resources/app/public/uploads/") ||
      s.includes("/.next/standalone/public/uploads/")
    );
  });

  const uninstallers = rel.filter((r) => /(^|\/)unins.*\.exe$/i.test(r) || /uninstall.*\.exe$/i.test(r));

  const installedState = state(installedExe);
  const runtimeState = state(runtimeDb);

  const report = {
    ok: true,
    stage: "4A.14D.1-INSPECAO-RESIDUO",
    installRoot: installRoot.replace(/\\/g, "/"),
    installRootExists: fs.existsSync(installRoot),
    installedExe: installedState,
    matchesPreviousInstalledExe:
      Boolean(baseline?.previousInstallation?.exe) &&
      installedState.exists &&
      baseline?.previousInstallation?.exe?.toLowerCase() === installedExe.replace(/\\/g, "/").toLowerCase(),
    matchesCleanValidatedExe:
      installedState.exists &&
      Boolean(baseline?.unpackedExe?.sha256) &&
      installedState.sha256 === baseline.unpackedExe.sha256,
    registryEntries: registryEntries(),
    fileCount: rel.length,
    uninstallers,
    suspiciousFileCount: suspicious.length,
    suspiciousExamples: suspicious.slice(0, 20),
    runtimeDatabase: runtimeState,
    runtimeMatchesBaseline:
      runtimeState.exists === baseline.runtimeDatabase.exists &&
      runtimeState.sizeBytes === baseline.runtimeDatabase.sizeBytes &&
      runtimeState.sha256 === baseline.runtimeDatabase.sha256,
    readOnly: true,
    databaseChanged: false,
    filesDeleted: false
  };

  console.log(JSON.stringify(report));
}

try {
  main();
} catch (e) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14D.1-INSPECAO-RESIDUO",
    message: e instanceof Error ? e.message : String(e),
    databaseChanged: false,
    filesDeleted: false
  }));
  process.exit(1);
}
