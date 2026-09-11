@echo off
REM ============================================================
REM  AOP_Web_Auto.bat
REM  AOP Web Application - Unified Control Script
REM  
REM  Purpose : Single batch wrapper for Start / Stop / Restart / Status
REM  Usage   : 
REM    AOP_Web_Auto.bat          (Default: Auto Start on Windows Startup / Dev mode)
REM    AOP_Web_Auto.bat start    (Start application)
REM    AOP_Web_Auto.bat stop     (Stop application)
REM    AOP_Web_Auto.bat restart  (Restart application)
REM    AOP_Web_Auto.bat status   (Check status)
REM    AOP_Web_Auto.bat prod     (Start application in Production mode)
REM ============================================================

cd /d "%~dp0"

REM Verify main PowerShell script exists
if not exist "AOP_Web.ps1" (
    echo [ERROR] AOP_Web.ps1 not found in %~dp0
    pause
    exit /b 1
)

set "ACTION=Start"
set "EXTRA_ARGS="

if /i "%~1"=="stop" (
    set "ACTION=Stop"
    set "EXTRA_ARGS=-Force"
) else if /i "%~1"=="restart" (
    set "ACTION=Restart"
    set "EXTRA_ARGS=-Force"
) else if /i "%~1"=="status" (
    set "ACTION=Status"
) else if /i "%~1"=="prod" (
    set "ACTION=Start"
    set "EXTRA_ARGS=-Production"
) else if /i "%~1"=="production" (
    set "ACTION=Start"
    set "EXTRA_ARGS=-Production"
) else if /i "%~1"=="start" (
    set "ACTION=Start"
) else if not "%~1"=="" (
    set "ACTION=%~1"
)

echo =============================================
echo   AOP Web Application [%ACTION%]
echo =============================================

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0AOP_Web.ps1" -Action %ACTION% %EXTRA_ARGS%

echo.
echo AOP Web Application [%ACTION%] completed.
timeout /t 1 /nobreak >nul 2>&1
exit /b 0
