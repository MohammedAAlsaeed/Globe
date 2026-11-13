@echo off
rem One-off: fix the mistyped email of the local account and make it owner.
set PATH=%USERPROFILE%\tools\php;%USERPROFILE%\tools;%PATH%
set LOG=%~dp0fix-account.log
echo ==== %DATE% %TIME% > "%LOG%"
if exist "%USERPROFILE%\tools\pgsql\bin\pg_ctl.exe" powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)) { Start-Process \"$env:USERPROFILE\tools\pgsql\bin\pg_ctl.exe\" -ArgumentList '-D',\"$env:USERPROFILE\tools\pgdata\",'-l',\"$env:USERPROFILE\tools\pgsql.log\",'start' -WindowStyle Hidden; Start-Sleep -Seconds 4 }" >> "%LOG%" 2>&1
php "%~dp0fix-account.php" mmoo1983@hotmsil.com mmoo1983@hotmail.com >> "%LOG%" 2>&1
echo fix exit %ERRORLEVEL% >> "%LOG%"
if errorlevel 1 goto end
cd /d "%~dp0..\api"
php artisan idrisi:make-admin mmoo1983@hotmail.com --role=owner >> "%LOG%" 2>&1
echo make-admin exit %ERRORLEVEL% >> "%LOG%"
:end
echo DONE >> "%LOG%"
