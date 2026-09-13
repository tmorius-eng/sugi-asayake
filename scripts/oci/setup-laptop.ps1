<#
.SYNOPSIS
  One-time setup of a SECOND laptop for the Oracle HeatWave database
  (2026-09-13). Run it on the home laptop (user hero_); the work laptop
  (DESKTOP-4GALLRR) was set up by hand the same day.

.DESCRIPTION
  Step 1 (this script, run from the repo root):
    - creates an SSH key ~/.ssh/sugi-oci if missing and PRINTS the public key
    - writes the `Host sugi-oci` block into ~/.ssh/config (jump VM + 3307 forward)
    - registers the "SUGI OCI Tunnel" logon task (scripts/oci/tunnel.ps1)
  Step 2 (Claude, from a laptop that already has access): adds the printed
    public key to the VM's ~/.ssh/authorized_keys.
  Step 3 (this script again, with -Finish): fetches oci-ca.pem from the VM
    and tells you which three .env lines to copy from the other laptop.

  Usage:
    .\scripts\oci\setup-laptop.ps1            # step 1 -> send the printed key to Claude
    .\scripts\oci\setup-laptop.ps1 -Finish    # step 3, after Claude confirms the key is on the VM
#>
param([switch]$Finish)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sshDir = Join-Path $HOME ".ssh"
$key = Join-Path $sshDir "sugi-oci"
$cfg = Join-Path $sshDir "config"
$vmIp = "168.110.25.230"
$dbIp = "10.0.1.227"

if (-not $Finish) {
  New-Item -ItemType Directory -Force $sshDir | Out-Null
  if (-not (Test-Path $key)) {
    & ssh-keygen -t ed25519 -C "sugi-asayake-oci-$env:COMPUTERNAME" -f $key -N '""' -q
    Write-Host "SSH key created: $key"
  }
  if (-not (Test-Path $cfg) -or -not (Select-String -Path $cfg -Pattern "Host sugi-oci" -Quiet)) {
    @"

Host sugi-oci
  HostName $vmIp
  User ubuntu
  IdentityFile ~/.ssh/sugi-oci
  LocalForward 3307 ${dbIp}:3306
  ServerAliveInterval 30
  ExitOnForwardFailure yes
"@ | Add-Content $cfg
    Write-Host "~/.ssh/config: Host sugi-oci added"
  }
  & (Join-Path $PSScriptRoot "register-tunnel-task.ps1")
  Write-Host ""
  Write-Host "=== SEND THIS LINE TO CLAUDE (public key) ===" -ForegroundColor Cyan
  Get-Content "$key.pub"
  Write-Host "=============================================" -ForegroundColor Cyan
  Write-Host "Then run:  .\scripts\oci\setup-laptop.ps1 -Finish"
  exit 0
}

# --- Finish: the key is authorised on the VM now ---------------------------
Set-Location $root
& scp -o ClearAllForwardings=yes "sugi-oci:/tmp/cert2.pem" (Join-Path $root "oci-ca.pem")
if (-not (Test-Path (Join-Path $root "oci-ca.pem"))) {
  # /tmp is cleared on VM reboot; regenerate the CA from the live endpoint.
  $chain = & ssh -o ClearAllForwardings=yes sugi-oci "openssl s_client -connect ${dbIp}:3306 -starttls mysql -showcerts </dev/null 2>/dev/null"
  $certs = [regex]::Matches(($chain -join "`n"), "-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----")
  $certs[$certs.Count - 1].Value | Set-Content (Join-Path $root "oci-ca.pem")
}
Write-Host "oci-ca.pem written ($(Split-Path -Leaf $root))"
Start-ScheduledTask -TaskName "SUGI OCI Tunnel"
Start-Sleep -Seconds 5
$up = (Test-NetConnection 127.0.0.1 -Port 3307 -WarningAction SilentlyContinue).TcpTestSucceeded
Write-Host "tunnel port 3307 listening: $up"
Write-Host ""
Write-Host "Now copy these three lines from the OTHER laptop's .env into this .env" -ForegroundColor Cyan
Write-Host "(they hold the sugi_app / admin passwords -- never commit them):"
Write-Host "  DATABASE_URL=mysql://sugi_app:...@127.0.0.1:3307/defaultdb?ssl-mode=REQUIRED"
Write-Host "  DATABASE_ADMIN_URL=mysql://admin:...@127.0.0.1:3307/defaultdb?ssl-mode=REQUIRED"
Write-Host "  DATABASE_CA_CERT_PATH=./oci-ca.pem"
Write-Host "and comment out the old Aiven DATABASE_URL. Then: pnpm dev"
