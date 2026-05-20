@echo off
chcp 65001 >nul 2>&1

echo ========================================
echo   TAgent Electron 开发模式启动
echo ========================================
echo.

:: 进入 electron 目录
cd /d "%~dp0"

:: 检查 node_modules
if not exist "node_modules" (
    echo [信息] 首次运行，安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

:: 启动 Electron
echo [信息] 启动 Electron...
echo [提示] 请确保前端已启动: fronted\Start.bat
echo.
call npm start

pause
