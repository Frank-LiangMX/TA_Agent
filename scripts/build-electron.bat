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

echo [0/4] Cleaning previous intermediate artifacts...
if exist "%ELECTRON_DIR%\dist" rmdir /s /q "%ELECTRON_DIR%\dist" 2>nul
if exist "%RELEASE_DIR%\frontend" rmdir /s /q "%RELEASE_DIR%\frontend" 2>nul
if exist "%RELEASE_DIR%\pyinstaller" rmdir /s /q "%RELEASE_DIR%\pyinstaller" 2>nul
if exist "%RELEASE_DIR%\pyinstaller-build" rmdir /s /q "%RELEASE_DIR%\pyinstaller-build" 2>nul

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
call npm run build:win
if errorlevel 1 goto fail

echo [4/4] Cleaning intermediate artifacts...
cd /d "%ROOT%"
if exist "%ELECTRON_DIR%\dist" rmdir /s /q "%ELECTRON_DIR%\dist" 2>nul
if exist "%RELEASE_DIR%\frontend" rmdir /s /q "%RELEASE_DIR%\frontend" 2>nul
if exist "%RELEASE_DIR%\pyinstaller" rmdir /s /q "%RELEASE_DIR%\pyinstaller" 2>nul
if exist "%RELEASE_DIR%\pyinstaller-build" rmdir /s /q "%RELEASE_DIR%\pyinstaller-build" 2>nul

echo.
echo ========================================
echo   Build complete
echo   Output: release\electron\
echo     - TAgent Setup x.x.x.exe
echo     - win-unpacked\
echo ========================================
endlocal
exit /b 0

:fail
echo.
echo [error] Build failed. Intermediate artifacts are kept for troubleshooting.
endlocal
exit /b 1
