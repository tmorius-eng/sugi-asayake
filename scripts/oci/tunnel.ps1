<#
.SYNOPSIS
  Keeps the SSH tunnel to the Oracle Cloud jump host open: laptop:3307 ->
  HeatWave MySQL 10.0.1.227:3306 (2026-09-13, docs/OCI-MIGRATION.md).

.DESCRIPTION
  The HeatWave endpoint is private to the VCN, so every DB connection from a
  laptop goes through `ssh -N sugi-oci` (Host block in ~/.ssh/config). This
  loop restarts that ssh whenever it exits -- laptop sleep, wifi change, VM
  reboot -- with a short back-off, so DATABASE_URL=127.0.0.1:3307 keeps
  working without anyone noticing. Registered as a logon task by
  register-tunnel-task.ps1; run it by hand with:  .\scripts\oci\tunnel.ps1

  Health: something listening on 3307 = tunnel up. `ssh` here is Windows'
  built-in OpenSSH (C:\Windows\System32\OpenSSH\ssh.exe).
#>
$ErrorActionPreference = "Continue"
$log = Join-Path $env:LOCALAPPDATA "sugi-oci-tunnel.log"
$backoff = 5
while ($true) {
  $started = Get-Date
  "$(Get-Date -Format s) connecting" | Add-Content $log
  & ssh -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new sugi-oci 2>>$log
  $ran = (Get-Date) - $started
  "$(Get-Date -Format s) ssh exited after $([int]$ran.TotalSeconds)s (code $LASTEXITCODE)" | Add-Content $log
  # A session that lasted a while had simply dropped; reconnect fast. One
  # that died at once (VM down, no network) backs off up to a minute.
  $backoff = if ($ran.TotalSeconds -gt 60) { 5 } else { [Math]::Min($backoff * 2, 60) }
  Start-Sleep -Seconds $backoff
}
