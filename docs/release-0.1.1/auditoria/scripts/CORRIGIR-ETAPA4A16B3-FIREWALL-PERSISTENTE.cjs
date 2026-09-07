#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.16B.3-FIREWALL-PERSISTENTE",
    message: "Este script é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const self = path.resolve(process.argv[1]);
const reportFile = path.join(root, "ETAPA4A16B3_FIREWALL_PERSISTENTE.json");

const RULE = "Nio-OS-LAN-TCP-3000";
const EXE = "C:\\Program Files\\Nio-OS\\Nio-OS.exe";

function run(file, args, opts = {}) {
  const r = spawnSync(file, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: opts.windowsHide ?? true,
    shell: false
  });

  return {
    status: r.status,
    stdout: String(r.stdout || "").trim(),
    stderr: String(r.stderr || "").trim()
  };
}

function isAdmin() {
  const r = run("powershell.exe", [
    "-NoProfile",
    "-Command",
    "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
  ]);

  return r.status === 0 && r.stdout.toLowerCase() === "true";
}

function elevate() {
  try { fs.rmSync(reportFile, { force: true }); } catch {}

  const ps = [
    "$p=Start-Process",
    `-FilePath '${process.execPath.replace(/'/g, "''")}'`,
    `-ArgumentList @('"${self.replace(/'/g, "''")}"','--elevated')`,
    `-WorkingDirectory '${root.replace(/'/g, "''")}'`,
    "-Verb RunAs -Wait -PassThru;",
    "exit $p.ExitCode"
  ].join(" ");

  const r = run(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { windowsHide: false }
  );

  if (r.status !== 0 || !fs.existsSync(reportFile)) {
    throw new Error("A elevação administrativa foi cancelada ou falhou.");
  }

  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    report: path.basename(reportFile),
    ruleCreated: report.ruleCreated,
    ruleValidated: report.ruleValidated,
    persistentStoreValidated: report.persistentStoreValidated,
    activeStoreValidated: report.activeStoreValidated,
    firewallChanged: report.firewallChanged
  }));

  process.exit(report.ok ? 0 : 1);
}

function psJson(command) {
  const r = run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", command
  ]);

  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "PowerShell falhou.");
  }

  if (!r.stdout) return null;

  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error("PowerShell não retornou JSON válido.");
  }
}

function getRule(store) {
  const storeArg = store ? ` -PolicyStore '${store}'` : "";

  return psJson(`
$ErrorActionPreference='SilentlyContinue'
$r=Get-NetFirewallRule -Name '${RULE}'${storeArg}
if(-not $r){ exit 0 }
$p=$r|Get-NetFirewallPortFilter
$a=$r|Get-NetFirewallApplicationFilter
$d=$r|Get-NetFirewallAddressFilter
[pscustomobject]@{
  Name=[string]$r.Name
  Enabled=[string]$r.Enabled
  Direction=[string]$r.Direction
  Action=[string]$r.Action
  Profile=[string]$r.Profile
  Program=[string]$a.Program
  Protocol=[string]$p.Protocol
  LocalPort=[string]$p.LocalPort
  RemoteAddress=[string]::Join(',',@($d.RemoteAddress))
  EdgeTraversalPolicy=[string]$r.EdgeTraversalPolicy
} | ConvertTo-Json -Compress
`);
}

function exact(rule) {
  if (!rule) return false;

  return (
    String(rule.Name) === RULE &&
    String(rule.Enabled).toLowerCase() === "true" &&
    String(rule.Direction).toLowerCase() === "inbound" &&
    String(rule.Action).toLowerCase() === "allow" &&
    String(rule.Profile).toLowerCase().includes("private") &&
    String(rule.Program).replace(/\//g, "\\").toLowerCase() === EXE.toLowerCase() &&
    String(rule.Protocol).toUpperCase() === "TCP" &&
    String(rule.LocalPort) === "3000" &&
    String(rule.RemoteAddress).toLowerCase().includes("localsubnet") &&
    String(rule.EdgeTraversalPolicy).toLowerCase() === "block"
  );
}

function apply() {
  if (!isAdmin()) throw new Error("Privilégio administrativo não obtido.");
  if (!fs.existsSync(EXE)) throw new Error(`Executável instalado não encontrado: ${EXE}`);

  const profiles = psJson(`
$items=@(
  Get-NetConnectionProfile -ErrorAction SilentlyContinue |
  ForEach-Object {
    [pscustomobject]@{
      InterfaceAlias=[string]$_.InterfaceAlias
      NetworkCategory=[string]$_.NetworkCategory
    }
  }
)
$items | ConvertTo-Json -Compress
`);

  const profileList = profiles == null ? [] : Array.isArray(profiles) ? profiles : [profiles];
  const hasPrivate = profileList.some(
    (p) => String(p.NetworkCategory).toLowerCase() === "private"
  );

  if (!hasPrivate) {
    throw new Error("Nenhum perfil de rede Private está ativo. Regra não criada.");
  }

  const beforePersistent = getRule("PersistentStore");
  const beforeActive = getRule("ActiveStore");

  if (exact(beforePersistent) && exact(beforeActive)) {
    const report = {
      ok: true,
      stage: "4A.16B.3-FIREWALL-PERSISTENTE",
      generatedAt: new Date().toISOString(),
      ruleCreated: false,
      ruleAlreadyCorrect: true,
      ruleValidated: true,
      persistentStoreValidated: true,
      activeStoreValidated: true,
      firewallChanged: false,
      databaseChanged: false
    };

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report));
    return;
  }

  run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    `Get-NetFirewallRule -Name '${RULE}' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue`
  ]);

  const add = run("netsh.exe", [
    "advfirewall", "firewall", "add", "rule",
    `name=${RULE}`,
    "dir=in",
    "action=allow",
    "enable=yes",
    "profile=private",
    "protocol=TCP",
    "localport=3000",
    "remoteip=LocalSubnet",
    `program=${EXE}`,
    "edge=no"
  ]);

  if (add.status !== 0) {
    throw new Error(add.stderr || add.stdout || "Falha ao criar regra persistente.");
  }

  const afterPersistent = getRule("PersistentStore");
  const afterActive = getRule("ActiveStore");

  const persistentOk = exact(afterPersistent);
  const activeOk = exact(afterActive);
  const ruleValidated = persistentOk && activeOk;

  if (!ruleValidated) {
    throw new Error(
      `Regra criada, mas a validação falhou. PersistentStore=${persistentOk}; ActiveStore=${activeOk}.`
    );
  }

  const report = {
    ok: true,
    stage: "4A.16B.3-FIREWALL-PERSISTENTE",
    generatedAt: new Date().toISOString(),
    ruleCreated: true,
    ruleAlreadyCorrect: false,
    ruleValidated,
    persistentStoreValidated: persistentOk,
    activeStoreValidated: activeOk,
    rule: afterPersistent,
    firewallChanged: true,
    databaseChanged: false
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report));
}

try {
  if (!isAdmin() && process.argv[2] !== "--elevated") {
    elevate();
  } else {
    apply();
  }
} catch (error) {
  const report = {
    ok: false,
    stage: "4A.16B.3-FIREWALL-PERSISTENTE",
    generatedAt: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    firewallChanged: false,
    databaseChanged: false
  };

  try {
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");
  } catch {}

  console.error(JSON.stringify(report));
  process.exit(1);
}
