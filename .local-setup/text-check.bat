@echo off
set PATH=%USERPROFILE%\tools\php;%USERPROFILE%\tools;%PATH%
set LOG=%~dp0text-check.log
echo ==== %DATE% %TIME% > "%LOG%"
cd /d "%~dp0..\api"
echo --- api tests >> "%LOG%"
php vendor\bin\phpunit --colors=never >> "%LOG%" 2>&1
echo phpunit exit %ERRORLEVEL% >> "%LOG%"
echo --- migrate + plans >> "%LOG%"
php artisan migrate --force --no-interaction >> "%LOG%" 2>&1
php artisan db:seed --class=PlanSeeder --force --no-interaction >> "%LOG%" 2>&1
cd /d "%~dp0..\app"
echo --- npm install >> "%LOG%"
call npm install --no-audit --no-fund >> "%LOG%" 2>&1
echo npm exit %ERRORLEVEL% >> "%LOG%"
echo --- typecheck >> "%LOG%"
call npx tsc --noEmit >> "%LOG%" 2>&1
echo tsc exit %ERRORLEVEL% >> "%LOG%"
echo --- lint >> "%LOG%"
call npx eslint features lib tests scripts >> "%LOG%" 2>&1
echo eslint exit %ERRORLEVEL% >> "%LOG%"
echo --- unit tests >> "%LOG%"
call npm test >> "%LOG%" 2>&1
echo test exit %ERRORLEVEL% >> "%LOG%"
echo DONE >> "%LOG%"
