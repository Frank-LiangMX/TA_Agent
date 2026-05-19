@echo off
chcp 65001 >nul
echo ========================================
echo   TAgent Electron 开发模式启动
echo ========================================
echo.

:: 检查前端开发服务器是否运行
echo [信息] 检测前端开发服务器 (localhost:5175)...
curl -s http://localhost:5175 >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [警告] 前端开发服务器未运行，请先启动:
    echo   fronted/Start.bat
    echo.
    pause
    exit /b 1
)
echo [信息] 前端服务器已运行

:: 进入 electron 目录
cd /d "%~dp0"

:: 检查 node_modules
if not exist "node_modules" (
    echo [信息] 首次运行，安装依赖...
    npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

:: 启动 Electron
echo [信息] 启动 Electron...
npm start

pause
