@echo off
REM ============================================================
REM  Stop_AOP_Web_Auto.bat
REM  AOP Web Application - Auto Stop Wrapper
REM  
REM  Purpose : Stop_AOP_Web.ps1 을 ExecutionPolicy Bypass 로 실행
REM  Usage   : 더블클릭 또는 cmd 에서 실행
REM  Created : 2026-02-27
REM  Ref     : Start_AOP_Web_Auto.bat 와 동일한 패턴
REM ============================================================

echo =============================================
echo   Stopping AOP Web Application...
echo =============================================

REM -- 스크립트가 위치한 디렉토리로 이동 --
cd /d "%~dp0"

REM -- Stop 스크립트 존재 여부 확인 --
if not exist "Stop_AOP_Web.ps1" (
    echo [ERROR] Stop_AOP_Web.ps1 not found in %~dp0
    echo         Please make sure the batch file is in the same directory as Stop_AOP_Web.ps1
    pause
    exit /b 1
)

REM -- PowerShell 스크립트 실행 (ExecutionPolicy Bypass) --
powershell.exe -ExecutionPolicy Bypass -File "%~dp0Stop_AOP_Web.ps1" -Force

echo.
echo AOP Web Application stop process completed.

REM -- 결과 확인을 위해 잠시 대기 --
timeout /t 3 /nobreak >nul
