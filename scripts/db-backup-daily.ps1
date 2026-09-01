<#
.SYNOPSIS
  Loads DATABASE_URL from the repository's ignored .env file and runs the
  normal backup script. Intended for Windows Task Scheduler.
#>
param(
  [string]$RepositoryRoot = (Join-Path $PSScriptRoot ".."),
  [int]$RetentionCount = 14
)

$ErrorActionPreference = "Stop"
$envFile = Join-Path $RepositoryRoot ".env"
if (-not (Test-Path $envFile)) { throw "Missing .env file: $envFile" }

$databaseLine = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $databaseLine) { throw "DATABASE_URL is missing from $envFile" }
$databaseUrl = $databaseLine.Substring("DATABASE_URL=".Length).Trim().Trim('"').Trim("'")
if (-not $databaseUrl) { throw "DATABASE_URL is empty in $envFile" }

& (Join-Path $PSScriptRoot "db-backup.ps1") `
  -DatabaseUrl $databaseUrl `
  -OutputDir (Join-Path $RepositoryRoot "backups") `
  -RetentionCount $RetentionCount
if ($LASTEXITCODE -ne 0) { throw "Daily database backup failed with exit code $LASTEXITCODE" }
