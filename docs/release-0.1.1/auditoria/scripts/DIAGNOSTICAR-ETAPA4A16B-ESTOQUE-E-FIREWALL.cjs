#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();
const reportFile = path.join(root, "ETAPA4A16B_DIAGNOSTICO_ESTOQUE_FIREWALL.json");

const skipDirs = new Set([
  "node_modules", ".next", "release", "backups", ".git",
  "dist", "dist-local", "_arquivo_morto_nio_os"
]);

const codeExts = new Set([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"]);
const stockTerms = [
  "estoque", "stock", "moduloestoque", "modulo_estoque",
  "estoqueativo", "stockenabled", "enablestock", "habilitarestoque",
  "produto", "products"
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!skipDirs.has(e.name)) walk(path.join(dir, e.name), out);
      continue;
    }
    if (e.isFile() && codeExts.has(path.extname(e.name).toLowerCase())) out.push(path.join(dir, e.name));
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function snippets(file, max = 12) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (!stockTerms.some((t) => low.includes(t))) continue;

    hits.push({
      line: i + 1,
      text: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join("\n")
    });

    if (hits.length >= max) break;
  }

  return hits;
}

function inspectRuntimeDb() {
  const dbFile = path.join(process.env.LOCALAPPDATA || "", "Nio-OS", "data", "nio-os.db");
  if (!fs.existsSync(dbFile)) return { exists: false, path: dbFile.replace(/\\/g, "/") };

  const db = new DatabaseSync(dbFile, { readOnly: true });

  try {
    const tables = db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();

    const configTables = [];

    for (const t of tables) {
      const name = String(t.name);
      const sql = String(t.sql || "");
      if (!/(config|setting|preference|sistema|system|app)/i.test(name + " " + sql)) continue;

      let rows = [];
      try {
        rows = db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}" LIMIT 20`).all();
      } catch {}

      configTables.push({ name, sql, rows });
    }

    return {
      exists: true,
      path: dbFile.replace(/\\/g, "/"),
      configTables
    };
  } finally {
    db.close();
  }
}

function run(command, args) {
  const r = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    shell: false
  });

  return {
    status: r.status,
    stdout: String(r.stdout || "").trim(),
    stderr: String(r.stderr || "").trim()
  };
}

function firewallDiagnostic() {
  if (process.platform !== "win32") return { supported: false };

  const netsh = run("netsh.exe", [
    "advfirewall", "firewall", "show", "rule",
    "name=Nio-OS-LAN-TCP-3000", "verbose"
  ]);

  const ps = run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "$ErrorActionPreference='Continue';" +
    "$r=Get-NetFirewallRule -DisplayName 'Nio-OS - Servidor LAN (TCP 3000)' -ErrorAction SilentlyContinue;" +
    "if(-not $r){$r=Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object {$_.Name -eq 'Nio-OS-LAN-TCP-3000' -or $_.DisplayName -match 'Nio-OS'}};" +
    "if($r){$r | Format-List Name,DisplayName,Enabled,Direction,Action,Profile,EdgeTraversalPolicy | Out-String -Width 4096};" +
    "exit 0"
  ]);

  return { netsh, powershell: ps };
}

function main() {
  const matches = [];

  for (const file of walk(root)) {
    let hits = [];
    try { hits = snippets(file); } catch {}
    if (hits.length) matches.push({ file: rel(file), hits });
  }

  matches.sort((a, b) => {
    const score = (x) =>
      (/config|setting/i.test(x.file) ? 0 : 10) +
      (/api/i.test(x.file) ? 0 : 5) +
      x.file.length;
    return score(a) - score(b);
  });

  const report = {
    ok: true,
    stage: "4A.16B-DIAGNOSTICO-ESTOQUE-E-FIREWALL",
    generatedAt: new Date().toISOString(),
    stockModule: {
      matchedFileCount: matches.length,
      matches: matches.slice(0, 40),
      runtimeDb: inspectRuntimeDb()
    },
    firewall: firewallDiagnostic(),
    safety: {
      readOnly: true,
      filesChanged: false,
      databaseChanged: false,
      firewallChanged: false
    }
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: report.stage,
    report: path.basename(reportFile),
    matchedFileCount: report.stockModule.matchedFileCount,
    runtimeConfigTableCount: report.stockModule.runtimeDb.configTables?.length || 0,
    firewallNetshStatus: report.firewall.netsh?.status ?? null,
    firewallPowerShellStatus: report.firewall.powershell?.status ?? null,
    filesChanged: false,
    databaseChanged: false,
    firewallChanged: false
  }));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.16B-DIAGNOSTICO-ESTOQUE-E-FIREWALL",
    message: error instanceof Error ? error.message : String(error),
    filesChanged: false,
    databaseChanged: false,
    firewallChanged: false
  }));
  process.exit(1);
}
