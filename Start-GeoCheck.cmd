@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
 echo First install: open Install-GeoCheck.cmd. GitHub ZIP contains source files only.
 echo Python 3.12 and Node.js 22.12+ or 24 are required. See README.md.
 pause
 exit /b 1
)
if not exist "frontend\dist\index.html" (
 echo Frontend is not built. Open Install-GeoCheck.cmd first. See README.md.
 pause
 exit /b 1
)
echo GeoCheck AI: http://127.0.0.1:8000
".venv\Scripts\python.exe" scripts\launch.py
if errorlevel 1 pause

