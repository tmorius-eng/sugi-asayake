<#
.SYNOPSIS
  Run the site the way it will run in production, and (optionally) open a
  public HTTPS tunnel so phones on ANY network can test it -- including
  /admin's face check, which needs HTTPS for the camera.

.DESCRIPTION
  2026-09-12: Tom is demoing to his colleagues over the office Wi-Fi.
  A LAN address (http://192.168.x.x:3000) has three problems there:
  office Wi-Fi often isolates devices from each other, phones treat plain
  http as insecure (no camera, some APIs missing), and everybody must be
  on the same network. A Cloudflare quick tunnel gives a temporary
  https://<random>.trycloudflare.com URL that works from anywhere, no
  account needed. The server's own protections stay on: face gate, rate
  limits, CSRF, the scanner blocker (it works behind the tunnel because
  `trust proxy` is set and the protocol/host are forwarded).

  This runs the PRODUCTION build (compiled, compressed, strict CSP), not
  `pnpm dev` -- what a buyer should see.

.PARAMETER Tunnel
  Also start a Cloudflare quick tunnel and print the public URL.

.PARAMETER SkipBuild
  Reuse the last build in dist/ instead of rebuilding.

.EXAMPLE
  .\scripts\demo.ps1                 # production server on http://localhost:3000 (+ LAN IP)
  .\scripts\demo.ps1 -Tunnel         # ...and a public https URL for phones on any network

.NOTES
  - Orders placed during the demo land in the REAL Aiven database. Use
    "Бэлнээр (хүргэлтэд)" and cancel them from /admin afterwards, or run
    scripts/test-residue-report.ts to find them.
  - Stop with Ctrl+C in this window; the tunnel closes with it and the
    URL stops working for everyone.
  - Do not leave the tunnel running unattended.
#>
param(
  [switch]$Tunnel,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path ".env")) { throw ".env is missing -- the server needs DATABASE_URL and friends." }

if (-not $SkipBuild) {
  Write-Host "== Building production bundle (vite + esbuild)..." -ForegroundColor Cyan
  pnpm build
  if ($LASTEXITCODE -ne 0) { throw "Build failed." }
}

$env:NODE_ENV = "production"
$env:LOG_REQUESTS = "1"     # an access-log line per request in this window
if (-not $env:PORT) { $env:PORT = "3000" }

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like "Wi-Fi*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
Write-Host "== Starting production server on port $env:PORT" -ForegroundColor Cyan
Write-Host "   local:  http://localhost:$env:PORT"
if ($lanIp) { Write-Host "   LAN:    http://${lanIp}:$env:PORT   (same Wi-Fi only; camera/face check will NOT work over plain http)" }

$server = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -NoNewWindow -PassThru

try {
  if ($Tunnel) {
    $cf = Get-Command cloudflared -ErrorAction SilentlyContinue
    if (-not $cf) { $candidate = "$env:ProgramFiles\cloudflared\cloudflared.exe"; if (Test-Path $candidate) { $cf = $candidate } }
    if (-not $cf) { throw "cloudflared is not installed. Run: winget install --id Cloudflare.cloudflared" }
    Write-Host "== Opening a Cloudflare quick tunnel to http://localhost:$env:PORT ..." -ForegroundColor Cyan
    Write-Host "   The public https URL is printed by cloudflared below (look for trycloudflare.com)." -ForegroundColor Yellow
    Write-Host "   Give THAT URL to colleagues; it works on any network and supports the camera." -ForegroundColor Yellow
    & $cf tunnel --url "http://localhost:$env:PORT"
  } else {
    Write-Host "== Server running. Ctrl+C to stop. (Add -Tunnel for a public https URL.)" -ForegroundColor Green
    Wait-Process -Id $server.Id
  }
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  Write-Host "== Stopped." -ForegroundColor Cyan
}
