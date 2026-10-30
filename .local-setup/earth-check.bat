@echo off
set PATH=%USERPROFILE%\tools;%PATH%
set LOG=%~dp0earth-check.log
echo ==== %DATE% %TIME% > "%LOG%"
cd /d "%~dp0..\app"
echo --- Earth template (rebuilt from Natural Earth; must match the committed files) >> "%LOG%"
call npm run templates:earth >> "%LOG%" 2>&1
echo build exit %ERRORLEVEL% >> "%LOG%"
git status --short public/templates >> "%LOG%" 2>&1
echo --- typecheck >> "%LOG%"
call npx tsc --noEmit >> "%LOG%" 2>&1
echo tsc exit %ERRORLEVEL% >> "%LOG%"
echo --- lint >> "%LOG%"
call npx eslint app features lib tests scripts >> "%LOG%" 2>&1
echo eslint exit %ERRORLEVEL% >> "%LOG%"
echo --- unit tests >> "%LOG%"
call npm test >> "%LOG%" 2>&1
echo test exit %ERRORLEVEL% >> "%LOG%"
echo DONE >> "%LOG%"
