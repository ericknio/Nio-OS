@echo off
setlocal

title Nio-OS
cd /d "%~dp0"

if "%PORT%"=="" set PORT=3000
set NEXT_TELEMETRY_DISABLED=1
set COOKIE_SECURE=false

:menu
cls
echo ============================================
echo  Nio-OS
echo ============================================
echo.
echo Escolha como este computador vai usar o sistema:
echo.
echo [1] SERVIDOR da loja ^(banco fica neste computador^)
echo [2] CLIENTE da rede ^(conectar em outro servidor^)
echo [3] Sair
echo.
set /p MODO="Opcao [1/2/3]: "

if "%MODO%"=="1" goto servidor
if "%MODO%"=="2" goto cliente
if "%MODO%"=="3" exit /b 0
if "%MODO%"=="" goto servidor
goto menu

:servidor
set HOST=0.0.0.0
set NODE_ENV=production

echo.
echo Modo SERVIDOR selecionado.
echo O banco local usado sera data\nio-os.db.
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

if not exist ".env" (
  echo ERRO: Arquivo .env nao encontrado.
  echo Execute preparar-local.bat antes.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo ERRO: Dependencias nao encontradas.
  echo Execute preparar-local.bat antes.
  pause
  exit /b 1
)

if not exist ".next" (
  echo ERRO: Build nao encontrado.
  echo Execute preparar-local.bat antes.
  pause
  exit /b 1
)

if not exist "data" mkdir "data"
if not exist "backups" mkdir "backups"
if not exist "public\uploads" mkdir "public\uploads"
if not exist "storage\uploads\anexos" mkdir "storage\uploads\anexos"

if not exist "data\nio-os.db" (
  echo ERRO: Banco SQLite local nao encontrado em data\nio-os.db.
  echo Execute preparar-local.bat neste computador servidor.
  pause
  exit /b 1
)

echo.
echo Verificando backup automatico...
echo.
call npm run backup:auto

if errorlevel 1 (
  echo.
  echo ATENCAO: Backup automatico falhou. O sistema sera iniciado mesmo assim.
  timeout /t 4 /nobreak >nul
)

echo.
echo Iniciando servidor Nio-OS...
echo.
echo Janela local do servidor: http://localhost:%PORT%
echo.
echo Enderecos da rede deste computador:
ipconfig | findstr /i "IPv4"
echo.
echo Clientes Windows podem usar a opcao CLIENTE deste mesmo programa.
echo Celulares podem acessar pelo IP acima na porta %PORT%.
echo.
echo Para encerrar o servidor, feche esta janela ou pressione CTRL + C.
echo.

start "" cmd /c "timeout /t 5 /nobreak >nul && node scripts\abrir-janela-app.js http://localhost:%PORT%"
call npm run start -- -H %HOST% -p %PORT%

echo.
echo Sistema encerrado.
pause
exit /b 0

:cliente
echo.
echo Modo CLIENTE selecionado.
echo Este computador nao cria banco e nao inicia servidor.
echo.
node scripts\nio-os-cliente.js
if errorlevel 1 pause
exit /b 0
