@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0flutter-local.ps1" %*
exit /b %ERRORLEVEL%
