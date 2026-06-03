@echo off
chcp 65001 >nul 2>&1
setlocal

set "SCRIPT_DIR=%~dp0"
python "%SCRIPT_DIR%release.py" %*
exit /b %errorlevel%
