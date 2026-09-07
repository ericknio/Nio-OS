@echo off
echo Fechando processos do Nio-OS Desktop...
taskkill /F /T /IM electron.exe >nul 2>nul
taskkill /F /T /IM node.exe >nul 2>nul
echo Processos finalizados.
pause
