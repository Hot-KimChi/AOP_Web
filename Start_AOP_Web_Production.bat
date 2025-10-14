@echo off
REM AOP Web Application Auto Start Wrapper - Production Mode
REM Created: 2025-10-14

echo Starting AOP Web Application (Production Mode)...

REM Change to the script directory
cd /d "%~dp0"

REM Check if PowerShell script exists
if not exist "Start_AOP_Web.ps1" (
    echo Error: Start_AOP_Web.ps1 not found in %~dp0
    pause
    exit /b 1
)

REM Execute PowerShell script in Production mode
powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Start_AOP_Web.ps1" -Production

echo AOP Web Application (Production Mode) startup initiated.
timeout /t 3 /nobreak >nul
exit /b 0