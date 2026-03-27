# ============================================================
# Client Ops Hub — Deploy + Monitor
# Usage:
#   .\scripts\deploy.ps1           → Build, package, and start monitor
#   .\scripts\deploy.ps1 -SkipBuild  → Skip build, just start monitor
# ============================================================

param(
    [switch]$SkipBuild
)

$ScriptDir = Split-Path -Parent $PSScriptRoot
Push-Location $ScriptDir

if (-not $SkipBuild) {
    Write-Host "`n  Building Client Ops Hub...`n" -ForegroundColor Yellow

    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n  Build FAILED!" -ForegroundColor Red
        Pop-Location
        exit 1
    }

    Write-Host "`n  Build successful. Starting monitor...`n" -ForegroundColor Green
    Start-Sleep -Seconds 2
}

# Auto-start monitor
& "$PSScriptRoot\cs-monitor.ps1"

Pop-Location
