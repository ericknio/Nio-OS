@echo off
setlocal
cd /d "%~dp0"
set NEXT_TELEMETRY_DISABLED=1
set COOKIE_SECURE=false
node scripts\nio-os-cliente.js
if errorlevel 1 pause
