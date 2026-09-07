@echo off
chcp 65001 >nul
setlocal
echo ====================================================
echo  Desativar Licenca Local do Nio-OS
echo ====================================================
echo.

set REMOVIDO=0

if exist "%LOCALAPPDATA%\Nio-OS\license\license.nio" (
  del /f /q "%LOCALAPPDATA%\Nio-OS\license\license.nio"
  echo [OK] Licenca removida de: %%LOCALAPPDATA%%\Nio-OS\license\license.nio
  set REMOVIDO=1
)

if exist "%APPDATA%\Nio-OS\license\license.nio" (
  del /f /q "%APPDATA%\Nio-OS\license\license.nio"
  echo [OK] Licenca removida de: %%APPDATA%%\Nio-OS\license\license.nio
  set REMOVIDO=1
)

if exist "%~dp0NIO-NIO-OS-SOFT-DESENVOLVIME-20260816233316.nio" (
  ren "%~dp0NIO-NIO-OS-SOFT-DESENVOLVIME-20260816233316.nio" "NIO-NIO-OS-SOFT-DESENVOLVIME-20260816233316.nio.desativada"
  echo [OK] Licenca residual da pasta de desenvolvimento desativada!
  set REMOVIDO=1
)

echo.
if "%REMOVIDO%"=="1" (
  echo Licenca desativada com sucesso! Ao abrir o Nio-OS, o sistema estara sem licenca ativa.
) else (
  echo Nenhuma licenca ativa foi encontrada para remocao.
)

echo.
pause
