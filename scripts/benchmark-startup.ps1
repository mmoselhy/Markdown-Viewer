param(
  [string]$Command = "npx electron . --perf-exit",
  [string]$ExecutablePath = "",
  [string[]]$ExecutableArgs = @("--perf-exit"),
  [int]$Runs = 8,
  [switch]$DisableGpu
)

$ErrorActionPreference = "Stop"

if ($Runs -lt 1) {
  throw "Runs must be >= 1"
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$env:MDREADER_DISABLE_GPU = if ($DisableGpu) { "1" } else { "0" }

function Get-Percentile([double[]]$values, [double]$percent) {
  if (!$values -or $values.Count -eq 0) {
    return $null
  }
  $sorted = $values | Sort-Object
  $rank = [Math]::Ceiling(($percent / 100.0) * $sorted.Count)
  if ($rank -lt 1) {
    $rank = 1
  }
  return [Math]::Round([double]$sorted[$rank - 1], 1)
}

function Add-PerfEventsFromLines([string[]]$lines, [hashtable]$eventByName) {
  foreach ($line in $lines) {
    $jsonText = $null
    if ($line -match "^\[perf\]\s+(?<json>\{.+\})$") {
      $jsonText = $Matches["json"]
    } elseif ($line -match "^\{.+\}$") {
      $jsonText = $line
    }

    if (!$jsonText) {
      continue
    }

    try {
      $event = $jsonText | ConvertFrom-Json
      if ($event.name -and $event.ms -ne $null) {
        $eventByName[$event.name] = [double]$event.ms
      }
    } catch {
      continue
    }
  }
}

$targets = @(
  "app-ready",
  "window-shown",
  "dom-ready",
  "renderer:interactive-ready"
)

$budgetsMs = @{
  "renderer:interactive-ready" = @{
    p50 = 1000
    p95 = 1300
  }
}

$samples = @{}
foreach ($target in $targets) {
  $samples[$target] = New-Object System.Collections.Generic.List[double]
}

$resolvedExecutablePath = $null
if ($ExecutablePath) {
  $resolvedExecutablePath = if ([System.IO.Path]::IsPathRooted($ExecutablePath)) {
    $ExecutablePath
  } else {
    Join-Path $projectRoot $ExecutablePath
  }

  if (!(Test-Path $resolvedExecutablePath)) {
    throw "ExecutablePath not found: $resolvedExecutablePath"
  }
}

$missingEventRuns = 0

for ($i = 1; $i -le $Runs; $i++) {
  $stdoutPath = Join-Path $env:TEMP ("mdreader-perf-{0}-{1}.out" -f $PID, $i)
  $stderrPath = Join-Path $env:TEMP ("mdreader-perf-{0}-{1}.err" -f $PID, $i)
  $perfPath = Join-Path $env:TEMP ("mdreader-perf-{0}-{1}.jsonl" -f $PID, $i)
  if (Test-Path $stdoutPath) { Remove-Item $stdoutPath -Force }
  if (Test-Path $stderrPath) { Remove-Item $stderrPath -Force }
  if (Test-Path $perfPath) { Remove-Item $perfPath -Force }

  Write-Host ("Run {0}/{1}  GPU disabled: {2}" -f $i, $Runs, $DisableGpu.IsPresent)

  $env:MDREADER_PERF_FILE = $perfPath
  if ($resolvedExecutablePath) {
    $proc = Start-Process `
      -FilePath $resolvedExecutablePath `
      -ArgumentList $ExecutableArgs `
      -WorkingDirectory $projectRoot `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -Wait `
      -PassThru
  } else {
    $proc = Start-Process `
      -FilePath "cmd.exe" `
      -ArgumentList @("/d", "/s", "/c", $Command) `
      -WorkingDirectory $projectRoot `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -Wait `
      -PassThru
  }
  Remove-Item Env:\MDREADER_PERF_FILE -ErrorAction SilentlyContinue

  if ($proc.ExitCode -ne 0) {
    Write-Warning ("Run {0} exited with code {1}" -f $i, $proc.ExitCode)
  }

  $eventByName = @{}
  if (Test-Path $perfPath) {
    Add-PerfEventsFromLines (Get-Content $perfPath) $eventByName
  }
  if (Test-Path $stdoutPath) {
    Add-PerfEventsFromLines (Get-Content $stdoutPath) $eventByName
  }

  $missingAny = $false
  foreach ($target in $targets) {
    if ($eventByName.ContainsKey($target)) {
      $samples[$target].Add($eventByName[$target])
    } else {
      $missingAny = $true
    }
  }

  if ($missingAny) {
    $missingEventRuns++
    Write-Warning ("Run {0} missing one or more target perf events." -f $i)
  }
}

Write-Host ""
Write-Host "Startup benchmark summary"
if ($resolvedExecutablePath) {
  Write-Host ("ExecutablePath: {0}" -f $resolvedExecutablePath)
  Write-Host ("ExecutableArgs: {0}" -f ($ExecutableArgs -join " "))
} else {
  Write-Host ("Command: {0}" -f $Command)
}
Write-Host ("Runs: {0}" -f $Runs)
Write-Host ("MDREADER_DISABLE_GPU: {0}" -f $env:MDREADER_DISABLE_GPU)

foreach ($target in $targets) {
  $values = [double[]]$samples[$target]
  if (!$values -or $values.Count -eq 0) {
    Write-Host ("- {0}: no data" -f $target)
    continue
  }
  $p50 = Get-Percentile $values 50
  $p95 = Get-Percentile $values 95
  $min = [Math]::Round((($values | Measure-Object -Minimum).Minimum), 1)
  $max = [Math]::Round((($values | Measure-Object -Maximum).Maximum), 1)
  Write-Host ("- {0}: p50={1}ms p95={2}ms min={3}ms max={4}ms n={5}" -f $target, $p50, $p95, $min, $max, $values.Count)

  if ($budgetsMs.ContainsKey($target)) {
    $budget = $budgetsMs[$target]
    if ($p50 -gt $budget.p50) {
      Write-Warning ("Budget exceeded for {0}: p50 {1}ms > {2}ms" -f $target, $p50, $budget.p50)
    }
    if ($p95 -gt $budget.p95) {
      Write-Warning ("Budget exceeded for {0}: p95 {1}ms > {2}ms" -f $target, $p95, $budget.p95)
    }
  }
}

if ($missingEventRuns -gt 0) {
  Write-Warning ("{0} run(s) were missing one or more target events." -f $missingEventRuns)
}
