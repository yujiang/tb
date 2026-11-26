@echo off
setlocal
cd /d "%~dp0"
call npm run build
if errorlevel 1 exit /b 1
node "%~dp0bin-debug\tools\xls\watch_xls.js" %*
exit /b %errorlevel%
