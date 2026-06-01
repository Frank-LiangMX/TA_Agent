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

call :ensure_port 8080
if errorlevel 1 (
  echo [1/2] 启动 WebSocket 后端...
  start "TAgent Backend :8080" cmd /k "title TAgent Backend :8080 && chcp 65001 >nul 2>&1 && cd /d ""%SERVER_DIR%"" && echo [TAgent Backend] ws://localhost:8080/ws && echo [TAgent Backend] http://localhost:8080/health && echo. && python -m pip install -q -r requirements.txt && python server.py"
) else (
  echo [1/2] WebSocket 后端已在端口 8080 运行
  call :print_port_info 8080 "Backend"
)

call :ensure_port 5175
if errorlevel 1 (
  echo [2/2] 启动 Web 前端...
  start "TAgent Web UI :5175" cmd /k "title TAgent Web UI :5175 && chcp 65001 >nul 2>&1 && cd /d ""%FRONTEND_DIR%"" && echo [TAgent Web UI] http://localhost:5175 && echo. && npm run dev -- --host 127.0.0.1"
) else (
  echo [2/2] Web 前端已在端口 5175 运行
  call :print_port_info 5175 "Web UI"
)

echo.
echo Web UI 模式已就绪。停止服务可运行 stop-web.bat，或关闭对应窗口。
if "%OPEN_BROWSER%"=="1" (
  echo [信息] 打开 Web UI: http://localhost:5175
  start "" "http://localhost:5175"
)
if "%NO_PAUSE%"=="0" (
  echo.
  echo 按任意键关闭此启动器窗口，Web UI 和后端服务窗口会继续运行。
  pause >nul
)
endlocal
exit /b 0

:ensure_port
powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort %1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:print_port_info
powershell -NoProfile -Command "$c = Get-NetTCPConnection -State Listen -LocalPort %1 -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p) { Write-Host ('    %~2 PID: ' + $p.Id + ' (' + $p.ProcessName + ')') } else { Write-Host ('    %~2 PID: ' + $c.OwningProcess) } }"
exit /b 0
