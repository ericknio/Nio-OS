@echo off
echo ====================================================
echo Nio-OS Cloud Dashboard - Docker Build ^& Deploy Helper
echo ====================================================

echo.
echo [1] Construindo a imagem Docker (nio-os-cloud-dashboard)...
docker build -t nio-os-cloud-dashboard:latest .
if %ERRORLEVEL% NEQ 0 (
    echo Erro ao construir a imagem Docker.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2] Imagem construida com sucesso!
echo.
echo Para rodar localmente e testar (porta 3000):
echo docker run -d -p 3000:3000 --env-file .env --name nio-os-cloud nio-os-cloud-dashboard:latest
echo.
echo Lembre-se de configurar a variavel de ambiente NIO_CLOUD_DATABASE_URL no seu servidor de producao, e JWT_SECRET.
echo E tambem lembre de expor a porta correta no deploy.
echo.
pause
