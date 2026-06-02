@echo off
chcp 65001 >nul 2>&1
setlocal

set "ROOT=%~dp0..\"
set "FRONTEND_DIR=%ROOT%apps\web"
set "ELECTRON_DIR=%ROOT%apps\desktop"
set "RELEASE_DIR=%ROOT%release"

echo ========================================
echo   TAgent Build - Electron
echo ========================================
echo.

cd /d "%ROOT%"

echo [1/4] 构建 Web 前端...
cd /d "%FRONTEND_DIR%"
if not exist "node_modules" (
  echo [信息] 安装前端依赖...
  call npm install
  if errorlevel 1 goto fail
)
call npm run build
if errorlevel 1 goto fail

echo [2/4] 打包 Python 后端...
cd /d "%ROOT%"
pyinstaller "%ROOT%TAgent.spec" --clean --noconfirm --distpath "%RELEASE_DIR%\pyinstaller" --workpath "%RELEASE_DIR%\pyinstaller-build"
if errorlevel 1 goto fail

echo [3/4] 打包 Electron 安装包...
if exist "%ELECTRON_DIR%\dist" rmdir /s /q "%ELECTRON_DIR%\dist"
xcopy /E /I /Y "%RELEASE_DIR%\frontend" "%ELECTRON_DIR%\dist" >nul
cd /d "%ELECTRON_DIR%"
if not exist "node_modules" (
  echo [信息] 安装 Electron 依赖...
  call npm install
  if errorlevel 1 goto fail
)
call npm run build:win
if errorlevel 1 goto fail

echo [4/4] 清理中间产物...
if exist "%ELECTRON_DIR%\dist" rmdir /s /q "%ELECTRON_DIR%\dist"
if exist "%RELEASE_DIR%\pyinstaller" rmdir /s /q "%RELEASE_DIR%\pyinstaller"
if exist "%RELEASE_DIR%\pyinstaller-build" rmdir /s /q "%RELEASE_DIR%\pyinstaller-build"
if exist "%RELEASE_DIR%\frontend" rmdir /s /q "%RELEASE_DIR%\frontend"

echo.
echo ========================================
echo   打包完成
echo   输出目录: release\electron\
echo     - TAgent Setup x.x.x.exe（安装包）
echo     - win-unpacked\（免安装版）
echo ========================================
endlocal
exit /b 0

:fail
echo.
echo [错误] 打包失败，请查看上方日志。
endlocal
exit /b 1
