@echo off
rem First-time setup on a new Windows computer, then starts the project.
rem Installs (per user, no admin): Node.js, PHP 8.4, Composer under %USERPROFILE%\tools
rem Log: .local-setup\first-run.log
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0first-run.ps1"
echo.
pause
