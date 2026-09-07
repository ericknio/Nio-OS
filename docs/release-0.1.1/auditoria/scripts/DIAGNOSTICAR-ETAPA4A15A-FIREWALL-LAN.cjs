#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.15A-DIAGNOSTICO-FIREWALL-LAN",
    message: "Este diagnóstico é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const output = path.join(root, "ETAPA4A15A_DIAGNOSTICO_FIREWALL_LAN.json");

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
  const command = String.raw`
$ErrorActionPreference = 'Stop'

$exe = 'C:\Program Files\Nio-OS\Nio-OS.exe'

$profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue |
  Select-Object InterfaceAlias, InterfaceIndex, Name, NetworkCategory, IPv4Connectivity, IPv6Connectivity

$ipv4 = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and
    $_.AddressState -eq 'Preferred'
  } |
  Select-Object InterfaceAlias, InterfaceIndex, IPAddress, PrefixLength, AddressState

$firewallProfiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue |
  Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction, NotifyOnListen

$rules = @()

Get-NetFirewallRule -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Direction -eq 'Inbound' -and (
      $_.DisplayName -match 'Nio[- ]?OS' -or
      $_.DisplayName -match '3000'
    )
  } |
  ForEach-Object {
    $rule = $_
    $port = $rule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    $app = $rule | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
    $addr = $rule | Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue

    $rules += [pscustomobject]@{
      Name = $rule.Name
      DisplayName = $rule.DisplayName
      Enabled = [string]$rule.Enabled
      Direction = [string]$rule.Direction
      Action = [string]$rule.Action
      Profile = [string]$rule.Profile
      Program = if ($app) { [string]$app.Program } else { '' }
      Protocol = if ($port) { [string]$port.Protocol } else { '' }
      LocalPort = if ($port) { [string]$port.LocalPort } else { '' }
      RemoteAddress = if ($addr) { [string]$addr.RemoteAddress } else { '' }
      PolicyStoreSourceType = [string]$rule.PolicyStoreSourceType
    }
  }

Get-NetFirewallRule -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True'
  } |
  ForEach-Object {
    $rule = $_
    $port = $rule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue

    if ($port -and [string]$port.Protocol -eq 'TCP' -and [string]$port.LocalPort -eq '3000') {
      $app = $rule | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
      $addr = $rule | Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue

      $already = $rules | Where-Object { $_.Name -eq $rule.Name }

      if (-not $already) {
        $rules += [pscustomobject]@{
          Name = $rule.Name
          DisplayName = $rule.DisplayName
          Enabled = [string]$rule.Enabled
          Direction = [string]$rule.Direction
          Action = [string]$rule.Action
          Profile = [string]$rule.Profile
          Program = if ($app) { [string]$app.Program } else { '' }
          Protocol = [string]$port.Protocol
          LocalPort = [string]$port.LocalPort
          RemoteAddress = if ($addr) { [string]$addr.RemoteAddress } else { '' }
          PolicyStoreSourceType = [string]$rule.PolicyStoreSourceType
        }
      }
    }
  }

$listeners = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess, State

$processes = @()
foreach ($listener in $listeners) {
  $p = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if ($p) {
    $processes += [pscustomobject]@{
      Id = $p.Id
      ProcessName = $p.ProcessName
      Path = $p.Path
    }
  }
}

$service = Get-Service -Name MpsSvc -ErrorAction SilentlyContinue |
  Select-Object Name, Status, StartType

[pscustomobject]@{
  InstalledExeExists = Test-Path -LiteralPath $exe
  InstalledExe = $exe
  ConnectionProfiles = @($profiles)
  IPv4Addresses = @($ipv4)
  FirewallProfiles = @($firewallProfiles)
  InboundRules = @($rules)
  Port3000Listeners = @($listeners)
  ListenerProcesses = @($processes)
  FirewallService = $service
} | ConvertTo-Json -Depth 8 -Compress
`;

  const raw = psJson(command);

  const profiles = asArray(raw.ConnectionProfiles);
  const ipv4 = asArray(raw.IPv4Addresses);
  const rules = asArray(raw.InboundRules);
  const listeners = asArray(raw.Port3000Listeners);
  const firewallProfiles = asArray(raw.FirewallProfiles);

  const privateProfiles = profiles.filter(
    (p) => String(p.NetworkCategory).toLowerCase() === "private"
  );

  const publicProfiles = profiles.filter(
    (p) => String(p.NetworkCategory).toLowerCase() === "public"
  );

  const broadPortRules = rules.filter((r) => {
    const port3000 = String(r.LocalPort) === "3000";
    const enabled = String(r.Enabled).toLowerCase() === "true";
    const allow = String(r.Action).toLowerCase() === "allow";
    const remote = String(r.RemoteAddress || "").toLowerCase();
    const profile = String(r.Profile || "").toLowerCase();

    return (
      port3000 &&
      enabled &&
      allow &&
      (
        remote === "any" ||
        remote === "*" ||
        remote === "" ||
        profile.includes("any") ||
        profile.includes("public")
      )
    );
  });

  const nioRules = rules.filter((r) => {
    const name = `${r.Name || ""} ${r.DisplayName || ""}`.toLowerCase();
    const program = String(r.Program || "").toLowerCase();

    return (
      name.includes("nio-os") ||
      name.includes("nio os") ||
      program.endsWith("\\nio-os.exe") ||
      program.endsWith("/nio-os.exe")
    );
  });

  const desiredLikeRules = nioRules.filter((r) => {
    const enabled = String(r.Enabled).toLowerCase() === "true";
    const allow = String(r.Action).toLowerCase() === "allow";
    const protocol = String(r.Protocol).toUpperCase() === "TCP";
    const port = String(r.LocalPort) === "3000";
    const profile = String(r.Profile).toLowerCase();
    const remote = String(r.RemoteAddress || "").toLowerCase();
    const program = String(r.Program || "").toLowerCase();

    return (
      enabled &&
      allow &&
      protocol &&
      port &&
      profile.includes("private") &&
      remote.includes("localsubnet") &&
      program.endsWith("\\nio-os.exe")
    );
  });

  const report = {
    ok: true,
    stage: "4A.15A-DIAGNOSTICO-FIREWALL-LAN",
    generatedAt: new Date().toISOString(),
    installedExeExists: Boolean(raw.InstalledExeExists),
    installedExe: raw.InstalledExe,
    firewallService: raw.FirewallService || null,
    connectionProfiles: profiles,
    ipv4Addresses: ipv4,
    firewallProfiles,
    inboundRules: rules,
    port3000Listeners: listeners,
    listenerProcesses: asArray(raw.ListenerProcesses),
    assessment: {
      privateProfileCount: privateProfiles.length,
      publicProfileCount: publicProfiles.length,
      nioInboundRuleCount: nioRules.length,
      desiredRuleAlreadyExists: desiredLikeRules.length > 0,
      broadPort3000RuleCount: broadPortRules.length,
      port3000CurrentlyListening: listeners.length > 0,
      recommendedTarget:
        "TCP 3000 / Inbound Allow / Profile Private / RemoteAddress LocalSubnet / Program C:\\Program Files\\Nio-OS\\Nio-OS.exe"
    },
    safety: {
      firewallChanged: false,
      networkProfileChanged: false,
      databaseChanged: false,
      applicationStarted: false
    }
  };

  fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: report.stage,
    report: path.basename(output),
    installedExeExists: report.installedExeExists,
    privateProfileCount: report.assessment.privateProfileCount,
    publicProfileCount: report.assessment.publicProfileCount,
    nioInboundRuleCount: report.assessment.nioInboundRuleCount,
    desiredRuleAlreadyExists: report.assessment.desiredRuleAlreadyExists,
    broadPort3000RuleCount: report.assessment.broadPort3000RuleCount,
    port3000CurrentlyListening: report.assessment.port3000CurrentlyListening,
    firewallChanged: false
  }));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.15A-DIAGNOSTICO-FIREWALL-LAN",
    message: error instanceof Error ? error.message : String(error),
    firewallChanged: false,
    databaseChanged: false
  }));
  process.exit(1);
}
