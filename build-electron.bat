@echo off
chcp 65001 >nul 2>&1
setlocal

set "ROOT=%~dp0"
set "FRONTEND_DIR=%ROOT%fronted"
set "ELECTRON_DIR=%ROOT%electron"
set "OUTPUT_DIR=%ROOT%dist\electron-release"

echo ========================================
echo   TAgent Build - Electron
echo ========================================
echo.

cd /d "%ROOT%"

echo [1/5] 构建 Web 前端...
cd /d "%FRONTEND_DIR%"
if not exist "node_modules" (
  echo [信息] 安装前端依赖...
  call npm install
  if errorlevel 1 goto fail
)
call npm run build
if errorlevel 1 goto fail

echo [2/5] 同步前端到 fronted/dist（供 PyInstaller）...
cd /d "%ROOT%"
if exist "%FRONTEND_DIR%\dist" rmdir /s /q "%FRONTEND_DIR%\dist"
xcopy /E /I /Y "%ROOT%dist\frontend" "%FRONTEND_DIR%\dist" >nul
if errorlevel 1 goto fail

echo [3/5] 打包 Python 后端...
pyinstaller TAgent.spec --clean --noconfirm
if errorlevel 1 goto fail

echo [4/5] 同步前端到 Electron...
if exist "%ELECTRON_DIR%\dist" rmdir /s /q "%ELECTRON_DIR%\dist"
xcopy /E /I /Y "%ROOT%dist\frontend" "%ELECTRON_DIR%\dist" >nul
if errorlevel 1 goto fail

echo [5/5] 打包 Electron 安装包...
cd /d "%ELECTRON_DIR%"
if not exist "node_modules" (
  echo [信息] 安装 Electron 依赖...
  call npm install
  if errorlevel 1 goto fail
)
call npm run build:win
if errorlevel 1 goto fail

echo [清理] 删除中间产物...
if exist "%ROOT%dist\frontend" rmdir /s /q "%ROOT%dist\frontend"
if exist "%ROOT%dist\TAgent" rmdir /s /q "%ROOT%dist\TAgent"
if exist "%ROOT%build" rmdir /s /q "%ROOT%build"
if exist "%FRONTEND_DIR%\dist" rmdir /s /q "%FRONTEND_DIR%\dist"

echo.
echo ========================================
echo   打包完成
echo   输出目录: dist\electron-release\
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
