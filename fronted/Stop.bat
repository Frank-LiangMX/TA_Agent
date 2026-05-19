@echo off
chcp 65001 >nul
echo 正在关闭 TAgent Web...

:: 关闭后端 (端口 8080)
echo 关闭后端 (8080)...
powershell -Command "Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul

:: 关闭前端 (端口 5175)
echo 关闭前端 (5175)...
powershell -Command "Get-NetTCPConnection -LocalPort 5175 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul

echo TAgent Web 已关闭。
timeout /t 2
