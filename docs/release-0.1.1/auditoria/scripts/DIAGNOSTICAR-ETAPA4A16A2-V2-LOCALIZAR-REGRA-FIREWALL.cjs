#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.16A.2-V2-LOCALIZAR-REGRA-FIREWALL",
    message: "Este diagnóstico é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const reportFile = path.join(
  root,
  "ETAPA4A16A2_V2_LOCALIZAR_REGRA_FIREWALL.json"
);

function runPsLines(command) {
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

  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseJsonLines(lines, label) {
  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`${label}: linha JSON inválida retornada pelo PowerShell.`);
    }
  });
}

function collectRules(store) {
  const safeStore = store.replace(/'/g, "''");

  const command = String.raw`
$ErrorActionPreference = 'Stop'

Get-NetFirewallRule -PolicyStore '${safeStore}' -ErrorAction SilentlyContinue |
  Where-Object { $_.Direction -eq 'Inbound' } |
  ForEach-Object {
    $r = $_
    $port = $r | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    $app  = $r | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
    $addr = $r | Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue

    $name = [string]$r.Name
    $display = [string]$r.DisplayName
    $program = if ($app) { [string]$app.Program } else { '' }
    $protocol = if ($port) { [string]$port.Protocol } else { '' }
    $localPort = if ($port) { [string]$port.LocalPort } else { '' }
    $remote = if ($addr) {
      [string]::Join(',', @($addr.RemoteAddress | ForEach-Object { [string]$_ }))
    } else { '' }

    $isTargetName =
      $name -eq 'Nio-OS-LAN-TCP-3000' -or
      $display -match 'Nio[- ]?OS'

    $isProgram =
      $program -match '\\Nio-OS\.exe$'

    $isPort =
      $protocol -eq 'TCP' -and
      $localPort -eq '3000'

    if ($isTargetName -or $isProgram -or $isPort) {
      [pscustomobject]@{
        Store = '${safeStore}'
        Name = $name
        DisplayName = $display
        Enabled = [string]$r.Enabled
        Direction = [string]$r.Direction
        Action = [string]$r.Action
        Profile = [string]$r.Profile
        Program = $program
        Protocol = $protocol
        LocalPort = $localPort
        RemoteAddress = $remote
        EdgeTraversalPolicy = [string]$r.EdgeTraversalPolicy
        PolicyStoreSourceType = [string]$r.PolicyStoreSourceType
      } | ConvertTo-Json -Compress
    }
  }
`;

  return parseJsonLines(runPsLines(command), `Firewall ${store}`);
}

function collectRegistryEntries() {
  const command = String.raw`
$ErrorActionPreference = 'Stop'

$regPaths = @(
  'HKLM:\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\FirewallPolicy\FirewallRules'
)

foreach ($regPath in $regPaths) {
  if (-not (Test-Path -LiteralPath $regPath)) { continue }

  $props = Get-ItemProperty -LiteralPath $regPath -ErrorAction SilentlyContinue
  if (-not $props) { continue }

  foreach ($p in $props.PSObject.Properties) {
    if ($p.Name -match '^PS') { continue }

    $name = [string]$p.Name
    $value = [string]$p.Value

    if (
      $name -match 'Nio[- ]?OS' -or
      $value -match 'Nio[- ]?OS' -or
      $value -match 'LPort=3000'
    ) {
      [pscustomobject]@{
        RegistryPath = [string]$regPath
        ValueName = $name
        Value = $value
      } | ConvertTo-Json -Compress
    }
  }
}
`;

  return parseJsonLines(runPsLines(command), "Registro do Firewall");
}

function collectProfiles() {
  const command = String.raw`
$ErrorActionPreference = 'Stop'

Get-NetConnectionProfile -ErrorAction SilentlyContinue |
  ForEach-Object {
    [pscustomobject]@{
      InterfaceAlias = [string]$_.InterfaceAlias
      InterfaceIndex = [string]$_.InterfaceIndex
      Name = [string]$_.Name
      NetworkCategory = [string]$_.NetworkCategory
    } | ConvertTo-Json -Compress
  }
`;

  return parseJsonLines(runPsLines(command), "Perfis de rede");
}

function collectService() {
  const command = String.raw`
$ErrorActionPreference = 'Stop'

$s = Get-Service -Name MpsSvc -ErrorAction SilentlyContinue
if ($s) {
  [pscustomobject]@{
    Name = [string]$s.Name
    Status = [string]$s.Status
    StartType = [string]$s.StartType
  } | ConvertTo-Json -Compress
}
`;

  const items = parseJsonLines(runPsLines(command), "Serviço do Firewall");
  return items[0] || null;
}

function main() {
  const activeRules = collectRules("ActiveStore");
  const persistentRules = collectRules("PersistentStore");
  const rules = [...activeRules, ...persistentRules];
  const registryEntries = collectRegistryEntries();
  const profiles = collectProfiles();
  const service = collectService();

  const exactNameRules = rules.filter(
    (rule) => String(rule.Name) === "Nio-OS-LAN-TCP-3000"
  );

  const nioProgramRules = rules.filter((rule) =>
    String(rule.Program || "")
      .replace(/\//g, "\\")
      .toLowerCase()
      .endsWith("\\nio-os.exe")
  );

  const port3000Rules = rules.filter(
    (rule) =>
      String(rule.Protocol).toUpperCase() === "TCP" &&
      String(rule.LocalPort) === "3000"
  );

  const persistentMatches = persistentRules.length;
  const activeMatches = activeRules.length;

  const report = {
    ok: true,
    stage: "4A.16A.2-V2-LOCALIZAR-REGRA-FIREWALL",
    generatedAt: new Date().toISOString(),
    rules,
    registryFirewallEntries: registryEntries,
    connectionProfiles: profiles,
    firewallService: service,
    assessment: {
      activeStoreMatchCount: activeMatches,
      persistentStoreMatchCount: persistentMatches,
      exactNameRuleCount: exactNameRules.length,
      nioProgramRuleCount: nioProgramRules.length,
      tcp3000RuleCount: port3000Rules.length,
      registryEntryCount: registryEntries.length,
      rulePresentAnywhere:
        rules.length > 0 || registryEntries.length > 0
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
    activeStoreMatchCount: activeMatches,
    persistentStoreMatchCount: persistentMatches,
    exactNameRuleCount: exactNameRules.length,
    nioProgramRuleCount: nioProgramRules.length,
    tcp3000RuleCount: port3000Rules.length,
    registryEntryCount: registryEntries.length,
    rulePresentAnywhere: report.assessment.rulePresentAnywhere,
    firewallServiceStatus: service?.Status || null,
    connectionProfiles: profiles,
    firewallChanged: false
  }));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.16A.2-V2-LOCALIZAR-REGRA-FIREWALL",
    message: error instanceof Error ? error.message : String(error),
    firewallChanged: false,
    databaseChanged: false,
    filesDeleted: false
  }));
  process.exit(1);
}
