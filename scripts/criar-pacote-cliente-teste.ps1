$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")
$projectRoot = $projectRoot.Path
$outDir = Join-Path $projectRoot "dist-local"
$stage = Join-Path $outDir "nio-os-cliente-teste"
$zip = Join-Path $outDir "nio-os-cliente-teste.zip"

Write-Host "========================================"
Write-Host " Nio-OS - pacote cliente de teste"
Write-Host "========================================"
Write-Host "Projeto: $projectRoot"
Write-Host "Saida:   $zip"
Write-Host ""

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
if (Test-Path $zip) { Remove-Item -Force $zip }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$excludeDirs = @(
  "node_modules",
  ".next",
  "dist-local",
  "backups",
  ".git",
  "data"
)

$excludeFiles = @(
  "*.zip",
  "*.log",
  "*.tmp",
  "*.bak",
  "*.bak-*",
  "*.antes-*",
  "*.antes-*.*",
  "nio-os.db",
  "nio-os.db-wal",
  "nio-os.db-shm",
  "backup.db",
  "backup.db-wal",
  "backup.db-shm"
)

$xd = @()
foreach ($dir in $excludeDirs) {
  $xd += (Join-Path $projectRoot $dir)
}

$args = @(
  $projectRoot,
  $stage,
  "/E",
  "/R:1",
  "/W:1",
  "/NFL",
  "/NDL",
  "/NP",
  "/XD"
) + $xd + @("/XF") + $excludeFiles

Write-Host "Copiando arquivos sem banco, node_modules, .next e backups..."
& robocopy @args | Out-Null
$robocode = $LASTEXITCODE
if ($robocode -ge 8) {
  throw "Robocopy falhou com codigo $robocode"
}

New-Item -ItemType Directory -Force -Path (Join-Path $stage "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage "storage") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage "public\uploads") | Out-Null

@"
# Nio-OS Cliente de Teste

Este pacote foi gerado sem banco local.

Uso no notebook cliente:
1. Instale Node.js 20.9 ou superior.
2. Extraia este ZIP em C:\projetos\sistema-os.
3. Rode:

   npm install
   npx prisma generate
   npm run build
   .\RODAR-DESKTOP-ELECTRON.bat

4. Escolha: Este computador sera CLIENTE.

Nao rode no cliente:
- npx prisma db push
- npm run backup
- LIBERAR-PORTA-3000.bat

O cliente deve conectar no servidor da loja pela rede.
"@ | Set-Content -Path (Join-Path $stage "LEIA-ME-CLIENTE-TESTE.md") -Encoding UTF8

Write-Host "Compactando..."
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force

Write-Host ""
Write-Host "Pacote criado: $zip"
Write-Host "Tamanho:" ((Get-Item $zip).Length / 1MB).ToString("0.00") "MB"
Write-Host ""
Write-Host "OK. Copie esse ZIP para o notebook cliente."
