<#
.SYNOPSIS
  Weekly dependency health check: security advisories (pnpm audit) plus
  available updates (pnpm outdated). Reports only -- it never installs
  anything, because a silent dependency bump can break the live site.

.DESCRIPTION
  Written after 2026-09-17, when GitHub Dependabot had piled up to 40 open
  alerts because nothing on either laptop ever looked at dependencies between
  sessions. This runs weekly, writes a report under logs/dependency-checks/,
  and raises a Windows toast when there is something to act on -- a log file
  alone would never be read.

  Fixing is still a manual step (usually: bump the direct dependency, or add a
  `pnpm.overrides` entry for a transitive one, then `pnpm check`, `pnpm lint`,
  `pnpm build` and the full test suite).

.EXAMPLE
  .\scripts\check-updates.ps1
  Runs one check now and prints the summary.

.EXAMPLE
  .\scripts\check-updates.ps1 -Install
  Registers the "SUGI ASAYAKE Weekly Dependency Check" scheduled task
  (Mondays 10:00, catches up if the laptop was off). Run once per laptop.
#>
param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [int]$RetentionCount = 12,
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$taskName = "SUGI ASAYAKE Weekly Dependency Check"

function Invoke-PnpmJson {
  <#
    pnpm writes a "[WARN] the pnpm field in package.json is no longer read"
    line to stderr (pnpm 11 wrapper delegating to the pinned 10.4.1), and both
    `audit` and `outdated` exit non-zero whenever they find something -- which
    is the normal case here. Under $ErrorActionPreference = "Stop" either one
    aborts the script, so route the call through cmd, drop stderr, and reset
    the exit code.
  #>
  param([string]$PnpmArgs)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    return (& cmd /c "pnpm $PnpmArgs 2>nul" | Out-String)
  } finally {
    $ErrorActionPreference = $previous
    $global:LASTEXITCODE = 0
  }
}

function Show-Toast {
  param([string]$Title, [string]$Message)
  # WinRT toast without any extra module. Any failure here is non-fatal: the
  # report file is still written, so the check itself never fails on the UI.
  try {
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
      [Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $texts = $template.GetElementsByTagName("text")
    $texts.Item(0).AppendChild($template.CreateTextNode($Title)) | Out-Null
    $texts.Item(1).AppendChild($template.CreateTextNode($Message)) | Out-Null
    $appId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show(
      [Windows.UI.Notifications.ToastNotification]::new($template)) | Out-Null
    return $true
  } catch {
    Write-Warning "Toast notification failed: $($_.Exception.Message)"
    return $false
  }
}

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed scheduled task: $taskName"
  } else {
    Write-Host "No such scheduled task: $taskName"
  }
  return
}

