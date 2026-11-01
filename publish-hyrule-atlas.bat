@echo off
rem Double-click this to publish Hyrule Atlas to GitHub.
rem (It starts the PowerShell script with script blocking switched off for this one run only.)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-hyrule-atlas.ps1" %*
echo.
pause
