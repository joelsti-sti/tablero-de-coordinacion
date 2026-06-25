@echo off
title Dashboard Unificado
cd /d "%~dp0"

echo ============================================
echo   Dashboard Unificado
echo   Horas Tecnicos / CRM / OCS / ESET
echo ============================================
echo.

:detect_node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado.
    echo Descargalo desde: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js detectado

if not exist "node_modules" (
    echo.
    echo Instalando dependencias...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Fallo la instalacion de dependencias.
        pause
        exit /b 1
    )
    echo [OK] Dependencias instaladas
)

echo.
echo Iniciando servidor...
echo Dashboard disponible en: http://localhost:3005
echo.
start "" http://localhost:3005
node server.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] El servidor se cerro inesperadamente.
    pause
)
