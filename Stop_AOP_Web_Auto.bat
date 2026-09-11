@echo off
REM Legacy Wrapper for Backward Compatibility -> Calls AOP_Web_Auto.bat stop
cd /d "%~dp0"
call "%~dp0AOP_Web_Auto.bat" stop %*
exit /b %ERRORLEVEL%
