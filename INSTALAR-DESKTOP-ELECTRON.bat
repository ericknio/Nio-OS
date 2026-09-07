@echo off
setlocal
cd /d "%~dp0"

title Instalar Nio-OS Desktop Electron

echo ============================================
echo  Nio-OS Desktop - instalar Electron
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERRO: npm nao encontrado.
  pause
  exit /b 1
)

echo Instalando Electron e empacotador desktop...
echo.
npm install --save-dev electron electron-builder
if errorlevel 1 (
  echo.
  echo ERRO ao instalar Electron.
  pause
  exit /b 1
)

echo.
echo Gerando build web atual...
npm run build
if errorlevel 1 (
  echo.
  echo ERRO no build.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  Electron instalado com sucesso.
echo ============================================
echo Agora rode: RODAR-DESKTOP-ELECTRON.bat
echo.
pause
