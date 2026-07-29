@echo off
title Gulag System - Gestao da Pelada
color 0B

echo.
echo  ============================================
echo   GULAG SYSTEM - Gestao da Pelada
echo  ============================================
echo.

REM Verifica se Node.js esta instalado
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] Node.js nao encontrado!
    echo  Instale em: https://nodejs.org
    pause
    exit /b 1
)

REM Caminhos
set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend

set PRIMEIRA_INSTALACAO=0

REM Verifica dependencias do backend
if not exist "%BACKEND%\node_modules" (
    echo  [INFO] Instalando dependencias do backend...
    cd /d "%BACKEND%"
    call npm install
    set PRIMEIRA_INSTALACAO=1
    echo.
)

REM Verifica dependencias e build do frontend
if not exist "%FRONTEND%\node_modules" (
    echo  [INFO] Instalando dependencias do frontend...
    cd /d "%FRONTEND%"
    call npm install
    echo.
)

if not exist "%FRONTEND%\dist" (
    echo  [INFO] Gerando build de producao do frontend...
    cd /d "%FRONTEND%"
    call npm run build
    echo.
)

if "%PRIMEIRA_INSTALACAO%"=="1" (
    echo  [INFO] Aplicando migracoes do banco de dados...
    cd /d "%BACKEND%"
    call npm run migrate
    echo.
)

echo  [1/1] Iniciando servidor (backend + frontend na porta 3001)...
start "Gulag System - Servidor" cmd /k "cd /d %BACKEND% && node src/server.js"

echo.
echo  Aguardando servidor iniciar...
timeout /t 4 /nobreak >nul

echo  Abrindo navegador...
start http://localhost:3001

REM Descobre o IP na rede local para acesso pelo celular
set LAN_IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"Endereco IPv4" /c:"Endereço IPv4" /c:"IPv4 Address"') do (
    if not defined LAN_IP set LAN_IP=%%a
)
if defined LAN_IP set LAN_IP=%LAN_IP: =%

echo.
echo  ============================================
echo   Sistema iniciado com sucesso!
echo.
echo   Neste computador:  http://localhost:3001
if defined LAN_IP echo   No celular:        http://%LAN_IP%:3001
echo.
echo   O celular precisa estar na mesma rede Wi-Fi.
echo  ============================================
echo.
echo  Para encerrar, feche a janela "Gulag System - Servidor".
echo.
pause
