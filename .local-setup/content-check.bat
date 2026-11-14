@echo off
rem Content management (admin/content): runs the API tests, then applies the
rem new migration to the local database. Result: .local-setup\content-check.log
set PATH=%USERPROFILE%\tools\node;%USERPROFILE%\tools\php;%USERPROFILE%\tools;%PATH%
set LOG=%~dp0content-check.log
echo ==== %DATE% %TIME% > "%LOG%"
if exist "%USERPROFILE%\tools\pgsql\bin\pg_ctl.exe" powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)) { Start-Process \"$env:USERPROFILE\tools\pgsql\bin\pg_ctl.exe\" -ArgumentList '-D',\"$env:USERPROFILE\tools\pgdata\",'-l',\"$env:USERPROFILE\tools\pgsql.log\",'start' -WindowStyle Hidden; Start-Sleep -Seconds 4 }" >> "%LOG%" 2>&1
cd /d "%~dp0..\api"
echo --- new tests >> "%LOG%"
php vendor\bin\phpunit --colors=never --filter ContentManagementTest >> "%LOG%" 2>&1
echo content exit %ERRORLEVEL% >> "%LOG%"
echo --- all api tests >> "%LOG%"
php vendor\bin\phpunit --colors=never >> "%LOG%" 2>&1
echo phpunit exit %ERRORLEVEL% >> "%LOG%"
echo --- migrate >> "%LOG%"
php artisan migrate --force --no-interaction >> "%LOG%" 2>&1
echo migrate exit %ERRORLEVEL% >> "%LOG%"
echo DONE >> "%LOG%"
