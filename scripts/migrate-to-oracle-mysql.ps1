<#
.SYNOPSIS
  Copies the live Aiven database into an Oracle MySQL HeatWave DB System.

.DESCRIPTION
  2026-09-09: Tom asked to move off Aiven because of latency (measured median
  174ms -- the Aiven service sits in Bangalore, India, while the shop and its
  users are in Ulaanbaatar). Target is MySQL HeatWave Always Free in
  ap-tokyo-1, which is real MySQL 8, so nothing in the application changes:
  Drizzle, mysql2, all 45 migrations and the FULLTEXT catalog search work
  against it unmodified. Only DATABASE_URL moves.

  This is deliberately NOT db-backup.ps1 + db-restore.ps1 back to back, for
  one concrete reason: mysqldump against Aiven emits GTID_PURGED statements
  (it warns about this on every run), and applying those requires the SUPER
  privilege, which OCI's MySQL admin user does not have -- the restore fails
  partway with "Access denied; you need SUPER". The dump below is taken with
  the flags an OCI target actually accepts.

  Safe by default: it dumps, restores, and then COMPARES row counts table by
  table, printing a table of source vs target. It never touches .env and never
  writes to the source. Flipping DATABASE_URL is a separate, manual step you
  take only after the comparison is clean.

.PARAMETER SourceUrl
  mysql://user:pass@host:port/db of the CURRENT database. Defaults to
  $env:DATABASE_URL, or the DATABASE_URL line in .env.

.PARAMETER TargetUrl
  mysql://user:pass@host:port/db of the NEW Oracle MySQL DB system. For a
  Network Load Balancer front end this is the NLB's public IP on port 3306.

.PARAMETER DumpOnly
  Produce the OCI-safe .sql dump and stop, without connecting to the target.

.EXAMPLE
  pwsh scripts/migrate-to-oracle-mysql.ps1 `
    -TargetUrl "mysql://admin:PASSWORD@140.83.x.x:3306/defaultdb?ssl-mode=REQUIRED"
#>
param(
  [string]$SourceUrl,
  [string]$TargetUrl,
  [switch]$DumpOnly,
  [string]$MySqlDumpPath = $env:MYSQLDUMP_PATH,
  [string]$MySqlPath = $env:MYSQL_PATH
)

$ErrorActionPreference = "Stop"

function Resolve-Tool([string]$explicit, [string]$exeName) {
  if ($explicit -and (Test-Path $explicit)) { return $explicit }
  $documented = "C:\Program Files\MySQL\MySQL Server 8.0\bin\$exeName"
  if (Test-Path $documented) { return $documented }
  return $exeName
}

function Parse-MySqlUrl([string]$url) {
  if ($url -notmatch '^mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)') {
    throw "Could not parse connection string: $url"
  }
  [pscustomobject]@{
    User     = [uri]::UnescapeDataString($Matches[1])
    Password = [uri]::UnescapeDataString($Matches[2])
    DbHost   = $Matches[3]
    Port     = $Matches[4]
    Database = $Matches[5]
    RequireSsl = ($url -match '(?i)ssl-mode=required')
  }
}

if (-not $SourceUrl) { $SourceUrl = $env:DATABASE_URL }
if (-not $SourceUrl -and (Test-Path ".env")) {
  $SourceUrl = ((Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=', '')
}
if (-not $SourceUrl) { throw "No source database. Pass -SourceUrl or set DATABASE_URL." }
if (-not $DumpOnly -and -not $TargetUrl) { throw "Pass -TargetUrl (or use -DumpOnly)." }

$mysqldump = Resolve-Tool $MySqlDumpPath "mysqldump.exe"
$mysql = Resolve-Tool $MySqlPath "mysql.exe"

$src = Parse-MySqlUrl $SourceUrl
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$outDir = Join-Path $PSScriptRoot "..\backups"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$sqlFile = Join-Path $outDir "oracle-migration_$stamp.sql"

Write-Host "1/3  Dumping $($src.Database) from $($src.DbHost) (OCI-safe flags)..." -ForegroundColor Cyan
$env:MYSQL_PWD = $src.Password
$dumpArgs = @(
  "--host=$($src.DbHost)", "--port=$($src.Port)", "--user=$($src.User)",
  # --- the flags that make this restorable into OCI MySQL ---
  # GTID state is server-level and applying it needs SUPER, which the OCI
  # admin user does not have. This is the flag mysqldump itself warns about.
  "--set-gtid-purged=OFF",
  # OCI's admin user has no PROCESS privilege, which mysqldump 8 otherwise
  # needs in order to read tablespace metadata.
  "--no-tablespaces",
  "--single-transaction", "--routines", "--triggers",
  "--result-file=$sqlFile"
)
if ($src.RequireSsl) { $dumpArgs += "--ssl-mode=REQUIRED" }
& $mysqldump @dumpArgs $src.Database
if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE" }
# Strip DEFINER clauses. mysqldump has no flag for this (--skip-definer is a
# MySQL Shell option, not a mysqldump one); a view/trigger/routine created with
# a DEFINER that doesn't exist on the target -- and 'avnadmin'@'%' will not
# exist on OCI -- fails to import. Rewriting them to nothing makes the
# importing user the definer, which is what we want.
# 2026-09-23: read/write as UTF-8 explicitly. Get-Content/Set-Content without
# -Encoding use the ANSI code page on Windows PowerShell 5.1 (cp932 on a
# Japanese-locale machine), which turned every Cyrillic character into "?" --
# the same bug db-restore.ps1 fixed on 2026-09-21.
$utf8 = New-Object System.Text.UTF8Encoding($false)
$dumpText = [IO.File]::ReadAllText($sqlFile, $utf8) -replace '/\*!5006[0-9] DEFINER=[^*]*\*/', '' -replace 'DEFINER=`[^`]+`@`[^`]+`\s*', ''
[IO.File]::WriteAllText($sqlFile, $dumpText, $utf8)
$sizeKb = [math]::Round((Get-Item $sqlFile).Length / 1KB, 1)
Write-Host "     Dump written: $sqlFile ($sizeKb KB)" -ForegroundColor Green

if ($DumpOnly) { Write-Host "-DumpOnly set; stopping here." -ForegroundColor Yellow; exit 0 }

$dst = Parse-MySqlUrl $TargetUrl
Write-Host "2/3  Restoring into $($dst.Database) on $($dst.DbHost)..." -ForegroundColor Cyan
$env:MYSQL_PWD = $dst.Password
$restoreArgs = @("--host=$($dst.DbHost)", "--port=$($dst.Port)", "--user=$($dst.User)")
if ($dst.RequireSsl) { $restoreArgs += "--ssl-mode=REQUIRED" }
# Reachability first, with no database selected -- an OCI MySQL DB system
# ships with NO user schema (unlike Aiven's ready-made `defaultdb`), so
# selecting one before creating it would fail with "Unknown database".
& $mysql @restoreArgs -e "SELECT 1" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Cannot reach the target server. Check the NLB listener, the subnet security list, and the credentials." }
& $mysql @restoreArgs -e "CREATE DATABASE IF NOT EXISTS ``$($dst.Database)`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not create the target schema $($dst.Database)." }
# mysql reads the file ITSELF with utf8mb4 (2026-09-23; see db-restore.ps1):
# piping the text through PowerShell re-encodes it with the console code page.
$sourcePath = $sqlFile.Replace([string][char]92, '/')
& $mysql @restoreArgs --default-character-set=utf8mb4 $dst.Database -e "source $sourcePath"
if ($LASTEXITCODE -ne 0) { throw "Restore failed with exit code $LASTEXITCODE" }
Write-Host "     Restore complete." -ForegroundColor Green

