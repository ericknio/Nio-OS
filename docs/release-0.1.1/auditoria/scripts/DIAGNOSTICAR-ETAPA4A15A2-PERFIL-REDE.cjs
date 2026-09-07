#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.15A.2-DIAGNOSTICO-PERFIL-REDE",
    message: "Este diagnóstico é exclusivo para Windows."
  }));
  process.exit(1);
}

const root = process.cwd();
const output = path.join(root, "ETAPA4A15A2_DIAGNOSTICO_PERFIL_REDE.json");

function runPowerShell(command) {
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

$profiles = @(
  Get-NetConnectionProfile -ErrorAction SilentlyContinue |
    ForEach-Object {
      [pscustomobject]@{
        InterfaceAlias = [string]$_.InterfaceAlias
        InterfaceIndex = [int]$_.InterfaceIndex
        Name = [string]$_.Name
        NetworkCategory = [string]$_.NetworkCategory
        IPv4Connectivity = [string]$_.IPv4Connectivity
        IPv6Connectivity = [string]$_.IPv6Connectivity
      }
    }
)

$adapters = @(
  Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.Status -eq 'Up' } |
    ForEach-Object {
      [pscustomobject]@{
        Name = [string]$_.Name
        InterfaceDescription = [string]$_.InterfaceDescription
        ifIndex = [int]$_.ifIndex
        Status = [string]$_.Status
        MacAddress = [string]$_.MacAddress
        LinkSpeed = [string]$_.LinkSpeed
        HardwareInterface = [bool]$_.HardwareInterface
        Virtual = [bool]$_.Virtual
      }
    }
)

$ipconfigs = @(
  Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object {
      $_.NetAdapter -and
      $_.NetAdapter.Status -eq 'Up'
    } |
    ForEach-Object {
      [pscustomobject]@{
        InterfaceAlias = [string]$_.InterfaceAlias
        InterfaceIndex = [int]$_.InterfaceIndex
        NetProfileName = if ($_.NetProfile) { [string]$_.NetProfile.Name } else { '' }
        NetworkCategory = if ($_.NetProfile) { [string]$_.NetProfile.NetworkCategory } else { '' }
        IPv4Address = if ($_.IPv4Address) { [string]$_.IPv4Address.IPAddress } else { '' }
        IPv4PrefixLength = if ($_.IPv4Address) { [int]$_.IPv4Address.PrefixLength } else { 0 }
        IPv4DefaultGateway = if ($_.IPv4DefaultGateway) { [string]$_.IPv4DefaultGateway.NextHop } else { '' }
        DNSServers = @($_.DNSServer.ServerAddresses | ForEach-Object { [string]$_ })
      }
    }
)

$firewallProfiles = @(
  Get-NetFirewallProfile -ErrorAction SilentlyContinue |
    ForEach-Object {
      [pscustomobject]@{
        Name = [string]$_.Name
        Enabled = [bool]$_.Enabled
        DefaultInboundAction = [string]$_.DefaultInboundAction
        DefaultOutboundAction = [string]$_.DefaultOutboundAction
      }
    }
)

$service = Get-Service -Name MpsSvc -ErrorAction SilentlyContinue
$nlSvc = Get-Service -Name NlaSvc -ErrorAction SilentlyContinue

$rules3000 = @(
  Get-NetFirewallRule -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
    Where-Object { $_.Direction -eq 'Inbound' } |
    ForEach-Object {
      $r = $_
      $p = $r | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue

      if ($p -and [string]$p.Protocol -eq 'TCP' -and [string]$p.LocalPort -eq '3000') {
        $a = $r | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
        $addr = $r | Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue

        [pscustomobject]@{
          Name = [string]$r.Name
          DisplayName = [string]$r.DisplayName
          Enabled = [string]$r.Enabled
          Action = [string]$r.Action
          Profile = [string]$r.Profile
          Program = if ($a) { [string]$a.Program } else { '' }
          Protocol = [string]$p.Protocol
          LocalPort = [string]$p.LocalPort
          RemoteAddress = if ($addr) { [string]$addr.RemoteAddress } else { '' }
        }
      }
    }
)

