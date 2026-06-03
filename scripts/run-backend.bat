@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0..\apps\web\server"
if not defined TAGENT_RUNTIME_HOST set "TAGENT_RUNTIME_HOST=127.0.0.1"
if not defined TAGENT_RUNTIME_PORT set "TAGENT_RUNTIME_PORT=8080"
if not defined TAGENT_RUNTIME_URL set "TAGENT_RUNTIME_URL=http://%TAGENT_RUNTIME_HOST%:%TAGENT_RUNTIME_PORT%"
echo [TAgent Backend] ws://%TAGENT_RUNTIME_HOST%:%TAGENT_RUNTIME_PORT%/ws
echo [TAgent Backend] %TAGENT_RUNTIME_URL%/health
echo.
python -m pip install -q -r requirements.txt
if errorlevel 1 (
  echo [error] Backend dependency install failed.
  pause
  exit /b 1
)
python server.py
if errorlevel 1 (
  echo [error] Backend startup failed.
  pause
  exit /b 1
)
