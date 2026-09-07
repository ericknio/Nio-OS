@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "desktop\main.cjs" (
  echo ERRO: desktop\main.cjs nao encontrado.
  echo Extraia este pacote na raiz do projeto.
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo Electron nao encontrado. Instalando...
  call npm install -D electron
  if errorlevel 1 (
    echo ERRO: nao foi possivel instalar Electron.
    pause
    exit /b 1
  )
)

call npx electron desktop/main.cjs