[pscustomobject]@{
  Profiles = $profiles
  AdaptersUp = $adapters
  IPConfigurations = $ipconfigs
  FirewallProfiles = $firewallProfiles
  FirewallService = if ($service) {
    [pscustomobject]@{
      Name = [string]$service.Name
      Status = [string]$service.Status
      StartType = [string]$service.StartType
    }
  } else { $null }
  NlaService = if ($nlSvc) {
    [pscustomobject]@{
      Name = [string]$nlSvc.Name
      Status = [string]$nlSvc.Status
      StartType = [string]$nlSvc.StartType
    }
  } else { $null }
  Port3000InboundRules = $rules3000
} | ConvertTo-Json -Depth 8 -Compress
`;

  const raw = runPowerShell(command);

  const profiles = asArray(raw?.Profiles);
  const adapters = asArray(raw?.AdaptersUp);
  const ipconfigs = asArray(raw?.IPConfigurations);
  const firewallProfiles = asArray(raw?.FirewallProfiles);
  const portRules = asArray(raw?.Port3000InboundRules);

  const activeLan = ipconfigs.filter((item) => {
    const ip = String(item.IPv4Address || "");
    const gateway = String(item.IPv4DefaultGateway || "");
    return (
      gateway &&
      (
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
      )
    );
  });

  const privateProfiles = profiles.filter(
    (item) => String(item.NetworkCategory).toLowerCase() === "private"
  );

  const publicProfiles = profiles.filter(
    (item) => String(item.NetworkCategory).toLowerCase() === "public"
  );

  const domainProfiles = profiles.filter(
    (item) => String(item.NetworkCategory).toLowerCase() === "domainauthenticated"
  );

  const report = {
    ok: true,
    stage: "4A.15A.2-DIAGNOSTICO-PERFIL-REDE",
    generatedAt: new Date().toISOString(),
    profiles,
    adaptersUp: adapters,
    ipConfigurations: ipconfigs,
    firewallProfiles,
    firewallService: raw?.FirewallService || null,
    nlaService: raw?.NlaService || null,
    port3000InboundRules: portRules,
    assessment: {
      connectionProfileCount: profiles.length,
      privateProfileCount: privateProfiles.length,
      publicProfileCount: publicProfiles.length,
      domainProfileCount: domainProfiles.length,
      activeLanInterfaceCount: activeLan.length,
      activeLanInterfaces: activeLan.map((item) => ({
        interfaceAlias: item.InterfaceAlias,
        interfaceIndex: item.InterfaceIndex,
        ipv4Address: item.IPv4Address,
        prefixLength: item.IPv4PrefixLength,
        gateway: item.IPv4DefaultGateway,
        networkCategory: item.NetworkCategory || ""
      })),
      port3000RuleCount: portRules.length,
      canSafelyCreatePrivateRule:
        activeLan.length > 0 &&
        privateProfiles.length > 0 &&
        publicProfiles.length === 0
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
    connectionProfileCount: report.assessment.connectionProfileCount,
    privateProfileCount: report.assessment.privateProfileCount,
    publicProfileCount: report.assessment.publicProfileCount,
    domainProfileCount: report.assessment.domainProfileCount,
    activeLanInterfaceCount: report.assessment.activeLanInterfaceCount,
    activeLanInterfaces: report.assessment.activeLanInterfaces,
    port3000RuleCount: report.assessment.port3000RuleCount,
    firewallServiceStatus: report.firewallService?.Status || null,
    nlaServiceStatus: report.nlaService?.Status || null,
    canSafelyCreatePrivateRule: report.assessment.canSafelyCreatePrivateRule,
    firewallChanged: false
  }));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.15A.2-DIAGNOSTICO-PERFIL-REDE",
    message: error instanceof Error ? error.message : String(error),
    firewallChanged: false,
    databaseChanged: false
  }));
  process.exit(1);
}
