@echo off
cd /d "%~dp0"
start "" node server.js
timeout /t 2 /nobreak >nul
echo Servidor iniciado en puerto 3000
pause
