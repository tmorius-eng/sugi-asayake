<#
.SYNOPSIS
  Registers (or refreshes) the "SUGI OCI Tunnel" Windows Task Scheduler task
  that runs scripts/oci/tunnel.ps1 hidden at every logon of the current user.
  No admin rights needed. Run once per laptop:  .\scripts\oci\register-tunnel-task.ps1
#>
$script = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "tunnel.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "SUGI OCI Tunnel" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "SUGI OCI Tunnel"
Start-Sleep -Seconds 5
$up = (Test-NetConnection 127.0.0.1 -Port 3307 -WarningAction SilentlyContinue).TcpTestSucceeded
Write-Host "SUGI OCI Tunnel task registered; port 3307 listening: $up"
