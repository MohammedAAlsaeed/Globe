@echo off
setlocal
set ROOT=%~dp0..
set TOOLS=%USERPROFILE%\tools
set PHPDIR=%TOOLS%\php
set LOG=%~dp0install.log
echo ==== %DATE% %TIME% > "%LOG%"
if not exist "%TOOLS%" mkdir "%TOOLS%"

echo --- vcruntime >> "%LOG%"
if exist "%SystemRoot%\System32\vcruntime140.dll" (echo vcruntime140 OK >> "%LOG%") else (echo vcruntime140 MISSING >> "%LOG%")

if exist "%PHPDIR%\php.exe" goto havephp
echo --- downloading PHP >> "%LOG%"
curl.exe -fL -o "%TOOLS%\php.zip" "https://windows.php.net/downloads/releases/latest/php-8.4-nts-Win32-vs17-x64-latest.zip" >> "%LOG%" 2>&1
if errorlevel 1 (echo PHP DOWNLOAD FAILED >> "%LOG%" & goto end)
powershell -NoProfile -Command "Expand-Archive -Force '%TOOLS%\php.zip' '%PHPDIR%'" >> "%LOG%" 2>&1
del "%TOOLS%\php.zip"
:havephp

echo --- php.ini >> "%LOG%"
powershell -NoProfile -Command "$d='%PHPDIR%'; $ini=Get-Content \"$d\php.ini-development\"; $ini=$ini -replace '^;\s*extension_dir = \"ext\"','extension_dir = \"ext\"'; foreach($e in 'curl','fileinfo','gd','intl','mbstring','openssl','pdo_pgsql','pgsql','pdo_sqlite','sqlite3','sodium','zip','exif'){ $ini=$ini -replace \"^;extension=$e$\",\"extension=$e\" }; $ini=$ini -replace '^memory_limit = .*','memory_limit = 512M'; $ini=$ini -replace '^upload_max_filesize = .*','upload_max_filesize = 64M'; $ini=$ini -replace '^post_max_size = .*','post_max_size = 64M'; Set-Content \"$d\php.ini\" $ini" >> "%LOG%" 2>&1

if exist "%TOOLS%\composer.phar" goto havecomposer
echo --- downloading composer >> "%LOG%"
curl.exe -fL -o "%TOOLS%\composer.phar" "https://getcomposer.org/download/latest-stable/composer.phar" >> "%LOG%" 2>&1
if errorlevel 1 (echo COMPOSER DOWNLOAD FAILED >> "%LOG%" & goto end)
:havecomposer
(echo @"%PHPDIR%\php.exe" "%TOOLS%\composer.phar" %%*) > "%TOOLS%\composer.bat"

set PATH=%PHPDIR%;%TOOLS%;%PATH%
echo --- versions >> "%LOG%"
php -v >> "%LOG%" 2>&1
php -m >> "%LOG%" 2>&1
call composer --version >> "%LOG%" 2>&1

echo --- composer install >> "%LOG%"
cd /d "%ROOT%\api"
call composer install --no-interaction --no-progress >> "%LOG%" 2>&1
echo composer exit %ERRORLEVEL% >> "%LOG%"

if not exist ".env" (copy ".env.example" ".env" >> "%LOG%" 2>&1)
php artisan key:generate --force >> "%LOG%" 2>&1

:end
echo DONE >> "%LOG%"
