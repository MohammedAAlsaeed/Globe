@echo off
rem Starts PostgreSQL (if installed under %USERPROFILE%\tools), the Laravel API
rem (http://localhost:8000) and the Next.js app (http://localhost:3000)
set PATH=%USERPROFILE%\tools\node;%USERPROFILE%\tools\php;%USERPROFILE%\tools;%PATH%
if exist "%USERPROFILE%\tools\pgsql\bin\pg_ctl.exe" powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)) { Start-Process \"$env:USERPROFILE\tools\pgsql\bin\pg_ctl.exe\" -ArgumentList '-D',\"$env:USERPROFILE\tools\pgdata\",'-l',\"$env:USERPROFILE\tools\pgsql.log\",'-w','start' -WindowStyle Hidden -Wait }"
start "Globe API :8000" /D "%~dp0..\api" cmd /k php artisan serve --port=8000
start "Globe App :3000" /D "%~dp0..\app" cmd /k npm run dev
