@echo off
setlocal
echo Redefinindo modo salvo do Nio-OS Desktop...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$paths = @((Join-Path $env:LOCALAPPDATA 'Nio-OS\nio-os-desktop-config.json'), (Join-Path $env:APPDATA 'Nio-OS\nio-os-desktop-config.json')); foreach ($p in $paths) { if (Test-Path $p) { Remove-Item -LiteralPath $p -Force; Write-Host ('Removido: ' + $p) } }; if (-not ($paths | Where-Object { Test-Path $_ })) { Write-Host 'Modo redefinido.' }"
pause
