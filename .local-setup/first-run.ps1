# First-time setup for the Globe project on Windows, then start it.
# Safe to run again: every step is skipped when already done.
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$root  = Split-Path -Parent $here
$api   = Join-Path $root 'api'
$app   = Join-Path $root 'app'
$tools = Join-Path $env:USERPROFILE 'tools'
$php   = Join-Path $tools 'php'
$node  = Join-Path $tools 'node'
$utf8  = New-Object Text.UTF8Encoding($false)
Start-Transcript -Path (Join-Path $here 'first-run.log') -Force | Out-Null
function Step($m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "FAILED: $m" -ForegroundColor Red; Stop-Transcript | Out-Null; exit 1 }
New-Item -ItemType Directory -Force $tools | Out-Null

Step '1/7 Node.js'
$haveNode = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
    $major = [int]((& node -v).TrimStart('v').Split('.')[0])
    if ($major -ge 22) { $haveNode = $true } else { Write-Host "System Node is v$major (too old), using a private copy." }
}
if (-not $haveNode) {
    if (-not (Test-Path (Join-Path $node 'node.exe'))) {
        Write-Host 'Downloading Node.js 24 LTS ...'
        try {
            $v = ((Invoke-RestMethod 'https://nodejs.org/dist/index.json') | Where-Object { $_.version -like 'v24.*' } | Select-Object -First 1).version
            if (-not $v) { throw 'could not find a Node 24 release' }
            $name = "node-$v-win-x64"
            $zip = Join-Path $tools 'node.zip'; $tmp = Join-Path $tools 'node-tmp'
            Invoke-WebRequest "https://nodejs.org/dist/$v/$name.zip" -OutFile $zip
            Expand-Archive -Force $zip $tmp
            Move-Item (Join-Path $tmp $name) $node
            Remove-Item $tmp, $zip -Recurse -Force
        } catch { Fail "Node.js download: $_" }
    }
    $env:Path = "$node;$env:Path"
}
Write-Host "node $(& node -v), npm $(& npm.cmd -v)"

Step '2/7 PHP 8.4'
if (-not (Test-Path (Join-Path $php 'php.exe'))) {
    Write-Host 'Downloading PHP ...'
    try {
        $zip = Join-Path $tools 'php.zip'
        Invoke-WebRequest 'https://windows.php.net/downloads/releases/latest/php-8.4-nts-Win32-vs17-x64-latest.zip' -OutFile $zip -UserAgent 'Mozilla/5.0'
        Expand-Archive -Force $zip $php
        Remove-Item $zip -Force
    } catch { Fail "PHP download: $_" }
}
$cacert = Join-Path $php 'cacert.pem'
if (-not (Test-Path $cacert)) {
    try { Invoke-WebRequest 'https://curl.se/ca/cacert.pem' -OutFile $cacert } catch { Write-Host "cacert.pem download failed: $_" -ForegroundColor Yellow }
}
if (-not (Test-Path (Join-Path $php 'php.ini'))) {
    $ini = Get-Content (Join-Path $php 'php.ini-development')
    $ini = $ini -replace '^;\s*extension_dir = "ext"', 'extension_dir = "ext"'
    foreach ($e in 'curl','fileinfo','gd','intl','mbstring','openssl','pdo_pgsql','pgsql','pdo_sqlite','sqlite3','sodium','zip','exif') {
        $ini = $ini -replace "^;extension=$e$", "extension=$e"
    }
    $ini = $ini -replace '^memory_limit = .*', 'memory_limit = 512M'
    $ini = $ini -replace '^upload_max_filesize = .*', 'upload_max_filesize = 64M'
    $ini = $ini -replace '^post_max_size = .*', 'post_max_size = 64M'
    if (Test-Path $cacert) {
        $ini = $ini -replace '^;curl\.cainfo\s*=.*', "curl.cainfo = `"$cacert`""
        $ini = $ini -replace '^;openssl\.cafile\s*=.*', "openssl.cafile = `"$cacert`""
    }
    Set-Content (Join-Path $php 'php.ini') $ini
}
$env:Path = "$php;$tools;$env:Path"
& php -v
if ($LASTEXITCODE -ne 0) { Fail 'PHP does not start. Install the "Microsoft Visual C++ Redistributable x64" (https://aka.ms/vs/17/release/vc_redist.x64.exe) and run this again.' }

