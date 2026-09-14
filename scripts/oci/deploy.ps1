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
          .\scripts\oci\deploy.ps1 -Staging (2026-09-14: the second pm2 app
          "sugi-staging" in ~/sugi-asayake-staging on port 3001, its own
          .env pointing at the sugi_staging schema, reached at
          https://sugi-staging.karkaron.com once the DNS record exists)
#>
param([switch]$Staging)
$ErrorActionPreference = "Stop"
$app = if ($Staging) { "sugi-staging" } else { "sugi" }
$dir = if ($Staging) { "sugi-asayake-staging" } else { "sugi-asayake" }
$port = if ($Staging) { 3001 } else { 3000 }
$publicHost = if ($Staging) { "sugi-staging.karkaron.com" } else { "sugi.karkaron.com" }
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
scp -q -o ClearAllForwardings=yes $bundle "sugi-oci:~/$bundle"
Remove-Item $bundle

Write-Host "==> install + restart on the VM" -ForegroundColor Cyan
$remote = @'
set -e
cd ~/__DIR__
old=$(md5sum pnpm-lock.yaml | cut -c1-32)
rm -rf dist.new && mkdir dist.new && tar xzf ~/__BUNDLE__ -C dist.new && rm ~/__BUNDLE__
rm -rf dist && mv dist.new/dist dist && mv -f dist.new/package.json dist.new/pnpm-lock.yaml dist.new/pnpm-workspace.yaml . && rm -rf dist.new
new=$(md5sum pnpm-lock.yaml | cut -c1-32)
if [ "$old" != "$new" ]; then echo "lockfile changed -> pnpm install --prod"; pnpm install --prod --frozen-lockfile 2>&1 | tail -2; fi
# `pm2 restart` only knows an app that has been started once; staging is
# started here on first deploy (production was started by hand on 2026-09-13).
if pm2 describe __APP__ >/dev/null 2>&1; then pm2 restart __APP__ --update-env >/dev/null; else PORT=__PORT__ pm2 start dist/index.js --name __APP__ --max-memory-restart 700M >/dev/null && pm2 save >/dev/null; fi
sleep 8
curl -s --max-time 20 http://localhost:__PORT__/health; echo
pm2 status __APP__ | grep __APP__ | cut -c1-100
'@
$remote = $remote.Replace("__BUNDLE__", $bundle).Replace("__DIR__", $dir).Replace("__APP__", $app).Replace("__PORT__", "$port").Replace("`r`n", "`n")  # CRLF checkout -> LF for the remote bash
# Sent over stdin, not as an argument: passed as an argument the script is
# re-split by the remote shell and its quotes are lost ("[: missing ]").
# tr strips the CR that PowerShell appends to every line when it pipes a
# string into a native process (that was the "cut: invalid ... '\r'" noise).
$remote | ssh -o ClearAllForwardings=yes sugi-oci "tr -d '\r' | bash -s"

Write-Host "==> public check" -ForegroundColor Cyan
# pm2 has restarted the app by now, but it needs ~10 s to boot (TensorFlow,
# the DB handshake) and Cloudflare answers 502 until then -- which is exactly
# where the first two deploys "failed" after a successful restart. Retry.
$code = 0
foreach ($attempt in 1..18) {
  try { $code = (Invoke-WebRequest -Uri "https://$publicHost/health" -UseBasicParsing -TimeoutSec 15).StatusCode } catch { $code = 0 }
  if ($code -eq 200) { break }
  Start-Sleep -Seconds 5
}
Write-Host "https://$publicHost/health -> $code (after $attempt attempt(s))"
if ($code -ne 200 -and $Staging) { Write-Host "(staging is not reachable publicly yet -- add the DNS CNAME sugi-staging -> bbd3128e-486e-481d-8c21-f9d3d240a56c.cfargotunnel.com in Cloudflare; the VM-local health above is what counts)" -ForegroundColor Yellow }
elseif ($code -ne 200) { throw "The site did not come back within 90 s -- check: ssh sugi-oci 'pm2 logs $app --lines 40'" }
