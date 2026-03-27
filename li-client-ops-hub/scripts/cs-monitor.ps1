# ============================================================
# Client Ops Hub — Production Monitor
# Usage:
#   .\scripts\cs-monitor.ps1              → Live dev with color + logging
#   .\scripts\cs-monitor.ps1 -ErrorsOnly  → Watch log for errors only
#   .\scripts\cs-monitor.ps1 -Summary     → Print summary of today's log
#   .\scripts\cs-monitor.ps1 -Tail 50     → Show last 50 lines of log
# ============================================================

param(
    [switch]$ErrorsOnly,
    [switch]$Summary,
    [int]$Tail = 0,
    [string]$LogDir = "$HOME\cs-logs"
)

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    Write-Host "Created log directory: $LogDir" -ForegroundColor Gray
}

$LogFile = Join-Path $LogDir "ops-hub-$(Get-Date -Format 'yyyy-MM-dd').log"

# ── Color Line Helper ────────────────────────────────────────
function Write-ColorLine {
    param([string]$Line)

    if ($Line -match "\[Error\]|ERROR|Failed|exception|Database IO") {
        Write-Host $Line -ForegroundColor Red
    }
    elseif ($Line -match "\[Warn\]|WARN|warning|retry") {
        Write-Host $Line -ForegroundColor DarkYellow
    }
    elseif ($Line -match "Completed|SUCCESS|finished|complete") {
        Write-Host $Line -ForegroundColor Green
    }
    elseif ($Line -match "\[Scheduler\]") {
        Write-Host $Line -ForegroundColor Yellow
    }
    elseif ($Line -match "\[Queue\]") {
        Write-Host $Line -ForegroundColor Cyan
    }
    elseif ($Line -match "\[Perf\]") {
        Write-Host $Line -ForegroundColor Magenta
    }
    elseif ($Line -match "\[Auth\]") {
        Write-Host $Line -ForegroundColor DarkCyan
    }
    elseif ($Line -match "\[Sync\]") {
        Write-Host $Line -ForegroundColor Blue
    }
    elseif ($Line -match "\[Cloud\]") {
        Write-Host $Line -ForegroundColor DarkBlue
    }
    elseif ($Line -match "\[Kinsta\]") {
        Write-Host $Line -ForegroundColor DarkMagenta
    }
    elseif ($Line -match "\[D1\]") {
        Write-Host $Line -ForegroundColor DarkGray
    }
    elseif ($Line -match "\[Notify\]") {
        Write-Host $Line -ForegroundColor White
    }
    elseif ($Line -match "\[Report\]") {
        Write-Host $Line -ForegroundColor White
    }
    elseif ($Line -match "\[Recovery\]") {
        Write-Host $Line -ForegroundColor DarkYellow
    }
    elseif ($Line -match "\[Startup\]|\[Shutdown\]") {
        Write-Host $Line -ForegroundColor Yellow
    }
    elseif ($Line -match "\[API\]") {
        Write-Host $Line -ForegroundColor White
    }
    else {
        Write-Host $Line -ForegroundColor Gray
    }
}

