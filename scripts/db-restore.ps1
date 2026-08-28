<#
.SYNOPSIS
  Restores a SUGI ASAYAKE DB backup produced by scripts/db-backup.ps1.

.DESCRIPTION
  ROADMAP.md TIER 5. Safe by default: without -Force, this ALWAYS restores
  into a *different* database (named by -TargetDatabase, or auto-suffixed
  "_restore_drill") rather than overwriting the real one - so you can rehearse
  a restore ("does our backup actually work?") without any risk. Pass -Force
  to genuinely overwrite the database named in -DatabaseUrl, for real disaster
  recovery.

.PARAMETER BackupFile
  Path to a .zip (from db-backup.ps1) or a raw .sql file.

.PARAMETER DatabaseUrl
  mysql://user:password@host:port/dbname - defaults to $env:DATABASE_URL.
  Only its connection details (host/port/user/pass) are used unless -Force
  is also passed, in which case its database name is the restore target too.

.PARAMETER TargetDatabase
  Database name to restore into. Defaults to "<original>_restore_drill".
  Created automatically if it doesn't exist.

.PARAMETER Force
  Restore directly into the database named in -DatabaseUrl instead of a
  drill database. THIS OVERWRITES REAL DATA. Only use this for an actual
  recovery, not a routine drill.

.EXAMPLE
  # Rehearse a restore into a throwaway DB (recommended, routine use):
  pwsh scripts/db-restore.ps1 -BackupFile .\backups\sugi_asayake_2026-08-20_030000.zip

.EXAMPLE
  # Real disaster recovery - overwrites the live DB named in DATABASE_URL:
  pwsh scripts/db-restore.ps1 -BackupFile .\backups\sugi_asayake_2026-08-20_030000.zip -Force
#>
param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$TargetDatabase,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not $DatabaseUrl) {
  throw "DATABASE_URL is not set. Pass -DatabaseUrl, or set `$env:DATABASE_URL first."
}
if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$match = [regex]::Match($DatabaseUrl, '^mysql://(?<user>[^:@]+):(?<pass>[^@]*)@(?<host>[^:/]+)(:(?<port>\d+))?/(?<db>[^?]+)(\?.*)?$')
if (-not $match.Success) {
  throw "Could not parse DATABASE_URL. Expected format: mysql://user:password@host:port/dbname"
}
$dbUser = $match.Groups["user"].Value
$dbPass = $match.Groups["pass"].Value
$dbHost = $match.Groups["host"].Value
$dbPort = if ($match.Groups["port"].Success) { $match.Groups["port"].Value } else { "3306" }
$sourceDb = $match.Groups["db"].Value

$restoreDb = if ($Force) { $sourceDb } elseif ($TargetDatabase) { $TargetDatabase } else { "${sourceDb}_restore_drill" }

if ($Force) {
  Write-Warning "-Force given: this will OVERWRITE the live database '$restoreDb'. Ctrl+C now to abort."
  Start-Sleep -Seconds 5
} else {
  Write-Host "Restoring into drill database '$restoreDb' (the real '$sourceDb' is untouched). Pass -Force for a real recovery."
}

$mysqlCandidate = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
$mysqlPath = if (Test-Path $mysqlCandidate) { $mysqlCandidate } else { "mysql" }

# Accept either a .zip (from db-backup.ps1) or a raw .sql file.
$sqlFile = $BackupFile
$tempDir = $null
if ($BackupFile -like "*.zip") {
  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("sugi-restore-" + [guid]::NewGuid())
  Expand-Archive -Path $BackupFile -DestinationPath $tempDir -Force
  $sqlFile = (Get-ChildItem -Path $tempDir -Filter "*.sql" | Select-Object -First 1).FullName
  if (-not $sqlFile) { throw "No .sql file found inside $BackupFile" }
}

$previousPwd = $env:MYSQL_PWD
$env:MYSQL_PWD = $dbPass
try {
  $mysqlArgs = @("--host=$dbHost", "--port=$dbPort", "--user=$dbUser")
  if ($DatabaseUrl -match '(?i)([?&])ssl-mode=required(&|$)') { $mysqlArgs += "--ssl-mode=REQUIRED" }
  Write-Host "Ensuring database '$restoreDb' exists ..."
  & $mysqlPath @mysqlArgs -e "CREATE DATABASE IF NOT EXISTS ``$restoreDb``;"
  if ($LASTEXITCODE -ne 0) { throw "Failed to create/verify database '$restoreDb' (exit $LASTEXITCODE)" }

  Write-Host "Restoring $sqlFile into '$restoreDb' ..."
  Get-Content $sqlFile -Raw | & $mysqlPath @mysqlArgs $restoreDb
  if ($LASTEXITCODE -ne 0) { throw "mysql restore exited with code $LASTEXITCODE" }
} finally {
  if ($null -eq $previousPwd) { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue } else { $env:MYSQL_PWD = $previousPwd }
  if ($tempDir -and (Test-Path $tempDir)) { Remove-Item $tempDir -Recurse -Force }
}

Write-Host "Restore complete: '$restoreDb'."
if (-not $Force) {
  Write-Host "Drill database left in place for inspection - drop it yourself when done, e.g.:"
  Write-Host "  mysql -u $dbUser -p -e `"DROP DATABASE ``$restoreDb``;`""
}
