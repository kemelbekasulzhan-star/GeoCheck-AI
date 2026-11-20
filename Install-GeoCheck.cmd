@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
if errorlevel 1 (
 echo Installation failed. Read the message above and README.md.
 pause
 exit /b 1
)
echo Ready. Open Start-GeoCheck.cmd to launch GeoCheck AI.
pause
