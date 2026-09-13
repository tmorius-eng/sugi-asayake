<#
.SYNOPSIS
  Deploy the current checkout to the Oracle VM (2026-09-13).

.DESCRIPTION
  The VM cannot clone the private GitHub repo and has 1 GB of RAM, so the
  build happens HERE and only the result travels:
    1. pnpm build                       (dist/ = server bundle + client assets)
    2. tar dist + package.json + lockfile -> scp to the VM
    3. on the VM: unpack, `pnpm install --prod --frozen-lockfile` (only when
       the lockfile changed), `pm2 restart sugi`, health check.
  .env and oci-ca.pem on the VM are NOT touched -- edit them there by hand
  (ssh sugi-oci; ~/sugi-asayake/.env).

  Usage:  .\scripts\oci\deploy.ps1          (from the repo root, any laptop
          with ~/.ssh/config Host sugi-oci)
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

Write-Host "==> build" -ForegroundColor Cyan
pnpm build | Out-Null
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host "==> upload" -ForegroundColor Cyan
$bundle = "deploy-$(Get-Date -Format yyyyMMdd-HHmmss).tgz"
tar czf $bundle dist package.json pnpm-lock.yaml pnpm-workspace.yaml
# ClearAllForwardings: the Host block carries the 3307 tunnel forward, which
# the always-on tunnel task already holds -- without this, ssh aborts with
# "Address already in use" before running anything (ExitOnForwardFailure).
scp -q -o ClearAllForwardings=yes $bundle "sugi-oci:~/__BUNDLE__"
Remove-Item $bundle

Write-Host "==> install + restart on the VM" -ForegroundColor Cyan
$remote = @'
set -e
cd ~/sugi-asayake
old=$(md5sum pnpm-lock.yaml | cut -c1-32)
rm -rf dist.new && mkdir dist.new && tar xzf ~/__BUNDLE__ -C dist.new && rm ~/__BUNDLE__
rm -rf dist && mv dist.new/dist dist && mv -f dist.new/package.json dist.new/pnpm-lock.yaml dist.new/pnpm-workspace.yaml . && rm -rf dist.new
new=$(md5sum pnpm-lock.yaml | cut -c1-32)
if [ "$old" != "$new" ]; then echo "lockfile changed -> pnpm install --prod"; pnpm install --prod --frozen-lockfile 2>&1 | tail -2; fi
pm2 restart sugi --update-env >/dev/null
sleep 8
curl -s --max-time 20 http://localhost:3000/health; echo
pm2 status sugi | grep sugi | cut -c1-100
'@
$remote = $remote.Replace("__BUNDLE__", $bundle)
# Sent over stdin, not as an argument: passed as an argument the script is
# re-split by the remote shell and its quotes are lost ("[: missing ]").
$remote | ssh -o ClearAllForwardings=yes sugi-oci "bash -s"

Write-Host "==> public check" -ForegroundColor Cyan
$code = (Invoke-WebRequest -Uri "https://sugi.karkaron.com/health" -UseBasicParsing -TimeoutSec 40).StatusCode
Write-Host "https://sugi.karkaron.com/health -> $code"
