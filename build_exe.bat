@echo off
chcp 65001 >nul
echo ========================================
echo   TAgent 一键打包（独立 exe）
echo ========================================
echo.

set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo [1/5] 检查 PyInstaller...
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo 安装 PyInstaller...
    pip install pyinstaller
)

echo [2/5] 构建前端静态文件...
cd /d "%PROJECT_DIR%fronted"
if exist "node_modules" (
    call npm run build 2>nul
    if errorlevel 1 (
        echo 前端构建失败，跳过（使用开发模式）
    ) else (
        echo 前端构建成功
    )
) else (
    echo 前端 node_modules 不存在，跳过构建
)
cd /d "%PROJECT_DIR%"

echo [3/5] 清理旧的打包...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"

echo [4/5] PyInstaller 打包...
pyinstaller TAgent.spec --clean --noconfirm

echo [5/5] 复制额外文件...
if exist "dist\TAgent" (
    copy /y "fronted\server\requirements.txt" "dist\TAgent\" >nul 2>&1
)

echo.
echo ========================================
echo   打包完成！
echo.
echo   输出: dist\TAgent\TAgent.exe
echo   大小:
dir /s "dist\TAgent\TAgent.exe" 2>nul | find "TAgent.exe"
echo.
echo   使用: 双击 TAgent.exe
echo   前置: 无（完全独立）
echo ========================================
