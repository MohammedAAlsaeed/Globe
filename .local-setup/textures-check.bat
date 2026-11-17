@echo off
rem Texture library (feat/textures-library): API tests, code style, then the
rem new migration on the local database. Result: .local-setup\textures-check.log
set PATH=%USERPROFILE%\tools\node;%USERPROFILE%\tools\php;%USERPROFILE%\tools;%PATH%
set LOG=%~dp0textures-check.log
echo ==== %DATE% %TIME% > "%LOG%"
if exist "%USERPROFILE%\tools\pgsql\bin\pg_ctl.exe" powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)) { Start-Process \"$env:USERPROFILE\tools\pgsql\bin\pg_ctl.exe\" -ArgumentList '-D',\"$env:USERPROFILE\tools\pgdata\",'-l',\"$env:USERPROFILE\tools\pgsql.log\",'start' -WindowStyle Hidden; Start-Sleep -Seconds 4 }" >> "%LOG%" 2>&1
cd /d "%~dp0..\api"
echo --- new tests >> "%LOG%"
php vendor\bin\phpunit --colors=never --filter TextureLibraryTest >> "%LOG%" 2>&1
echo textures exit %ERRORLEVEL% >> "%LOG%"
echo --- all api tests >> "%LOG%"
php vendor\bin\phpunit --colors=never >> "%LOG%" 2>&1
echo phpunit exit %ERRORLEVEL% >> "%LOG%"
echo --- pint >> "%LOG%"
php vendor\bin\pint --test >> "%LOG%" 2>&1
echo pint exit %ERRORLEVEL% >> "%LOG%"
echo --- migrate >> "%LOG%"
php artisan migrate --force --no-interaction >> "%LOG%" 2>&1
echo migrate exit %ERRORLEVEL% >> "%LOG%"
echo DONE >> "%LOG%"
