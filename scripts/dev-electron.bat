@echo off
chcp 65001 >nul 2>&1
setlocal

set "ROOT=%~dp0..\"
set "SCRIPTS_DIR=%~dp0"
set "ELECTRON_DIR=%ROOT%apps\desktop"

echo ========================================
echo   TAgent Dev - Electron
echo ========================================
echo.
echo [信息] Electron 模式会启动/复用 Web 后端服务，但不会打开浏览器。
echo.

set "TAGENT_OPEN_BROWSER=0"
call "%SCRIPTS_DIR%dev-web.bat" --no-pause --no-open

echo.
echo [信息] 等待 Web 前端端口 5175 就绪...
call :wait_port 5175 30
if errorlevel 1 (
  echo [错误] Web 前端启动超时，请检查 TAgent Web UI 窗口
  endlocal
  exit /b 1
)

echo [3/3] 启动 Electron 桌面壳...
cd /d "%ELECTRON_DIR%"
if not exist "node_modules" (
  echo [信息] 首次运行，安装 Electron 依赖...
  call npm install
  if errorlevel 1 (
    echo [错误] Electron 依赖安装失败
    endlocal
    exit /b 1
  )
)

call npm start
if errorlevel 1 (
  echo.
  echo [错误] Electron 启动失败
)
echo.
echo 按任意键关闭此启动器窗口。
pause >nul
endlocal
exit /b 0

:wait_port
set "PORT=%~1"
set "TRIES=%~2"
:wait_loop
powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a TRIES-=1
if %TRIES% LEQ 0 exit /b 1
timeout /t 1 /nobreak >nul
goto wait_loop
