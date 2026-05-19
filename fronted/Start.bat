@echo off
chcp 65001 >nul
echo ========================================
echo   TAgent Web - 一键启动
echo   前端: http://localhost:5175
echo   后端: ws://localhost:8080/ws
echo ========================================
echo.

:: 启动后端（新窗口）
echo [1/2] 启动 WebSocket 后端 (端口 8080)...
start "TAgent Server" cmd /c "chcp 65001 >nul && cd /d F:\ta_agent\fronted\server && pip install -q -r requirements.txt 2>nul && python server.py"

:: 等后端启动
timeout /t 3 /nobreak >nul

:: 启动前端（新窗口）
echo [2/2] 启动前端 (端口 5175)...
start "TAgent Web" cmd /c "chcp 65001 >nul && cd /d F:\ta_agent\fronted && set PATH=C:\Users\liangmingxuan\.bun\bin;%%PATH%% && bun run dev"

echo.
echo 两个窗口已启动，关闭此窗口不影响运行。
echo 停止请运行 Stop.bat
timeout /t 5
