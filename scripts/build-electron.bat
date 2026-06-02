@echo off
chcp 65001 >nul 2>&1
setlocal

set "ROOT=%~dp0..\"
set "FRONTEND_DIR=%ROOT%apps\web"
set "ELECTRON_DIR=%ROOT%apps\desktop"
set "RELEASE_DIR=%ROOT%release"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "BUILD_ID=%%i"
set "ELECTRON_RELEASE_ROOT=%RELEASE_DIR%\electron"
set "ELECTRON_OUTPUT_DIR=%ELECTRON_RELEASE_ROOT%\%BUILD_ID%"
set "ELECTRON_LATEST_DIR=%ELECTRON_RELEASE_ROOT%\latest"
set "BUILDER_CONFIG=%ELECTRON_DIR%\electron-builder.generated.yml"

echo ========================================
echo   TAgent Build - Electron
echo ========================================
echo.
echo [info] Build id: %BUILD_ID%
echo [info] Electron output: %ELECTRON_OUTPUT_DIR%
echo.

cd /d "%ROOT%"

echo [0/4] Cleaning previous intermediate artifacts...
if exist "%ELECTRON_DIR%\dist" rmdir /s /q "%ELECTRON_DIR%\dist" 2>nul
if exist "%RELEASE_DIR%\frontend" rmdir /s /q "%RELEASE_DIR%\frontend" 2>nul
if exist "%RELEASE_DIR%\pyinstaller" rmdir /s /q "%RELEASE_DIR%\pyinstaller" 2>nul
if exist "%RELEASE_DIR%\pyinstaller-build" rmdir /s /q "%RELEASE_DIR%\pyinstaller-build" 2>nul
if exist "%BUILDER_CONFIG%" del /f /q "%BUILDER_CONFIG%" 2>nul

echo [1/4] Building Web frontend...
cd /d "%FRONTEND_DIR%"
if not exist "node_modules" (
  echo [info] Installing frontend dependencies...
  call npm install
  if errorlevel 1 goto fail
)
call npm run build
if errorlevel 1 goto fail

echo [2/4] Packaging Python backend...
cd /d "%ROOT%"
pyinstaller "%ROOT%TAgent.spec" --clean --noconfirm --distpath "%RELEASE_DIR%\pyinstaller" --workpath "%RELEASE_DIR%\pyinstaller-build"
if errorlevel 1 goto fail

echo [3/4] Building Electron package...
if exist "%ELECTRON_DIR%\dist" rmdir /s /q "%ELECTRON_DIR%\dist" 2>nul
xcopy /E /I /Y "%RELEASE_DIR%\frontend" "%ELECTRON_DIR%\dist" >nul
cd /d "%ELECTRON_DIR%"
if not exist "node_modules" (
  echo [info] Installing Electron dependencies...
  call npm install
  if errorlevel 1 goto fail
)

echo [info] Generating timestamped electron-builder config...
powershell -NoProfile -Command "$src='%ELECTRON_DIR:\=\\%\\electron-builder.yml'; $dst='%BUILDER_CONFIG:\=\\%'; $out='../../release/electron/%BUILD_ID%'; (Get-Content -LiteralPath $src) -replace '^  output: .+$', ('  output: ' + $out) | Set-Content -LiteralPath $dst -Encoding utf8"
if errorlevel 1 goto fail

call npm run build:win -- --config electron-builder.generated.yml --publish never
if errorlevel 1 goto fail

echo [4/4] Cleaning intermediate artifacts...
cd /d "%ROOT%"
if exist "%ELECTRON_DIR%\dist" rmdir /s /q "%ELECTRON_DIR%\dist" 2>nul
if exist "%RELEASE_DIR%\frontend" rmdir /s /q "%RELEASE_DIR%\frontend" 2>nul
if exist "%RELEASE_DIR%\pyinstaller" rmdir /s /q "%RELEASE_DIR%\pyinstaller" 2>nul
if exist "%RELEASE_DIR%\pyinstaller-build" rmdir /s /q "%RELEASE_DIR%\pyinstaller-build" 2>nul
if exist "%BUILDER_CONFIG%" del /f /q "%BUILDER_CONFIG%" 2>nul

echo [info] Updating latest copy...
call :update_latest
if errorlevel 1 (
  echo [warn] Could not update release\electron\latest because it is locked.
  echo [warn] The timestamped build is still valid: %ELECTRON_OUTPUT_DIR%
)

echo.
echo ========================================
echo   Build complete
echo   Output: release\electron\%BUILD_ID%\
echo     - TAgent Setup x.x.x.exe
echo     - win-unpacked\
echo   Latest: release\electron\latest\  ^(updated only when not locked^)
echo ========================================
endlocal
exit /b 0

:fail
echo.
echo [error] Build failed. Intermediate artifacts are kept for troubleshooting.
if exist "%BUILDER_CONFIG%" del /f /q "%BUILDER_CONFIG%" 2>nul
endlocal
exit /b 1

:update_latest
if exist "%ELECTRON_LATEST_DIR%" (
  rmdir /s /q "%ELECTRON_LATEST_DIR%" 2>nul
  if exist "%ELECTRON_LATEST_DIR%" exit /b 1
)
mkdir "%ELECTRON_LATEST_DIR%" >nul 2>&1
if errorlevel 1 exit /b 1
xcopy /E /I /Y "%ELECTRON_OUTPUT_DIR%" "%ELECTRON_LATEST_DIR%" >nul
exit /b %errorlevel%
