@echo off
rem Installs a private PostgreSQL under %USERPROFILE%\tools (no admin), starts it,
rem and switches api\.env from SQLite to PostgreSQL. Log: .local-setup\setup-postgres.log
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-postgres.ps1"
echo.
pause