if ($Install) {
  $scriptPath = Join-Path $RepositoryRoot "scripts\check-updates.ps1"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
    -WorkingDirectory $RepositoryRoot
  $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 10:00
  # StartWhenAvailable: this laptop is not always on at 10:00 on a Monday, and
  # a check that silently never runs is worse than a late one.
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Description "Weekly pnpm audit + pnpm outdated report for the SUGI ASAYAKE repository." -Force | Out-Null
  Write-Host "Registered scheduled task: $taskName (Mondays 10:00)"
  Write-Host "Run now with: Start-ScheduledTask -TaskName `"$taskName`""
  return
}

Push-Location $RepositoryRoot
try {
  $logDir = Join-Path $RepositoryRoot "logs\dependency-checks"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
  $reportPath = Join-Path $logDir "$stamp.txt"
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("SUGI ASAYAKE dependency check -- $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
  $lines.Add("")

  # --- Security advisories -------------------------------------------------
  # pnpm audit exits non-zero when it finds anything, which is the normal case
  # here, so $LASTEXITCODE is deliberately not treated as a failure.
  $auditRaw = Invoke-PnpmJson "audit --json"
  $vulnCount = 0
  $criticalOrHigh = 0
  # 2026-09-23: a check that could not run is a finding, not "none". A registry or
  # network failure makes `pnpm audit --json` return an error object with no
  # `advisories`, which used to be logged as "none" with no toast.
  $checkFailures = 0
  $lines.Add("== Security advisories (pnpm audit)")
  try {
    $audit = $auditRaw | ConvertFrom-Json
    if ($null -eq $audit -or ($null -eq $audit.PSObject.Properties['advisories'] -and $null -eq $audit.PSObject.Properties['metadata'])) {
      throw "pnpm audit returned no advisories/metadata (registry or network error?): $([string]$auditRaw | Select-Object -First 1)"
    }
    $advisories = @()
    if ($audit.advisories) { $advisories = $audit.advisories.PSObject.Properties | ForEach-Object { $_.Value } }
    $vulnCount = $advisories.Count
    if ($vulnCount -eq 0) {
      $lines.Add("  none")
    } else {
      $rank = @{ critical = 0; high = 1; moderate = 2; low = 3 }
      foreach ($a in ($advisories | Sort-Object { $rank[$_.severity] })) {
        if ($a.severity -in @("critical", "high")) { $criticalOrHigh++ }
        $lines.Add(("  {0,-9} {1,-28} installed-range:{2}  fixed-in:{3}" -f `
          $a.severity.ToUpper(), $a.module_name, $a.vulnerable_versions, $a.patched_versions))
      }
    }
  } catch {
    $lines.Add("  AUDIT DID NOT RUN: $($_.Exception.Message)")
    $checkFailures++
  }
  $lines.Add("")

  # --- Available updates ---------------------------------------------------
  # Direct dependencies only; transitive ones are pinned through
  # pnpm.overrides in package.json and are covered by the audit section above.
  $lines.Add("== Outdated direct dependencies (pnpm outdated)")
  $outdatedRaw = Invoke-PnpmJson "outdated --json"
  $majorJumps = 0
  try {
    $outdated = $outdatedRaw | ConvertFrom-Json
    $props = @()
    if ($outdated) { $props = $outdated.PSObject.Properties }
    if ($props.Count -eq 0) {
      $lines.Add("  none")
    } else {
      foreach ($p in $props) {
        $current = $p.Value.current
        $latest = $p.Value.latest
        $isMajor = $false
        # 0.x: a minor bump is breaking under semver (0.5 -> 0.6), so compare major+minor.
        try {
          $c = $current -split '\.'; $l = $latest -split '\.'
          $isMajor = ($c[0] -ne $l[0]) -or ($c[0] -eq '0' -and $c[1] -ne $l[1])
        } catch { }
        if ($isMajor) { $majorJumps++ }
        $lines.Add(("  {0,-34} {1,-12} -> {2,-12}{3}" -f $p.Name, $current, $latest, $(if ($isMajor) { "  (MAJOR -- needs a decision)" } else { "" })))
      }
    }
  } catch {
    $lines.Add("  OUTDATED CHECK DID NOT RUN: $($_.Exception.Message)")
    $checkFailures++
  }

  # --- Are the overrides still being honoured? -----------------------------
  # pnpm 10.4.1 applies package.json's "pnpm.overrides" while already printing
  # that the key is "no longer read"; a newer pinned pnpm would drop them
  # silently and every pinned transitive version would slide back. The lockfile
  # records what was actually applied, so compare the two.
  $lines.Add("")
  $lines.Add("== Override health (package.json vs pnpm-lock.yaml)")
  $overridesIgnored = 0
  try {
    $declared = (Get-Content (Join-Path $RepositoryRoot "package.json") -Raw | ConvertFrom-Json).pnpm.overrides
    $declaredNames = @()
    if ($declared) { $declaredNames = $declared.PSObject.Properties | ForEach-Object { $_.Name } }
    $lockText = Get-Content (Join-Path $RepositoryRoot "pnpm-lock.yaml") -Raw
    $lockOverrides = ""
    if ($lockText -match "(?ms)^overrides:\r?\n(.*?)(?=^\S)") { $lockOverrides = $Matches[1] }
    $missing = @($declaredNames | Where-Object { $lockOverrides -notmatch [regex]::Escape($_) })
    $overridesIgnored = $missing.Count
    if ($declaredNames.Count -eq 0) {
      $lines.Add("  no overrides declared")
    } elseif ($overridesIgnored -eq 0) {
      $lines.Add("  all $($declaredNames.Count) overrides present in the lockfile")
    } else {
      $lines.Add("  WARNING: $overridesIgnored declared override(s) missing from the lockfile --")
      $lines.Add("  the pinned pnpm version may have stopped reading package.json's pnpm key:")
      foreach ($m in $missing) { $lines.Add("    $m") }
    }
  } catch {
    $lines.Add("  could not compare overrides: $($_.Exception.Message)")
  }

  $lines.Add("")
  $lines.Add("Fixing: bump the direct dependency, or add a pnpm.overrides entry for a")
  $lines.Add("transitive one, then pnpm check + pnpm lint + pnpm build + the full suite")
  $lines.Add("(pnpm exec vitest run --no-file-parallelism).")

  $report = $lines -join [Environment]::NewLine
  Set-Content -Path $reportPath -Value $report -Encoding UTF8

  Get-ChildItem $logDir -Filter "*.txt" | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $RetentionCount | Remove-Item -Force -ErrorAction SilentlyContinue

  if (-not $Quiet) { Write-Host $report }
  Write-Host ""
  Write-Host "Report: $reportPath"

  if ($vulnCount -gt 0 -or $majorJumps -gt 0 -or $overridesIgnored -gt 0 -or $checkFailures -gt 0) {
    $title = if ($checkFailures -gt 0) { "SUGI ASAYAKE: dependency check could not run ($checkFailures part(s))" }
             elseif ($overridesIgnored -gt 0) { "SUGI ASAYAKE: $overridesIgnored pinned override(s) no longer applied" }
             elseif ($criticalOrHigh -gt 0) { "SUGI ASAYAKE: $criticalOrHigh critical/high advisories" }
             elseif ($vulnCount -gt 0) { "SUGI ASAYAKE: $vulnCount dependency advisories" }
             else { "SUGI ASAYAKE: $majorJumps major dependency updates" }
    Show-Toast -Title $title -Message "$vulnCount advisories, $majorJumps major updates. See logs\dependency-checks\$stamp.txt" | Out-Null
  }
} finally {
  Pop-Location
}
