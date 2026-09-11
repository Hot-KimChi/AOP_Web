@echo off
REM ============================================================
REM  AOP_Web.bat
REM  AOP Web Application - Single Entry Point
REM
REM  Usage :
REM    AOP_Web.bat            Start in development mode (default / Windows startup)
REM    AOP_Web.bat start      Start servers
REM    AOP_Web.bat stop       Stop servers
REM    AOP_Web.bat restart    Restart servers
REM    AOP_Web.bat status     Show running status
REM    AOP_Web.bat prod       Start in production mode
REM
REM  Implementation : scripts\AOP_Web.ps1
REM ============================================================

cd /d "%~dp0"

set "PS_SCRIPT=%~dp0scripts\AOP_Web.ps1"
if not exist "%PS_SCRIPT%" (
    echo [ERROR] scripts\AOP_Web.ps1 not found in %~dp0
    exit /b 1
)

set "ACTION=Start"
set "EXTRA_ARGS="

if /i "%~1"=="" (
    rem Default: unattended start on Windows startup
) else if /i "%~1"=="start" (
    set "ACTION=Start"
) else if /i "%~1"=="stop" (
    set "ACTION=Stop"
    set "EXTRA_ARGS=-Force"
) else if /i "%~1"=="restart" (
    set "ACTION=Restart"
    set "EXTRA_ARGS=-Force"
) else if /i "%~1"=="status" (
    set "ACTION=Status"
) else if /i "%~1"=="prod" (
    set "EXTRA_ARGS=-Production"
) else if /i "%~1"=="production" (
    set "EXTRA_ARGS=-Production"
) else (
    echo [ERROR] Unknown command: %~1
    echo Usage: AOP_Web.bat [start^|stop^|restart^|status^|prod]
    exit /b 1
)

echo =============================================
echo   AOP Web Application [%ACTION%]
echo =============================================

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -Action %ACTION% %EXTRA_ARGS%
set "RC=%ERRORLEVEL%"

echo.
echo AOP Web Application [%ACTION%] finished with exit code %RC%.
exit /b %RC%
