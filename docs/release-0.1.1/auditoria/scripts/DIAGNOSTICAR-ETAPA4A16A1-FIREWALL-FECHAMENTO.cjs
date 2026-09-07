#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.16A.1-DIAGNOSTICO-FIREWALL-FECHAMENTO",
    message: "Este diagnóstico é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const reportFile = path.join(
  root,
  "ETAPA4A16A1_DIAGNOSTICO_FIREWALL_FECHAMENTO.json"
);

const expected = {
  name: "Nio-OS-LAN-TCP-3000",
  program: "C:\\Program Files\\Nio-OS\\Nio-OS.exe",
  direction: "Inbound",
  action: "Allow",
  profile: "Private",
  protocol: "TCP",
  localPort: "3000",
  remoteAddress: "LocalSubnet",
  edgeTraversalPolicy: "Block"
};

function normalizePath(value) {
  return String(value || "")
    .replace(/\//g, "\\")
    .replace(/\\+/g, "\\")
    .trim()
    .toLowerCase();
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim());
  if (value == null) return [];
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function psJson(command) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      shell: false
    }
  );

  if (result.status !== 0) {
    throw new Error(
      String(result.stderr || result.stdout || "PowerShell falhou.").trim()
    );
  }

  const text = String(result.stdout || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("PowerShell não retornou JSON válido.");
  }
}

function main() {
  const raw = psJson(String.raw`
$ErrorActionPreference = 'Stop'

$rule = Get-NetFirewallRule -Name 'Nio-OS-LAN-TCP-3000' -PolicyStore ActiveStore -ErrorAction SilentlyContinue

if (-not $rule) {
  [pscustomobject]@{
    Exists = $false
  } | ConvertTo-Json -Compress
  exit
}

$port = $rule | Get-NetFirewallPortFilter -ErrorAction Stop
$app  = $rule | Get-NetFirewallApplicationFilter -ErrorAction Stop
$addr = $rule | Get-NetFirewallAddressFilter -ErrorAction Stop

[pscustomobject]@{
  Exists = $true
  Name = [string]$rule.Name
  DisplayName = [string]$rule.DisplayName
  Enabled = [string]$rule.Enabled
  Direction = [string]$rule.Direction
  Action = [string]$rule.Action
  Profile = [string]$rule.Profile
  Program = [string]$app.Program
  Protocol = [string]$port.Protocol
  LocalPort = [string]$port.LocalPort
  RemoteAddress = @($addr.RemoteAddress | ForEach-Object { [string]$_ })
  EdgeTraversalPolicy = [string]$rule.EdgeTraversalPolicy
  PolicyStoreSourceType = [string]$rule.PolicyStoreSourceType
} | ConvertTo-Json -Depth 5 -Compress
`);

  if (!raw?.Exists) {
    throw new Error("A regra Nio-OS-LAN-TCP-3000 não foi encontrada.");
  }

  const remoteValues = normalizeList(raw.RemoteAddress).map((v) =>
    v.toLowerCase()
  );

  const checks = {
    enabled:
      String(raw.Enabled || "").toLowerCase() === "true",
    direction:
      String(raw.Direction || "").toLowerCase() ===
      expected.direction.toLowerCase(),
    action:
      String(raw.Action || "").toLowerCase() ===
      expected.action.toLowerCase(),
    profile:
      normalizeList(raw.Profile)
        .map((v) => v.toLowerCase())
        .includes(expected.profile.toLowerCase()),
    program:
      normalizePath(raw.Program) === normalizePath(expected.program),
    protocol:
      String(raw.Protocol || "").toUpperCase() === expected.protocol,
    localPort:
      normalizeList(raw.LocalPort).includes(expected.localPort),
    remoteAddress:
      remoteValues.includes("localsubnet") ||
      remoteValues.some((v) => v.startsWith("localsubnet")),
    edgeTraversalPolicy:
      String(raw.EdgeTraversalPolicy || "").toLowerCase() ===
      expected.edgeTraversalPolicy.toLowerCase()
  };

  const failedChecks = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  const exactSemanticMatch = failedChecks.length === 0;

  const report = {
    ok: true,
    stage: "4A.16A.1-DIAGNOSTICO-FIREWALL-FECHAMENTO",
    generatedAt: new Date().toISOString(),
    expected,
    actual: raw,
    checks,
    failedChecks,
    exactSemanticMatch,
    assessment: exactSemanticMatch
      ? "A regra está semanticamente correta; o falso negativo está no coletor 4A.16A."
      : "A regra atual diverge do escopo aprovado em pelo menos um campo.",
    safety: {
      readOnly: true,
      firewallChanged: false,
      databaseChanged: false,
      filesDeleted: false
    }
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: report.stage,
    report: path.basename(reportFile),
    exactSemanticMatch,
    failedChecks,
    actual: {
      Enabled: raw.Enabled,
      Direction: raw.Direction,
      Action: raw.Action,
      Profile: raw.Profile,
      Program: raw.Program,
      Protocol: raw.Protocol,
      LocalPort: raw.LocalPort,
      RemoteAddress: raw.RemoteAddress,
      EdgeTraversalPolicy: raw.EdgeTraversalPolicy
    },
    firewallChanged: false
  }));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.16A.1-DIAGNOSTICO-FIREWALL-FECHAMENTO",
    message: error instanceof Error ? error.message : String(error),
    firewallChanged: false,
    databaseChanged: false,
    filesDeleted: false
  }));
  process.exit(1);
}
