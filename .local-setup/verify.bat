@echo off
set LOG=%~dp0verify.log
echo ==== %DATE% %TIME% > "%LOG%"
netstat -ano | findstr "LISTENING" | findstr ":8000 :3000" >> "%LOG%" 2>&1
echo --- api csrf >> "%LOG%"
curl.exe -s -o NUL -w "%%{http_code}" http://localhost:8000/sanctum/csrf-cookie >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo --- app >> "%LOG%"
curl.exe -s -o NUL -w "%%{http_code}" --max-time 90 http://localhost:3000/ >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo DONE >> "%LOG%"
