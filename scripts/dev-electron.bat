@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

set "ROOT=%~dp0.."
set "SCRIPTS_DIR=%~dp0"
set "ELECTRON_DIR=%ROOT%\apps\desktop"
set "TAGENT_RUNTIME_HOST=127.0.0.1"

if not defined TAGENT_RUNTIME_PORT (
  for /f %%p in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS_DIR%find-free-port.ps1" 18080 18179') do set "TAGENT_RUNTIME_PORT=%%p"
)

if not defined TAGENT_RUNTIME_PORT (
  echo [error] No available backend port found in 18080-18179.
  endlocal
  exit /b 1
)

set "TAGENT_RUNTIME_URL=http://%TAGENT_RUNTIME_HOST%:%TAGENT_RUNTIME_PORT%"

echo ========================================
echo   TAgent Dev - Electron
echo ========================================
echo.
echo [info] Electron dev mode starts or reuses the local backend and web frontend.
echo [info] Runtime endpoint: %TAGENT_RUNTIME_URL%
echo.

echo [1/3] Checking TAgent backend...
call :check_health %TAGENT_RUNTIME_PORT%
if not errorlevel 1 (
  echo [1/3] TAgent backend is already running.
) else (
  echo [1/3] Starting TAgent backend...
  start "TAgent Backend :%TAGENT_RUNTIME_PORT%" cmd /k call "%SCRIPTS_DIR%run-backend.bat"
  call :wait_health %TAGENT_RUNTIME_PORT% 30
  if errorlevel 1 (
    echo [error] TAgent backend startup timed out.
    endlocal
    exit /b 1
  )
)

echo.
echo [2/3] Checking Web frontend...
call :check_port 5175
if not errorlevel 1 (
  echo [2/3] Web frontend is already running.
) else (
  echo [2/3] Starting Web frontend...
  start "TAgent Web UI :5175" cmd /k call "%SCRIPTS_DIR%run-frontend.bat"
  call :wait_port 5175 30
  if errorlevel 1 (
    echo [error] Web frontend startup timed out.
    endlocal
    exit /b 1
  )
)

echo.
echo [3/3] Starting Electron shell...
cd /d "%ELECTRON_DIR%"
if not exist "node_modules" (
  echo [info] Installing Electron dependencies...
  call npm install
  if errorlevel 1 (
    echo [error] Electron dependency install failed.
    endlocal
    exit /b 1
  )
)

call npm start
if errorlevel 1 (
  echo [error] Electron startup failed.
)

echo.
echo Press any key to close this launcher window.
pause >nul
endlocal
exit /b 0

:check_health
powershell -NoProfile -Command "try { $h = Invoke-RestMethod -Uri ('http://127.0.0.1:{0}/health' -f %~1) -TimeoutSec 2; if ($h.status -eq 'ok' -and $h.app -eq 'TAgentLocalRuntime') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:check_port
powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:wait_health
for /l %%i in (1,1,%~2) do (
  call :check_health %~1
  if !errorlevel! equ 0 exit /b 0
  timeout /t 1 /nobreak >nul
)
exit /b 1

:wait_port
for /l %%i in (1,1,%~2) do (
  call :check_port %~1
  if !errorlevel! equ 0 exit /b 0
  timeout /t 1 /nobreak >nul
)
exit /b 1
