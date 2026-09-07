@echo off
chcp 65001 >nul
setlocal

echo ==========================================
echo   Liberar porta 3000 - Nio-OS
echo ==========================================
echo.
echo Este comando encerra processos escutando a porta 3000.
echo Use quando aparecer EADDRINUSE / address already in use.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ids = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if (-not $ids) { Write-Host 'Nenhum processo usando a porta 3000.'; exit 0 }; foreach ($id in $ids) { Write-Host ('Encerrando PID ' + $id); Stop-Process -Id $id -Force }"

echo.
echo Porta 3000 liberada.
pause
