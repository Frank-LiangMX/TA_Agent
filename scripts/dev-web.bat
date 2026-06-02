@echo off
chcp 65001 >nul 2>&1
setlocal

set "ROOT=%~dp0..\"
set "FRONTEND_DIR=%ROOT%apps\web"
set "SERVER_DIR=%FRONTEND_DIR%\server"
set "OPEN_BROWSER=1"
set "NO_PAUSE=0"
if /I "%TAGENT_OPEN_BROWSER%"=="0" set "OPEN_BROWSER=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--no-open" set "OPEN_BROWSER=0"
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"
shift
goto parse_args
:args_done

echo ========================================
echo   TAgent Dev - Web UI
echo   Frontend: http://localhost:5175
echo   Backend : ws://localhost:8080/ws
echo ========================================
echo.

call :ensure_health 8080
if errorlevel 1 (
  call :ensure_port 8080
  if not errorlevel 1 (
    echo [error] Port 8080 is already in use, but it is not TAgent backend.
    call :print_port_info 8080 "Port 8080"
    endlocal
    exit /b 1
  )
  echo [1/2] Starting WebSocket backend...
  set "BACKEND_SCRIPT=%~dp0run-backend.bat"
  start "TAgent Backend :8080" cmd /k call "%BACKEND_SCRIPT%"
) else (
  echo [1/2] TAgent backend is already running on port 8080.
  call :print_port_info 8080 "Backend"
)

call :ensure_port 5175
if errorlevel 1 (
  echo [2/2] Starting Web frontend...
  set "FRONTEND_SCRIPT=%~dp0run-frontend.bat"
  start "TAgent Web UI :5175" cmd /k call "%FRONTEND_SCRIPT%"
) else (
  echo [2/2] Web frontend is already running on port 5175.
  call :print_port_info 5175 "Web UI"
)

echo.
echo Web UI dev mode is ready. Close the spawned windows or run stop-web.bat to stop services.
if "%OPEN_BROWSER%"=="1" (
  echo [info] Opening Web UI: http://localhost:5175
  start "" "http://localhost:5175"
)
if "%NO_PAUSE%"=="0" (
  echo.
  echo Press any key to close this launcher window. Backend and Web UI windows will keep running.
  pause >nul
)
endlocal
exit /b 0

:ensure_port
powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort %1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:ensure_health
powershell -NoProfile -Command "try { $h = Invoke-RestMethod -Uri ('http://127.0.0.1:{0}/health' -f %1) -TimeoutSec 2; if ($h.status -eq 'ok' -and $h.app -eq 'TAgentLocalRuntime') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:print_port_info
powershell -NoProfile -Command "$c = Get-NetTCPConnection -State Listen -LocalPort %1 -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p) { Write-Host ('    %~2 PID: ' + $p.Id + ' (' + $p.ProcessName + ')') } else { Write-Host ('    %~2 PID: ' + $c.OwningProcess) } }"
exit /b 0
