$ErrorActionPreference = "Stop"

$paths = @(
  (Join-Path $env:LOCALAPPDATA "Nio-OS\nio-os-desktop-config.json"),
  (Join-Path $env:APPDATA "Nio-OS\nio-os-desktop-config.json")
)

$removidos = 0

foreach ($path in $paths) {
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Force
    Write-Host "Removido: $path"
    $removidos++
  }
}

if ($removidos -eq 0) {
  Write-Host "Nenhuma escolha salva encontrada."
}
