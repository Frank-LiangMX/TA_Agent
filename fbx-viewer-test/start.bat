@echo off
cd /d "%~dp0"
echo Starting FBX Viewer at http://localhost:3000 ...
npx serve . -l 3000
