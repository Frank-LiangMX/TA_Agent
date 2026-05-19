@echo off
chcp 65001 >nul
echo ========================================
echo   TAgent Electron 打包
echo ========================================
echo.

:: 进入 electron 目录
cd /d "%~dp0"

:: 检查 node_modules
if not exist "node_modules" (
    echo [信息] 安装依赖...
    npm install
)

:: 检查前端构建
if not exist "dist" (
    echo [错误] 请先构建前端: cd ../fronted && npm run build
    echo [提示] 然后将 dist 目录复制到 electron/dist
    pause
    exit /b 1
)

:: 检查 Python 后端
if not exist "..\dist\TAgent\TAgent.exe" (
    echo [错误] 请先打包 Python 后端: pyinstaller TAgent.spec
    pause
    exit /b 1
)

:: 打包 Electron
echo [信息] 开始打包...
npm run build:win

echo.
echo [完成] 安装包在 electron/release 目录
pause
