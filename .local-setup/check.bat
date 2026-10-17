@echo off
cd /d "%~dp0"
set LOG=%~dp0check.log
echo ==== %DATE% %TIME% > "%LOG%"
echo --- where >> "%LOG%"
where php composer node npm psql pg_ctl git >> "%LOG%" 2>&1
echo --- php -v >> "%LOG%"
php -v >> "%LOG%" 2>&1
echo --- php --ini >> "%LOG%"
php --ini >> "%LOG%" 2>&1
echo --- php -m >> "%LOG%"
php -m >> "%LOG%" 2>&1
echo --- composer >> "%LOG%"
call composer --version >> "%LOG%" 2>&1
echo --- node >> "%LOG%"
node -v >> "%LOG%" 2>&1
call npm -v >> "%LOG%" 2>&1
echo --- services >> "%LOG%"
sc query state= all | findstr /i "postgres" >> "%LOG%" 2>&1
echo --- program files >> "%LOG%"
dir /b "C:\Program Files\PostgreSQL" >> "%LOG%" 2>&1
dir /b "C:\php" >> "%LOG%" 2>&1
dir /b "C:\xampp" >> "%LOG%" 2>&1
dir /b "C:\laragon\bin\php" >> "%LOG%" 2>&1
dir /b "%USERPROFILE%\.config\herd\bin" >> "%LOG%" 2>&1
echo --- ports >> "%LOG%"
netstat -ano | findstr ":5432 :8000 :3000" >> "%LOG%" 2>&1
echo --- PATH >> "%LOG%"
echo %PATH% >> "%LOG%"
echo DONE >> "%LOG%"
