@echo off
set PATH=%USERPROFILE%\tools\php;%USERPROFILE%\tools;%PATH%
set LOG=%~dp0db.log
echo ==== %DATE% %TIME% > "%LOG%"
php "%~dp0createdb.php" >> "%LOG%" 2>&1
if errorlevel 1 goto end
cd /d "%~dp0..\api"
php artisan migrate --seed --force --no-interaction >> "%LOG%" 2>&1
echo migrate exit %ERRORLEVEL% >> "%LOG%"
:end
echo DONE >> "%LOG%"
