#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.15B-FIREWALL-LAN-SEGURO",
    message: "Este script é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const self = path.resolve(process.argv[1]);
const reportFile = path.join(root, "ETAPA4A15B_FIREWALL_LAN_SEGURO.json");
const exe = "C:\\Program Files\\Nio-OS\\Nio-OS.exe";
const ruleName = "Nio-OS-LAN-TCP-3000";
const displayName = "Nio-OS - Servidor LAN (TCP 3000)";

function psQuote(value) {
  return String(value).replace(/'/g, "''");
}

function isAdmin() {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
    ],
    { encoding: "utf8", windowsHide: true, shell: false }
  );

  return result.status === 0 &&
    String(result.stdout || "").trim().toLowerCase() === "true";
}

function elevate() {
  try {
    if (fs.existsSync(reportFile)) fs.rmSync(reportFile, { force: true });
  } catch {}

  const command =
    `$p=Start-Process -FilePath '${psQuote(process.execPath)}' ` +
    `-ArgumentList @('"${psQuote(self)}"','--elevated') ` +
    `-WorkingDirectory '${psQuote(root)}' -Verb RunAs -Wait -PassThru; ` +
    `exit $p.ExitCode`;

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { cwd: root, encoding: "utf8", windowsHide: false, shell: false }
  );

  if (result.status !== 0 || !fs.existsSync(reportFile)) {
    console.error(JSON.stringify({
      ok: false,
      stage: "4A.15B-FIREWALL-LAN-SEGURO",
      message: "A elevação administrativa foi cancelada ou falhou.",
      firewallChanged: false
    }));
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    report: path.basename(reportFile),
    ruleCreated: report.ruleCreated,
    ruleRepaired: report.ruleRepaired,
    ruleAlreadyCorrect: report.ruleAlreadyCorrect,
    exactRuleValidated: report.exactRuleValidated,
    activePrivateLanInterface: report.activePrivateLanInterface,
    broadPort3000RuleCount: report.broadPort3000RuleCount,
    firewallChanged: report.firewallChanged,
    next: report.next
  }));

  process.exit(report.ok ? 0 : 1);
}

