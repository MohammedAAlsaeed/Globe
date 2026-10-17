@echo off
rem Starts the Laravel API (http://localhost:8000) and the Next.js app (http://localhost:3000)
set PATH=%USERPROFILE%\tools\php;%USERPROFILE%\tools;%PATH%
start "Globe API :8000" /D "%~dp0..\api" cmd /k php artisan serve --port=8000
start "Globe App :3000" /D "%~dp0..\app" cmd /k npm run dev
