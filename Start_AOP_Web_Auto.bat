@echo off
REM AOP Web Application Auto Start Wrapper
REM Created: 2025-10-14
REM This batch file starts the AOP Web Application automatically

echo Starting AOP Web Application...

REM Change to the script directory
cd /d "%~dp0"

REM Check if PowerShell script exists
if not exist "Start_AOP_Web.ps1" (
    echo Error: Start_AOP_Web.ps1 not found in %~dp0
    echo Please make sure the batch file is in the same directory as Start_AOP_Web.ps1
    pause
    exit /b 1
)

REM Execute PowerShell script with bypass policy
REM Default: Development mode
powershell.exe -ExecutionPolicy Bypass -File "%~dp0Start_AOP_Web.ps1"

REM Alternative: Production mode (uncomment the line below and comment the line above)
REM powershell.exe -ExecutionPolicy Bypass -File "%~dp0Start_AOP_Web.ps1" -Production

echo AOP Web Application startup initiated.

REM Wait a moment to see any immediate errors
timeout /t 3 /nobreak >nul

REM Exit silently
exit /b 0