function applyElevated() {
  if (!isAdmin()) {
    throw new Error("A etapa elevada não recebeu privilégios administrativos.");
  }

  if (!fs.existsSync(exe)) {
    throw new Error(`Executável instalado não encontrado: ${exe}`);
  }

  const command = String.raw`
$ErrorActionPreference = 'Stop'

$ruleName = '${psQuote(ruleName)}'
$displayName = '${psQuote(displayName)}'
$program = '${psQuote(exe)}'

$privateLan = @(
  Get-NetIPConfiguration -ErrorAction Stop |
    Where-Object {
      $_.NetAdapter -and
      $_.NetAdapter.Status -eq 'Up' -and
      $_.NetProfile -and
      [string]$_.NetProfile.NetworkCategory -eq 'Private' -and
      $_.IPv4Address -and
      $_.IPv4DefaultGateway
    } |
    ForEach-Object {
      $ip = [string]$_.IPv4Address.IPAddress

      if (
        $ip -like '10.*' -or
        $ip -like '192.168.*' -or
        $ip -match '^172\.(1[6-9]|2\d|3[01])\.'
      ) {
        [pscustomobject]@{
          InterfaceAlias = [string]$_.InterfaceAlias
          InterfaceIndex = [int]$_.InterfaceIndex
          IPv4Address = $ip
          PrefixLength = [int]$_.IPv4Address.PrefixLength
          Gateway = [string]$_.IPv4DefaultGateway.NextHop
          NetworkCategory = [string]$_.NetProfile.NetworkCategory
        }
      }
    }
)

if ($privateLan.Count -ne 1) {
  throw "Esperado exatamente 1 interface LAN privada ativa; encontrado $($privateLan.Count)."
}

$service = Get-Service -Name MpsSvc -ErrorAction Stop
if ([string]$service.Status -ne 'Running') {
  throw "O serviço Windows Defender Firewall (MpsSvc) não está em execução."
}

$broad = @(
  Get-NetFirewallRule -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Direction -eq 'Inbound' -and
      $_.Enabled -eq 'True' -and
      $_.Action -eq 'Allow' -and
      $_.Name -ne $ruleName
    } |
    ForEach-Object {
      $r = $_
      $p = $r | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue

      if ($p -and [string]$p.Protocol -eq 'TCP' -and [string]$p.LocalPort -eq '3000') {
        $a = $r | Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue
        $remote = if ($a) { [string]$a.RemoteAddress } else { '' }
        $profile = [string]$r.Profile

        if (
          $remote -eq '' -or
          $remote -eq 'Any' -or
          $remote -eq '*' -or
          $profile -match 'Public|Any'
        ) {
          [pscustomobject]@{
            Name = [string]$r.Name
            DisplayName = [string]$r.DisplayName
            Profile = $profile
            RemoteAddress = $remote
          }
        }
      }
    }
)

if ($broad.Count -gt 0) {
  throw "Existe regra ampla de entrada para TCP 3000. Nenhuma alteração foi feita."
}

function Get-RuleState {
  $r = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
  if (-not $r) { return $null }

  $p = $r | Get-NetFirewallPortFilter -ErrorAction Stop
  $app = $r | Get-NetFirewallApplicationFilter -ErrorAction Stop
  $addr = $r | Get-NetFirewallAddressFilter -ErrorAction Stop

  [pscustomobject]@{
    Name = [string]$r.Name
    DisplayName = [string]$r.DisplayName
    Enabled = [string]$r.Enabled
    Direction = [string]$r.Direction
    Action = [string]$r.Action
    Profile = [string]$r.Profile
    Program = [string]$app.Program
    Protocol = [string]$p.Protocol
    LocalPort = [string]$p.LocalPort
    RemoteAddress = [string]$addr.RemoteAddress
    EdgeTraversalPolicy = [string]$r.EdgeTraversalPolicy
  }
}

function Test-ExactRule($state) {
  if (-not $state) { return $false }

  return (
    $state.Enabled -eq 'True' -and
    $state.Direction -eq 'Inbound' -and
    $state.Action -eq 'Allow' -and
    $state.Profile -eq 'Private' -and
    $state.Program -ieq $program -and
    $state.Protocol -eq 'TCP' -and
    $state.LocalPort -eq '3000' -and
    $state.RemoteAddress -match 'LocalSubnet' -and
    $state.EdgeTraversalPolicy -eq 'Block'
  )
}

$before = Get-RuleState
$created = $false
$repaired = $false
$alreadyCorrect = Test-ExactRule $before

if (-not $alreadyCorrect) {
  if ($before) {
    Remove-NetFirewallRule -Name $ruleName -ErrorAction Stop
    $repaired = $true
  } else {
    $created = $true
  }

  $params = @{
    Name = $ruleName
    DisplayName = $displayName
    Description = 'Permite acesso ao servidor Nio-OS somente pela rede local privada.'
    Direction = 'Inbound'
    Action = 'Allow'
    Enabled = 'True'
    Profile = 'Private'
    Program = $program
    Protocol = 'TCP'
    LocalPort = 3000
    RemoteAddress = 'LocalSubnet'
    EdgeTraversalPolicy = 'Block'
    ErrorAction = 'Stop'
  }

  New-NetFirewallRule @params | Out-Null
}

$after = Get-RuleState
$exact = Test-ExactRule $after

if (-not $exact) {
  throw "A regra foi criada, mas a validação final não confirmou o escopo esperado."
}

[pscustomobject]@{
  RuleCreated = $created
  RuleRepaired = $repaired
  RuleAlreadyCorrect = $alreadyCorrect
  ExactRuleValidated = $exact
  ActivePrivateLanInterface = $privateLan[0]
  BroadPort3000RuleCount = $broad.Count
  Rule = $after
} | ConvertTo-Json -Depth 6 -Compress
`;

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { cwd: root, encoding: "utf8", windowsHide: true, shell: false }
  );

  if (result.status !== 0) {
    throw new Error(
      String(result.stderr || result.stdout || "Falha ao configurar o firewall.").trim()
    );
  }

  const raw = JSON.parse(String(result.stdout || "").trim());

  const report = {
    ok: true,
    stage: "4A.15B-FIREWALL-LAN-SEGURO",
    generatedAt: new Date().toISOString(),
    ruleCreated: Boolean(raw.RuleCreated),
    ruleRepaired: Boolean(raw.RuleRepaired),
    ruleAlreadyCorrect: Boolean(raw.RuleAlreadyCorrect),
    exactRuleValidated: Boolean(raw.ExactRuleValidated),
    activePrivateLanInterface: raw.ActivePrivateLanInterface,
    broadPort3000RuleCount: Number(raw.BroadPort3000RuleCount || 0),
    rule: raw.Rule,
    firewallChanged: Boolean(raw.RuleCreated || raw.RuleRepaired),
    safety: {
      networkProfileChanged: false,
      databaseChanged: false,
      publicProfileOpened: false,
      remoteAddressRestrictedToLocalSubnet: true,
      programRestrictedToInstalledNioOS: true,
      tcpPortRestrictedTo3000: true
    },
    next:
      "Abrir o Nio-OS instalado em modo servidor e validar de outro dispositivo da mesma LAN em http://192.168.1.9:3000/login."
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report));
}

try {
  if (!isAdmin() && process.argv[2] !== "--elevated") {
    elevate();
  } else {
    applyElevated();
  }
} catch (error) {
  const report = {
    ok: false,
    stage: "4A.15B-FIREWALL-LAN-SEGURO",
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