Write-Host "3/3  Comparing row counts, table by table..." -ForegroundColor Cyan
function Get-Counts($conn, $db) {
  $env:MYSQL_PWD = $conn.Password
  $args = @("--host=$($conn.DbHost)", "--port=$($conn.Port)", "--user=$($conn.User)", "-N", "-B")
  if ($conn.RequireSsl) { $args += "--ssl-mode=REQUIRED" }
  $tables = (& $mysql @args $db -e "SELECT table_name FROM information_schema.tables WHERE table_schema = '$db' AND table_type = 'BASE TABLE' ORDER BY table_name") -split "`n" | Where-Object { $_ }
  $result = @{}
  foreach ($t in $tables) {
    $t = $t.Trim()
    if (-not $t) { continue }
    $n = (& $mysql @args $db -e "SELECT COUNT(*) FROM ``$t``") | Select-Object -First 1
    $result[$t] = [int]$n
  }
  return $result
}

$srcCounts = Get-Counts $src $src.Database
$dstCounts = Get-Counts $dst $dst.Database
$mismatch = 0
foreach ($t in ($srcCounts.Keys | Sort-Object)) {
  $a = $srcCounts[$t]
  $b = if ($dstCounts.ContainsKey($t)) { $dstCounts[$t] } else { -1 }
  $mark = if ($a -eq $b) { "ok " } else { $mismatch++; "DIFF" }
  "{0,-4} {1,-34} source={2,-8} target={3}" -f $mark, $t, $a, $b
}
Write-Host ""
if ($mismatch -eq 0) {
  Write-Host "All $($srcCounts.Count) tables match. Safe to switch DATABASE_URL." -ForegroundColor Green
} else {
  Write-Host "$mismatch table(s) DO NOT match -- do NOT switch DATABASE_URL yet." -ForegroundColor Red
  exit 1
}
$env:MYSQL_PWD = $null
