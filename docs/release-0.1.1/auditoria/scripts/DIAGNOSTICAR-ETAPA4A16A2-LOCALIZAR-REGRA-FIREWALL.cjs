#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.16A.2-LOCALIZAR-REGRA-FIREWALL",
    message: "Este diagnóstico é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const reportFile = path.join(
  root,
  "ETAPA4A16A2_LOCALIZAR_REGRA_FIREWALL.json"
);

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

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function main() {
  const raw = psJson(String.raw`
$ErrorActionPreference = 'Stop'

function Convert-Rule {
  param(
    [Parameter(Mandatory=$true)] $Rule,
    [Parameter(Mandatory=$true)] [string] $Store
  )

  $port = $Rule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
  $app  = $Rule | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
  $addr = $Rule | Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue

  [pscustomobject]@{
    Store = $Store
    Name = [string]$Rule.Name
    DisplayName = [string]$Rule.DisplayName
    Enabled = [string]$Rule.Enabled
    Direction = [string]$Rule.Direction
    Action = [string]$Rule.Action
    Profile = [string]$Rule.Profile
    Program = if ($app) { [string]$app.Program } else { '' }
    Protocol = if ($port) { [string]$port.Protocol } else { '' }
    LocalPort = if ($port) { [string]$port.LocalPort } else { '' }
    RemoteAddress = if ($addr) { @($addr.RemoteAddress | ForEach-Object { [string]$_ }) } else { @() }
    EdgeTraversalPolicy = [string]$Rule.EdgeTraversalPolicy
    PolicyStoreSourceType = [string]$Rule.PolicyStoreSourceType
  }
}

$stores = @('ActiveStore', 'PersistentStore')
$matches = @()

foreach ($store in $stores) {
  $rules = Get-NetFirewallRule -PolicyStore $store -ErrorAction SilentlyContinue

  foreach ($r in $rules) {
    $port = $r | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    $app  = $r | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue

    $isTargetName =
      ([string]$r.Name -eq 'Nio-OS-LAN-TCP-3000') -or
      ([string]$r.DisplayName -match 'Nio[- ]?OS')

    $isProgram =
      $app -and
      ([string]$app.Program -match '\\Nio-OS\.exe$')

    $isPort =
      $port -and
      ([string]$port.Protocol -eq 'TCP') -and
      ([string]$port.LocalPort -eq '3000')

    if ($isTargetName -or $isProgram -or $isPort) {
      $matches += Convert-Rule -Rule $r -Store $store
    }
  }
}

$registryFirewall = @()

$regPaths = @(
  'HKLM:\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\FirewallPolicy\FirewallRules'
)

foreach ($regPath in $regPaths) {
  if (Test-Path $regPath) {
    $props = Get-ItemProperty -LiteralPath $regPath -ErrorAction SilentlyContinue

    if ($props) {
      foreach ($p in $props.PSObject.Properties) {
        if (
          $p.Name -notmatch '^PS' -and
          (
            [string]$p.Name -match 'Nio[- ]?OS' -or
            [string]$p.Value -match 'Nio[- ]?OS' -or
            [string]$p.Value -match 'LPort=3000'
          )
        ) {
          $registryFirewall += [pscustomobject]@{
            RegistryPath = $regPath
            ValueName = [string]$p.Name
            Value = [string]$p.Value
          }
        }
      }
    }
  }
}

$profiles = @(
  Get-NetConnectionProfile -ErrorAction SilentlyContinue |
    Select-Object InterfaceAlias, InterfaceIndex, Name, NetworkCategory
)

$service = Get-Service -Name MpsSvc -ErrorAction SilentlyContinue

[pscustomobject]@{
  Rules = @($matches)
  RegistryFirewallEntries = @($registryFirewall)
  ConnectionProfiles = @($profiles)
  FirewallService = if ($service) {
    [pscustomobject]@{
      Status = [string]$service.Status
      StartType = [string]$service.StartType
    }
  } else { $null }
} | ConvertTo-Json -Depth 8 -Compress
`);

  const rules = asArray(raw?.Rules);
  const regEntries = asArray(raw?.RegistryFirewallEntries);
  const profiles = asArray(raw?.ConnectionProfiles);

  const exactNameRules = rules.filter(
    (r) => String(r.Name) === "Nio-OS-LAN-TCP-3000"
  );

  const nioProgramRules = rules.filter((r) =>
    String(r.Program || "")
      .replace(/\//g, "\\")
      .toLowerCase()
      .endsWith("\\nio-os.exe")
  );

  const port3000Rules = rules.filter(
    (r) =>
      String(r.Protocol).toUpperCase() === "TCP" &&
      String(r.LocalPort) === "3000"
  );

  const report = {
    ok: true,
    stage: "4A.16A.2-LOCALIZAR-REGRA-FIREWALL",
    generatedAt: new Date().toISOString(),
    rules,
    registryFirewallEntries: regEntries,
    connectionProfiles: profiles,
    firewallService: raw?.FirewallService || null,
    assessment: {
      exactNameRuleCount: exactNameRules.length,
      nioProgramRuleCount: nioProgramRules.length,
      tcp3000RuleCount: port3000Rules.length,
      registryEntryCount: regEntries.length,
      rulePresentAnywhere:
        exactNameRules.length > 0 ||
        nioProgramRules.length > 0 ||
        port3000Rules.length > 0 ||
        regEntries.length > 0
    },
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
    exactNameRuleCount: report.assessment.exactNameRuleCount,
    nioProgramRuleCount: report.assessment.nioProgramRuleCount,
    tcp3000RuleCount: report.assessment.tcp3000RuleCount,
    registryEntryCount: report.assessment.registryEntryCount,
    rulePresentAnywhere: report.assessment.rulePresentAnywhere,
    firewallServiceStatus: report.firewallService?.Status || null,
    connectionProfiles: profiles,
    firewallChanged: false
  }));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.16A.2-LOCALIZAR-REGRA-FIREWALL",
    message: error instanceof Error ? error.message : String(error),
    firewallChanged: false,
    databaseChanged: false,
    filesDeleted: false
  }));
  process.exit(1);
}
