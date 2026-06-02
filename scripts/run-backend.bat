@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0..\apps\web\server"
echo [TAgent Backend] ws://localhost:8080/ws
echo [TAgent Backend] http://localhost:8080/health
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