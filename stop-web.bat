@echo off
chcp 65001 >nul 2>&1
echo 正在关闭 TAgent Web 服务...
echo.

call :stop_port 8080 "Backend"
call :stop_port 5175 "Web UI"

echo.
echo TAgent Web 服务已关闭。
powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul 2>&1
exit /b 0

:stop_port
echo 关闭 %~2 (%~1)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$conns = Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue; if (-not $conns) { Write-Host '  未发现监听进程'; exit 0 }; $processIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($processId in $processIds) { $p = Get-Process -Id $processId -ErrorAction SilentlyContinue; if ($p) { Write-Host ('  停止 PID ' + $processId + ' (' + $p.ProcessName + ')'); Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue } else { Write-Host ('  停止 PID ' + $processId); Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue } }"
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue) { Write-Host '  警告：端口仍在监听' } else { Write-Host '  已释放' }"
exit /b 0