# ── Summary Mode ─────────────────────────────────────────────
if ($Summary) {
    if (-not (Test-Path $LogFile)) {
        Write-Host "No log file found for today." -ForegroundColor Yellow
        exit
    }

    $log = Get-Content $LogFile
    $total         = $log.Count
    $errors        = ($log | Select-String "\[Error\]" -AllMatches).Count
    $warnings      = ($log | Select-String "\[Warn\]" -AllMatches).Count
    $queueStart    = ($log | Select-String "\[Queue\].*Processing").Count
    $queueDone     = ($log | Select-String "\[Queue\].*Completed").Count
    $queueFail     = ($log | Select-String "\[Error\].*\[Queue\]").Count
    $scheduler     = ($log | Select-String "\[Scheduler\]").Count
    $dbErrors      = ($log | Select-String "\[Error\].*\[D1\]").Count
    $authFailures  = ($log | Select-String "\[Error\].*\[Auth\]").Count
    $cloudSync     = ($log | Select-String "\[Cloud\].*complete").Count
    $kinsta        = ($log | Select-String "\[Kinsta\]").Count
    $perfLines     = $log | Select-String "\[Perf\]"

    # Extract timing data
    $durations = @()
    foreach ($p in $perfLines) {
        if ($p -match 'elapsed_ms=(\d+)') {
            $durations += [int]$Matches[1]
        }
    }
    $avgDuration = if ($durations.Count -gt 0) {
        [math]::Round(($durations | Measure-Object -Average).Average)
    } else { 'N/A' }
    $maxDuration = if ($durations.Count -gt 0) {
        ($durations | Measure-Object -Maximum).Maximum
    } else { 'N/A' }

    Write-Host ""
    Write-Host "  +============================================+" -ForegroundColor White
    Write-Host "  |  Client Ops Hub — Daily Summary            |" -ForegroundColor White
    Write-Host "  +============================================+" -ForegroundColor White
    Write-Host ""
    Write-Host "  Log file:        $LogFile" -ForegroundColor Gray
    Write-Host "  Total lines:     $total" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  --- Events ---" -ForegroundColor White
    Write-Host "  Scheduler ticks:     $scheduler" -ForegroundColor Yellow
    Write-Host "  Queue started:       $queueStart" -ForegroundColor Cyan
    Write-Host "  Queue completed:     $queueDone" -ForegroundColor Green
    Write-Host "  Queue failed:        $queueFail" -ForegroundColor $(if ($queueFail -gt 0) {'Red'} else {'Green'})
    Write-Host "  Cloud syncs:         $cloudSync" -ForegroundColor Blue
    Write-Host "  Kinsta events:       $kinsta" -ForegroundColor DarkMagenta
    Write-Host ""
    Write-Host "  --- Errors ---" -ForegroundColor White
    Write-Host "  Total errors:        $errors" -ForegroundColor $(if ($errors -gt 0) {'Red'} else {'Green'})
    Write-Host "  Warnings:            $warnings" -ForegroundColor $(if ($warnings -gt 0) {'DarkYellow'} else {'Green'})
    Write-Host "  DB errors:           $dbErrors" -ForegroundColor $(if ($dbErrors -gt 0) {'Red'} else {'Green'})
    Write-Host "  Auth failures:       $authFailures" -ForegroundColor $(if ($authFailures -gt 0) {'Red'} else {'Green'})
    Write-Host ""
    Write-Host "  --- Performance ---" -ForegroundColor White
    Write-Host "  Timed operations:    $($durations.Count)" -ForegroundColor Magenta
    Write-Host "  Avg duration (ms):   $avgDuration" -ForegroundColor Magenta
    Write-Host "  Max duration (ms):   $maxDuration" -ForegroundColor Magenta
    Write-Host ""

    if ($errors -gt 0) {
        Write-Host "  --- Last 10 Errors ---" -ForegroundColor Red
        $log | Select-String "\[Error\]" | Select-Object -Last 10 | ForEach-Object {
            Write-Host "  $_" -ForegroundColor Red
        }
        Write-Host ""
    }

    # Queue completion rate
    if ($queueStart -gt 0) {
        $rate = [math]::Round(($queueDone / $queueStart) * 100, 1)
        $rateColor = if ($rate -ge 95) {'Green'} elseif ($rate -ge 80) {'Yellow'} else {'Red'}
        Write-Host "  Queue success rate:  $rate%" -ForegroundColor $rateColor
        Write-Host ""
    }

    exit
}

# ── Tail Mode ────────────────────────────────────────────────
if ($Tail -gt 0) {
    if (-not (Test-Path $LogFile)) {
        Write-Host "No log file found for today." -ForegroundColor Yellow
        exit
    }
    Get-Content $LogFile | Select-Object -Last $Tail | ForEach-Object {
        Write-ColorLine $_
    }
    exit
}

# ── Errors-Only Watch Mode ───────────────────────────────────
if ($ErrorsOnly) {
    if (-not (Test-Path $LogFile)) {
        Write-Host "Waiting for log file: $LogFile" -ForegroundColor Yellow
        while (-not (Test-Path $LogFile)) { Start-Sleep -Seconds 2 }
    }

    Write-Host ""
    Write-Host "  Watching for errors: $LogFile" -ForegroundColor Red
    Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
    Write-Host ""

    Get-Content $LogFile -Wait | ForEach-Object {
        if ($_ -match "\[Error\]|Failed|exception|\[Warn\]") {
            $ts = Get-Date -Format "HH:mm:ss"
            $color = if ($_ -match "\[Error\]|Failed|exception") { 'Red' } else { 'DarkYellow' }
            Write-Host "[$ts] $_" -ForegroundColor $color
        }
    }
    exit
}

# ── Live Dev + Log Mode (Default) ───────────────────────────
Write-Host ""
Write-Host "  +============================================+" -ForegroundColor White
Write-Host "  |  Client Ops Hub — Monitor                  |" -ForegroundColor White
Write-Host "  +============================================+" -ForegroundColor White
Write-Host ""
Write-Host "  Logging:   $LogFile" -ForegroundColor Gray
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""
Write-Host "  Second terminal commands:" -ForegroundColor DarkGray
Write-Host "    .\scripts\cs-monitor.ps1 -ErrorsOnly   # errors only" -ForegroundColor DarkGray
Write-Host "    .\scripts\cs-monitor.ps1 -Summary       # daily summary" -ForegroundColor DarkGray
Write-Host "    .\scripts\cs-monitor.ps1 -Tail 100      # last 100 lines" -ForegroundColor DarkGray
Write-Host ""

# Run the Electron dev process and pipe output through color formatter + file logger
$ScriptDir = Split-Path -Parent $PSScriptRoot
Push-Location $ScriptDir

npm run dev 2>&1 | ForEach-Object {
    $line = $_.ToString()

    # Timestamp and log to file
    $stamped = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $line"
    Add-Content -Path $LogFile -Value $stamped

    # Color output to terminal
    Write-ColorLine $line
}

Pop-Location
