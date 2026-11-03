@echo off
rem Easy Performance: doble clic para juntar los CSV de exports en exports\datos.js
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0actualizar.ps1"
echo.
pause
