#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();
const out = path.join(root, "ETAPA4A16B2_DIAGNOSTICO_TOGGLE_ESTOQUE_FIREWALL.json");

function norm(p) {
  return String(p || "").replace(/\\/g, "/");
}

function read(rel) {
  const file = path.join(root, ...rel.split("/"));
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function markers(rel, needles) {
  const text = read(rel);
  if (text == null) return { exists: false, markers: {} };

  const result = {};
  for (const [key, needle] of Object.entries(needles)) {
    result[key] = text.includes(needle);
  }

  return { exists: true, markers: result };
}

function findFile(name) {
  const skip = new Set(["node_modules", ".next", "release", "backups", ".git", "_arquivo_morto_nio_os"]);
  const queue = [root];

  while (queue.length) {
    const dir = queue.shift();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) queue.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) {
        return full;
      }
    }
  }

  return null;
}

function dbState() {
  const dbFile = path.join(process.env.LOCALAPPDATA || "", "Nio-OS", "data", "nio-os.db");
  if (!fs.existsSync(dbFile)) return { exists: false, path: norm(dbFile) };

  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND lower(name)=lower('CompanySettings')"
    ).get();

    if (!table) {
      return { exists: true, path: norm(dbFile), companySettingsTable: false };
    }

    const rows = db.prepare(
      'SELECT id, productsModuleEnabled, createdAt, updatedAt FROM "CompanySettings" ORDER BY rowid'
    ).all();

    return {
      exists: true,
      path: norm(dbFile),
      companySettingsTable: true,
      rowCount: rows.length,
      rows: rows.map((r) => ({
        id: String(r.id),
        productsModuleEnabled: Number(r.productsModuleEnabled) !== 0,
        rawProductsModuleEnabled: r.productsModuleEnabled,
        createdAt: r.createdAt == null ? null : String(r.createdAt),
        updatedAt: r.updatedAt == null ? null : String(r.updatedAt)
      })),
      singleRowExpected: rows.length === 1,
      allRowsSameValue:
        rows.length <= 1 ||
        rows.every((r) => Number(r.productsModuleEnabled) === Number(rows[0].productsModuleEnabled))
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

function firewallState() {
  if (process.platform !== "win32") return { supported: false };

  const exact = run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "$ErrorActionPreference='SilentlyContinue';" +
    "$r=Get-NetFirewallRule -Name 'Nio-OS-LAN-TCP-3000';" +
    "if($r){$p=$r|Get-NetFirewallPortFilter;$a=$r|Get-NetFirewallApplicationFilter;$d=$r|Get-NetFirewallAddressFilter;" +
    "[pscustomobject]@{Name=[string]$r.Name;DisplayName=[string]$r.DisplayName;Enabled=[string]$r.Enabled;Direction=[string]$r.Direction;Action=[string]$r.Action;Profile=[string]$r.Profile;Program=[string]$a.Program;Protocol=[string]$p.Protocol;LocalPort=[string]$p.LocalPort;RemoteAddress=[string]::Join(',',@($d.RemoteAddress));EdgeTraversalPolicy=[string]$r.EdgeTraversalPolicy}|ConvertTo-Json -Compress};exit 0"
  ]);

  const anyNio = run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "$ErrorActionPreference='SilentlyContinue';" +
    "$items=@();Get-NetFirewallRule | Where-Object {$_.DisplayName -match 'Nio[- ]?OS' -or $_.Name -match 'Nio[- ]?OS'} | ForEach-Object {" +
    "$r=$_;$p=$r|Get-NetFirewallPortFilter;$a=$r|Get-NetFirewallApplicationFilter;$d=$r|Get-NetFirewallAddressFilter;" +
    "$items += [pscustomobject]@{Name=[string]$r.Name;DisplayName=[string]$r.DisplayName;Enabled=[string]$r.Enabled;Profile=[string]$r.Profile;Program=[string]$a.Program;Protocol=[string]$p.Protocol;LocalPort=[string]$p.LocalPort;RemoteAddress=[string]::Join(',',@($d.RemoteAddress))}};" +
    "$items|ConvertTo-Json -Compress;exit 0"
  ]);

  let exactJson = null;
  let anyJson = [];
  try { if (exact.stdout) exactJson = JSON.parse(exact.stdout); } catch {}
  try {
    if (anyNio.stdout) {
      const parsed = JSON.parse(anyNio.stdout);
      anyJson = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {}

  return {
    exactRuleFound: Boolean(exactJson),
    exactRule: exactJson,
    nioRuleCount: anyJson.length,
    nioRules: anyJson,
    exactCommand: { status: exact.status, stderr: exact.stderr },
    searchCommand: { status: anyNio.status, stderr: anyNio.stderr }
  };
}

function main() {
  const guardFile = findFile("ModuloProdutosGuard.tsx");
  const guardRel = guardFile ? norm(path.relative(root, guardFile)) : null;

  const source = {
    configuracoesPage: markers("app/configuracoes/page.tsx", {
      checkboxWritesBoolean: "atualizarModuloProdutos(event.target.checked)",
      payloadSendsBoolean: "productsModuleEnabled: form.productsModuleEnabled",
      putConfiguracoes: 'method: "PUT"',
      writesLocalStorage: '"nio-os-products-module-enabled"',
      reloadsAfterSave: "window.location.reload()"
    }),
    configuracoesApi: markers("app/api/configuracoes/route.ts", {
      hasProductsModuleField: "productsModuleEnabled:",
      parserExists: "function moduloProdutosAtivo",
      falseAcceptedLiterally: "return valor !== false",
      persistsField: "existente.productsModuleEnabled !== false"
    }),
    sistemaFrame: markers("app/SistemaFrame.tsx", {
      readsLocalStorage: '"nio-os-products-module-enabled"',
      fetchesConfiguracoes: "/api/configuracoes",
      filtersProductsMenu: 'item.modulo === "produtos"',
      technicalStockStandalone: 'label: "Estoque técnico"'
    }),
    moduloProdutosGuard: guardRel
      ? {
          path: guardRel,
          ...markers(guardRel, {
            fetchesConfiguracoes: "/api/configuracoes",
            usesProductsModuleEnabled: "productsModuleEnabled",
            disabledGuard: "ModuloProdutosDesativado"
          })
        }
      : { path: null, exists: false, markers: {} }
  };

  const db = dbState();
  const firewall = firewallState();

  const likelyIssues = [];

  if (db.companySettingsTable && db.rowCount !== 1) {
    likelyIssues.push("CompanySettings possui quantidade de linhas diferente de 1; findFirst() pode ler uma configuração diferente da esperada.");
  }

  if (db.companySettingsTable && db.allRowsSameValue === false) {
    likelyIssues.push("Existem múltiplas linhas CompanySettings com productsModuleEnabled divergente.");
  }

  if (!source.configuracoesPage.exists || !source.configuracoesApi.exists) {
    likelyIssues.push("Arquivos atuais de configuração não foram encontrados nos caminhos esperados.");
  }

  if (
    source.sistemaFrame.exists &&
    source.sistemaFrame.markers.technicalStockStandalone &&
    source.sistemaFrame.markers.filtersProductsMenu
  ) {
    likelyIssues.push("O toggle do módulo de produtos filtra o grupo comercial, mas 'Estoque técnico' está fora desse módulo e permanece visível por arquitetura.");
  }

  const report = {
    ok: true,
    stage: "4A.16B.2-DIAGNOSTICO-TARGETED",
    generatedAt: new Date().toISOString(),
    source,
    runtimeDatabase: db,
    firewall,
    likelyIssues,
    safety: {
      readOnly: true,
      filesChanged: false,
      databaseChanged: false,
      firewallChanged: false
    }
  };

  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: report.stage,
    report: path.basename(out),
    companySettingsRowCount: db.rowCount ?? null,
    companySettingsSingleRowExpected: db.singleRowExpected ?? null,
    companySettingsAllRowsSameValue: db.allRowsSameValue ?? null,
    productsModuleEnabledValues: Array.isArray(db.rows)
      ? db.rows.map((r) => r.productsModuleEnabled)
      : [],
    configUiMarkers: source.configuracoesPage.markers,
    configApiMarkers: source.configuracoesApi.markers,
    sistemaFrameMarkers: source.sistemaFrame.markers,
    moduloProdutosGuardPath: guardRel,
    firewallExactRuleFound: firewall.exactRuleFound,
    firewallNioRuleCount: firewall.nioRuleCount,
    likelyIssues,
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
    stage: "4A.16B.2-DIAGNOSTICO-TARGETED",
    message: error instanceof Error ? error.message : String(error),
    filesChanged: false,
    databaseChanged: false,
    firewallChanged: false
  }));
  process.exit(1);
}
