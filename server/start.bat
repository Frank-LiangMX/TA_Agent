@echo off
chcp 65001 >nul 2>&1

echo ========================================
echo   TAgent Server
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] 安装依赖...
pip install -q -r requirements.txt

echo [2/2] 启动服务器...
echo.
python main.py

pause
