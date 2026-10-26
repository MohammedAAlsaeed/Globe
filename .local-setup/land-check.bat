@echo off
set PATH=%USERPROFILE%\tools;%PATH%
set LOG=%~dp0land-check.log
echo ==== %DATE% %TIME% > "%LOG%"
cd /d "%~dp0..\app"
echo --- typecheck >> "%LOG%"
call npx tsc --noEmit >> "%LOG%" 2>&1
echo tsc exit %ERRORLEVEL% >> "%LOG%"
echo --- lint >> "%LOG%"
call npx eslint app features lib tests >> "%LOG%" 2>&1
echo eslint exit %ERRORLEVEL% >> "%LOG%"
echo --- unit tests >> "%LOG%"
call npm test >> "%LOG%" 2>&1
echo test exit %ERRORLEVEL% >> "%LOG%"
echo DONE >> "%LOG%"
