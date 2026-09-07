@echo off
setlocal

title Nio-OS - Preparar Sistema Local

cd /d "%~dp0"

set NEXT_TELEMETRY_DISABLED=1

echo ============================================
echo  Nio-OS - Preparar Sistema Local
echo ============================================
echo.
echo Escolha uma opcao:
echo.
echo [1] Preparar este computador como SERVIDOR da loja
echo [2] Apenas conectar em outro computador da rede
echo.
set /p MODO="Opcao [1/2]: "

if "%MODO%"=="2" goto cliente
if "%MODO%"=="" set MODO=1

:servidor
echo.
echo Modo SERVIDOR selecionado.
echo Este processo configura o SQLite local em data\nio-os.db.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado.
  echo Instale o Node.js antes de continuar.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERRO: npm nao encontrado.
  echo Verifique a instalacao do Node.js.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo ERRO: package.json nao encontrado.
  echo Execute este arquivo dentro da pasta raiz do projeto.
  echo.
  pause
  exit /b 1
)

if not exist "scripts\preparar-env-sqlite-local.js" (
  echo ERRO: scripts\preparar-env-sqlite-local.js nao encontrado.
  echo Substitua os arquivos do pacote antes de preparar.
  echo.
  pause
  exit /b 1
)

echo.
echo 1/5 Configurando ambiente SQLite...
echo.
call node scripts\preparar-env-sqlite-local.js

if errorlevel 1 (
  echo.
  echo ERRO: Falha ao configurar ambiente SQLite.
  echo.
  pause
  exit /b 1
)

echo.
echo 2/5 Instalando dependencias...
echo.
call npm install

if errorlevel 1 (
  echo.
  echo ERRO: Falha ao instalar dependencias.
  echo.
  pause
  exit /b 1
)

echo.
echo 3/5 Gerando Prisma Client...
echo.
call npx prisma generate

if errorlevel 1 (
  echo.
  echo ERRO: Falha ao gerar Prisma Client.
  echo.
  pause
  exit /b 1
)

echo.
echo 4/5 Sincronizando estrutura do banco SQLite...
echo.
call npx prisma db push

if errorlevel 1 (
  echo.
  echo ERRO: Falha ao sincronizar banco SQLite.
  echo Confira se prisma\schema.prisma esta com provider sqlite.
  echo.
  pause
  exit /b 1
)

echo.
echo 5/5 Gerando build de producao...
echo.
call npm run build

if errorlevel 1 (
  echo.
  echo ERRO: Falha ao gerar build.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  Servidor preparado com sucesso!
echo ============================================
echo.
echo Banco local: data\nio-os.db
echo.
echo Agora voce pode abrir o sistema usando:
echo start-local.bat
echo.
pause
exit /b 0

:cliente
echo.
echo Modo CLIENTE selecionado.
echo Este computador nao vai instalar dependencias, criar banco ou procurar backup.
echo.
set /p SERVER_IP="Digite o IP do computador servidor: "
if "%SERVER_IP%"=="" (
  echo IP nao informado.
  pause
  exit /b 1
)

set /p SERVER_PORT="Digite a porta [3000]: "
if "%SERVER_PORT%"=="" set SERVER_PORT=3000

echo.
echo Abrindo:
echo http://%SERVER_IP%:%SERVER_PORT%
echo.
start http://%SERVER_IP%:%SERVER_PORT%
pause
exit /b 0