Step '3/7 Composer'
$phar = Join-Path $tools 'composer.phar'
if (-not (Test-Path $phar)) {
    try { Invoke-WebRequest 'https://getcomposer.org/download/latest-stable/composer.phar' -OutFile $phar } catch { Fail "Composer download: $_" }
}
Set-Content (Join-Path $tools 'composer.bat') "@`"$php\php.exe`" `"$phar`" %*"

Step '4/7 API packages (composer install)'
Set-Location $api
if (-not (Test-Path 'vendor\autoload.php')) {
    & php $phar install --no-interaction --no-progress
    if ($LASTEXITCODE -ne 0) { Fail 'composer install' }
} else { Write-Host 'vendor already installed' }
if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    & php artisan key:generate --force
}

Step '5/7 Database'
$envText = [IO.File]::ReadAllText((Join-Path $api '.env'))
if ($envText -match '(?m)^DB_CONNECTION=pgsql') {
    $pgOk = $false
    if (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue) {
        & php (Join-Path $here 'createdb.php')
        $pgOk = ($LASTEXITCODE -eq 0)
    } else { Write-Host 'No PostgreSQL server is running on this computer.' }
    if (-not $pgOk) {
        Write-Host 'Using a local SQLite file instead (api\database\database.sqlite).' -ForegroundColor Yellow
        Write-Host 'To use PostgreSQL later: set DB_* in api\.env and run .local-setup\db.bat' -ForegroundColor Yellow
        $envText = $envText -replace '(?m)^DB_CONNECTION=pgsql', 'DB_CONNECTION=sqlite'
        $envText = $envText -replace '(?m)^(DB_(HOST|PORT|DATABASE|USERNAME|PASSWORD)=)', '# $1'
        [IO.File]::WriteAllText((Join-Path $api '.env'), $envText, $utf8)
    }
}
if ((([IO.File]::ReadAllText((Join-Path $api '.env'))) -match '(?m)^DB_CONNECTION=sqlite') -and -not (Test-Path 'database\database.sqlite')) {
    New-Item -ItemType File 'database\database.sqlite' | Out-Null
}
& php artisan migrate --seed --force --no-interaction
if ($LASTEXITCODE -ne 0) { Fail 'database migration' }

Step '6/7 App packages (npm install)'
Set-Location $app
if (-not (Test-Path '.env.local')) { Copy-Item '.env.example' '.env.local' }
if (-not (Test-Path 'node_modules\next')) {
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Fail 'npm install' }
} else { Write-Host 'node_modules already installed' }

Step '7/7 Starting'
Start-Process cmd -ArgumentList '/k', 'title Globe API :8000 & php artisan serve --port=8000' -WorkingDirectory $api
Start-Process cmd -ArgumentList '/k', 'title Globe App :3000 & npm run dev' -WorkingDirectory $app
function Probe($url, $seconds) {
    $end = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $end) {
        try { return [int](Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 60).StatusCode } catch { Start-Sleep -Seconds 2 }
    }
    return 0
}
$a = Probe 'http://localhost:8000/sanctum/csrf-cookie' 40
$w = Probe 'http://localhost:3000/' 120
Write-Host "API  http://localhost:8000 -> $a (expected 204)"
Write-Host "App  http://localhost:3000 -> $w (expected 200)"
if ($w -eq 200) { Start-Process 'http://localhost:3000' }
if ($a -eq 204 -and $w -eq 200) { Write-Host 'READY' -ForegroundColor Green } else { Write-Host 'NOT READY - see the two server windows' -ForegroundColor Red }
Stop-Transcript | Out-Null
