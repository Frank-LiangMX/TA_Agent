@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0..\apps\web"
echo [TAgent Web UI] http://localhost:5175
echo.
npm run dev -- --host 127.0.0.1
if errorlevel 1 (
  echo [error] Frontend startup failed.
  pause
  exit /b 1
)