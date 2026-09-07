@echo off
setlocal

title Nio-OS - Criar Pacote Local

cd /d "%~dp0"

echo ============================================
echo  Nio-OS - Criar Pacote Local
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERRO: npm nao encontrado.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo ERRO: package.json nao encontrado.
  echo Execute este arquivo na raiz do projeto.
  echo.
  pause
  exit /b 1
)

echo Criando pacote local temporario...
echo Este pacote ainda nao e o instalador final .exe.
echo.

call npm run pacote

if errorlevel 1 (
  echo.
  echo ERRO: Falha ao criar pacote local.
  echo.
  pause
  exit /b 1
)

echo.
echo Pacote local criado com sucesso.
echo.
pause
