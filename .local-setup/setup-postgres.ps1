# Private PostgreSQL for local development. Safe to run again.
$ProgressPreference = 'SilentlyContinue'
$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$root  = Split-Path -Parent $here
$api   = Join-Path $root 'api'
$tools = Join-Path $env:USERPROFILE 'tools'
$pg    = Join-Path $tools 'pgsql'
$data  = Join-Path $tools 'pgdata'
$bin   = Join-Path $pg 'bin'
$utf8  = New-Object Text.UTF8Encoding($false)
Start-Transcript -Path (Join-Path $here 'setup-postgres.log') -Force | Out-Null
function Step($m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "FAILED: $m" -ForegroundColor Red; Stop-Transcript | Out-Null; exit 1 }
$env:Path = "$(Join-Path $tools 'php');$tools;$bin;$env:Path"

Step '1/5 Download PostgreSQL 18 (official EDB binaries, about 330 MB)'
if (-not (Test-Path (Join-Path $bin 'postgres.exe'))) {
    $zip = Join-Path $tools 'pgsql.zip'
    $got = $null
    foreach ($v in '18.7-1','18.6-1','18.5-1','18.4-1','18.3-1','17.12-1','17.11-1','17.10-1') {
        $url = "https://get.enterprisedb.com/postgresql/postgresql-$v-windows-x64-binaries.zip"
        Write-Host "trying $url"
        & curl.exe -fL --retry 2 -o $zip $url
        if ($LASTEXITCODE -eq 0) { $got = $v; break }
    }
    if (-not $got) { Fail 'could not download PostgreSQL' }
    Write-Host "downloaded $got, extracting ..."
    & tar.exe -xf $zip -C $tools
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $bin 'postgres.exe'))) { Fail 'extract' }
    Remove-Item $zip -Force
}
& (Join-Path $bin 'postgres.exe') --version | Out-Host

Step '2/5 Create the data folder'
if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
    & (Join-Path $bin 'initdb.exe') -D $data -U postgres -A trust -E UTF8 --locale=C | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail 'initdb' }
} else { Write-Host 'data folder already exists' }

Step '3/5 Start the server (127.0.0.1:5432)'
if (-not (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process (Join-Path $bin 'pg_ctl.exe') -ArgumentList '-D', $data, '-l', (Join-Path $tools 'pgsql.log'), '-w', 'start' -WindowStyle Hidden -Wait
}
& (Join-Path $bin 'pg_isready.exe') -h 127.0.0.1 -p 5432 | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "server did not start, see $tools\pgsql.log" }

Step '4/5 Switch api\.env to PostgreSQL'
$envFile = Join-Path $api '.env'
$t = [IO.File]::ReadAllText($envFile)
$t = $t -replace '(?m)^DB_CONNECTION=sqlite', 'DB_CONNECTION=pgsql'
$t = $t -replace '(?m)^# (DB_(HOST|PORT|DATABASE|USERNAME|PASSWORD)=)', '$1'
[IO.File]::WriteAllText($envFile, $t, $utf8)
Select-String -Path $envFile -Pattern '^DB_(CONNECTION|HOST|PORT|DATABASE|USERNAME)=' | ForEach-Object { Write-Host $_.Line }

Step '5/5 Create the database and tables'
& php (Join-Path $here 'createdb.php') | Out-Host
if ($LASTEXITCODE -ne 0) { Fail 'create database' }
Set-Location $api
& php artisan config:clear | Out-Host
& php artisan migrate --seed --force --no-interaction | Out-Host
if ($LASTEXITCODE -ne 0) { Fail 'migrate' }
& php artisan db:show | Out-Host

Start-Sleep -Seconds 4
try { $code = [int](Invoke-WebRequest 'http://localhost:8000/api/v1/plans' -UseBasicParsing -TimeoutSec 30).StatusCode } catch { $code = 0 }
Write-Host "API /api/v1/plans -> $code (200 when the API is running; 0 = API not running, start it with start.bat)"
Write-Host 'POSTGRES READY' -ForegroundColor Green
Stop-Transcript | Out-Null
