@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-admin-panel-local.ps1"
if errorlevel 1 (
    echo.
    echo Admin Panel startup failed. Review the message above and the service windows.
    pause
    exit /b 1
)
