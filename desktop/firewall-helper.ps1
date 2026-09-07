param(
  [Parameter(Mandatory=$true)][ValidateSet("Verify","Repair")][string]$Mode,
  [Parameter(Mandatory=$true)][string]$Exe,
  [Parameter(Mandatory=$true)][ValidateRange(1,65535)][int]$Port,
  [Parameter(Mandatory=$true)][string]$RuleName
)

$ErrorActionPreference = "Stop"

function Get-ManagedRules([string]$Store) {
  @(
    Get-NetFirewallRule -PolicyStore $Store -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name -eq $RuleName -or
        $_.DisplayName -eq $RuleName -or
        $_.DisplayName -eq "Nio-OS - Servidor LAN (TCP 3000)"
      }
  )
}

function Test-ExactRule {
  $policy = New-Object -ComObject HNetCfg.FwPolicy2
  $matches = @(
    $policy.Rules |
      Where-Object { [string]$_.Name -eq $RuleName }
  )

  if ($matches.Count -ne 1) { return $false }

  $rule = $matches[0]
  $remote = [string]$rule.RemoteAddresses
  $localPorts = [string]$rule.LocalPorts
  $program = [string]$rule.ApplicationName

  return (
    ([bool]$rule.Enabled) -and
    ([int]$rule.Direction -eq 1) -and
    ([int]$rule.Action -eq 1) -and
    ([int]$rule.Profiles -eq 2) -and
    ($program -ieq $Exe) -and
    ([int]$rule.Protocol -eq 6) -and
    ($localPorts -eq [string]$Port) -and
    ($remote -ieq "LocalSubnet") -and
    (-not [bool]$rule.EdgeTraversal)
  )
}

function Get-BroadAutoRules {
  @(
    Get-NetFirewallRule -PolicyStore PersistentStore -ErrorAction SilentlyContinue |
      Where-Object { ([string]$_.Name -match "^(TCP|UDP) Query User\{") } |
      ForEach-Object {
        $rule = $_
        $app = $rule | Get-NetFirewallApplicationFilter
        $programPath = [string]$app.Program
        $display = [string]$rule.DisplayName

        if (
          ([IO.Path]::GetFileName($programPath) -ieq "Nio-OS.exe") -and
          ($display -ieq "Nio-OS" -or $display -ieq "nio-os.exe")
        ) { $rule }
      }
  )
}

function Test-FinalState {
  (Test-ExactRule) -and
  (@(Get-BroadAutoRules).Count -eq 0)
}

if ($Mode -eq "Verify") {
  if (Test-FinalState) { exit 0 }
  exit 2
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  exit 11
}

& netsh.exe advfirewall firewall delete rule "name=$RuleName" | Out-Null

$allRules = @(
  Get-NetFirewallRule -PolicyStore PersistentStore -ErrorAction SilentlyContinue
)

foreach ($rule in $allRules) {
  if ([string]$rule.Name -match "^(TCP|UDP) Query User\{") {
    $app = $rule | Get-NetFirewallApplicationFilter
    $programPath = [string]$app.Program
    $display = [string]$rule.DisplayName

    $remove = (
      ([IO.Path]::GetFileName($programPath) -ieq "Nio-OS.exe") -and
      ($display -ieq "Nio-OS" -or $display -ieq "nio-os.exe")
    )

    if ($remove) {
      $rule | Remove-NetFirewallRule -ErrorAction Stop
    }
  }
}

& netsh.exe advfirewall firewall add rule `
  "name=$RuleName" `
  dir=in `
  action=allow `
  enable=yes `
  profile=private `
  protocol=TCP `
  "localport=$Port" `
  remoteip=LocalSubnet `
  "program=$Exe" `
  edge=no | Out-Null

if ($LASTEXITCODE -ne 0) { exit 21 }

if (Test-FinalState) { exit 0 }
exit 22
