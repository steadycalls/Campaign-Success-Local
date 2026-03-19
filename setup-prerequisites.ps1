# ============================================================================
# Client Ops Hub — Prerequisite Checker & Installer
# Run in PowerShell as Administrator
# ============================================================================

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Client Ops Hub — Environment Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$issues = @()
$installed = @()

# ----------------------------------------------------------------------------
# 1. NODE.JS 20+
# ----------------------------------------------------------------------------
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow

$nodeVersion = $null
try {
    $nodeOutput = & node --version 2>$null
    if ($nodeOutput -match 'v(\d+)\.') {
        $nodeMajor = [int]$Matches[1]
        $nodeVersion = $nodeOutput.Trim()
    }
} catch {}

if ($nodeVersion -and $nodeMajor -ge 20) {
    Write-Host "  ✅ Node.js $nodeVersion (meets v20+ requirement)" -ForegroundColor Green
} elseif ($nodeVersion) {
    Write-Host "  ⚠️  Node.js $nodeVersion found but v20+ required. Upgrading..." -ForegroundColor Red
    Write-Host "  Installing Node.js LTS via winget..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --force
    $installed += "Node.js LTS (upgraded)"
} else {
    Write-Host "  ❌ Node.js not found. Installing..." -ForegroundColor Red
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $installed += "Node.js LTS"
}

# ----------------------------------------------------------------------------
# 2. NPM (comes with Node, but verify)
# ----------------------------------------------------------------------------
Write-Host "[2/5] Checking npm..." -ForegroundColor Yellow

$npmVersion = $null
try {
    $npmVersion = & npm --version 2>$null
} catch {}

if ($npmVersion) {
    Write-Host "  ✅ npm v$($npmVersion.Trim())" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  npm not found — will be available after Node.js install + terminal restart" -ForegroundColor Red
    $issues += "Restart terminal after Node.js install to get npm"
}

# ----------------------------------------------------------------------------
# 3. GIT
# ----------------------------------------------------------------------------
Write-Host "[3/5] Checking Git..." -ForegroundColor Yellow

$gitVersion = $null
try {
    $gitOutput = & git --version 2>$null
    if ($gitOutput -match 'git version (.+)') {
        $gitVersion = $Matches[1].Trim()
    }
} catch {}

if ($gitVersion) {
    Write-Host "  ✅ Git $gitVersion" -ForegroundColor Green
} else {
    Write-Host "  ❌ Git not found. Installing..." -ForegroundColor Red
    winget install Git.Git --accept-source-agreements --accept-package-agreements
    $installed += "Git"
}

# ----------------------------------------------------------------------------
# 4. PYTHON 3.11+ (needed for better-sqlite3 native build)
# ----------------------------------------------------------------------------
Write-Host "[4/5] Checking Python..." -ForegroundColor Yellow

$pythonVersion = $null
$pythonMajor = 0
$pythonMinor = 0
try {
    $pythonOutput = & python --version 2>$null
    if ($pythonOutput -match 'Python (\d+)\.(\d+)') {
        $pythonMajor = [int]$Matches[1]
        $pythonMinor = [int]$Matches[2]
        $pythonVersion = $pythonOutput.Trim()
    }
} catch {}

if (-not $pythonVersion) {
    # Try python3 alias
    try {
        $pythonOutput = & python3 --version 2>$null
        if ($pythonOutput -match 'Python (\d+)\.(\d+)') {
            $pythonMajor = [int]$Matches[1]
            $pythonMinor = [int]$Matches[2]
            $pythonVersion = $pythonOutput.Trim()
        }
    } catch {}
}

if ($pythonVersion -and $pythonMajor -ge 3 -and $pythonMinor -ge 11) {
    Write-Host "  ✅ $pythonVersion (meets 3.11+ requirement)" -ForegroundColor Green
} elseif ($pythonVersion) {
    Write-Host "  ⚠️  $pythonVersion found but 3.11+ required. Installing..." -ForegroundColor Red
    winget install Python.Python.3.11 --accept-source-agreements --accept-package-agreements
    $installed += "Python 3.11 (upgraded)"
} else {
    Write-Host "  ❌ Python not found. Installing..." -ForegroundColor Red
    winget install Python.Python.3.11 --accept-source-agreements --accept-package-agreements
    $installed += "Python 3.11"
}

# ----------------------------------------------------------------------------
# 5. C++ BUILD TOOLS (needed for native Node modules like better-sqlite3)
# ----------------------------------------------------------------------------
Write-Host "[5/5] Checking C++ Build Tools..." -ForegroundColor Yellow

$hasBuildTools = $false

# Check for Visual Studio Build Tools or full Visual Studio
$vsWherePath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vsWherePath) {
    $vsInstalls = & $vsWherePath -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsInstalls) {
        $hasBuildTools = $true
    }
}

# Also check via registry for standalone build tools
if (-not $hasBuildTools) {
    $regPaths = @(
        "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC",
        "HKLM:\SOFTWARE\Microsoft\VisualStudio\15.0\VC",
        "HKLM:\SOFTWARE\Microsoft\VisualStudio\16.0\VC",
        "HKLM:\SOFTWARE\Microsoft\VisualStudio\17.0\VC"
    )
    foreach ($path in $regPaths) {
        if (Test-Path $path) {
            $hasBuildTools = $true
            break
        }
    }
}

# Check if node-gyp can find a compiler
if (-not $hasBuildTools) {
    try {
        $msbuildPath = & where.exe MSBuild.exe 2>$null
        if ($msbuildPath) { $hasBuildTools = $true }
    } catch {}
}

if ($hasBuildTools) {
    Write-Host "  ✅ C++ Build Tools detected" -ForegroundColor Green
} else {
    Write-Host "  ❌ C++ Build Tools not found." -ForegroundColor Red
    Write-Host "  Installing Visual Studio Build Tools (Desktop C++ workload)..." -ForegroundColor Yellow
    Write-Host "  This may take 5-10 minutes and requires ~4GB disk space." -ForegroundColor Yellow
    Write-Host ""

    # Try winget first
    $wingetResult = winget install Microsoft.VisualStudio.2022.BuildTools --accept-source-agreements --accept-package-agreements --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "  ⚠️  Automatic install may have failed." -ForegroundColor Red
        Write-Host "  Manual fallback:" -ForegroundColor Yellow
        Write-Host "    1. Go to: https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor White
        Write-Host "    2. Download Build Tools for Visual Studio 2022" -ForegroundColor White
        Write-Host "    3. In installer, check 'Desktop development with C++'" -ForegroundColor White
        Write-Host "    4. Click Install" -ForegroundColor White
        Write-Host ""
        $issues += "C++ Build Tools need manual install (see instructions above)"
    } else {
        $installed += "Visual Studio 2022 Build Tools (C++ workload)"
    }
}

# ----------------------------------------------------------------------------
# 6. VS CODE (bonus check)
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "[Bonus] Checking VS Code..." -ForegroundColor Yellow

$hasVSCode = $false
try {
    $codeOutput = & code --version 2>$null
    if ($codeOutput) { $hasVSCode = $true }
} catch {}

if ($hasVSCode) {
    $codeVer = ($codeOutput -split "`n")[0]
    Write-Host "  ✅ VS Code $codeVer" -ForegroundColor Green
} else {
    Write-Host "  ❌ VS Code not found. Installing..." -ForegroundColor Red
    winget install Microsoft.VisualStudioCode --accept-source-agreements --accept-package-agreements
    $installed += "VS Code"
}

# ----------------------------------------------------------------------------
# 7. VS CODE EXTENSIONS (install required ones)
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "[Extensions] Installing required VS Code extensions..." -ForegroundColor Yellow

$extensions = @(
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "pmneo.tsimporter",
    "esbenp.prettier-vscode",
    "qwtel.sqlite-viewer",
    "usernamehw.errorlens"
)

if ($hasVSCode -or (Get-Command code -ErrorAction SilentlyContinue)) {
    foreach ($ext in $extensions) {
        $extName = $ext.Split(".")[-1]
        Write-Host "  Installing $extName..." -ForegroundColor Gray -NoNewline
        $result = & code --install-extension $ext --force 2>&1
        if ($result -match "already installed" -or $result -match "successfully installed") {
            Write-Host " ✅" -ForegroundColor Green
        } else {
            Write-Host " ⚠️" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  ⚠️  VS Code CLI not available yet. Restart terminal, then run:" -ForegroundColor Yellow
    foreach ($ext in $extensions) {
        Write-Host "    code --install-extension $ext" -ForegroundColor White
    }
    $issues += "VS Code extensions need manual install after terminal restart"
}

# ----------------------------------------------------------------------------
# 8. SET EXECUTION POLICY (for npm scripts)
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "[Policy] Checking PowerShell execution policy..." -ForegroundColor Yellow

$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -eq "Restricted") {
    Write-Host "  Setting execution policy to RemoteSigned..." -ForegroundColor Yellow
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
    Write-Host "  ✅ Execution policy updated" -ForegroundColor Green
} else {
    Write-Host "  ✅ Execution policy: $policy" -ForegroundColor Green
}

# ----------------------------------------------------------------------------
# SUMMARY
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if ($installed.Count -gt 0) {
    Write-Host ""
    Write-Host "  Installed:" -ForegroundColor Green
    foreach ($item in $installed) {
        Write-Host "    + $item" -ForegroundColor Green
    }
}

if ($issues.Count -gt 0) {
    Write-Host ""
    Write-Host "  Action Required:" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "    ! $issue" -ForegroundColor Red
    }
}

if ($installed.Count -gt 0) {
    Write-Host ""
    Write-Host "  ⚠️  RESTART YOUR TERMINAL before proceeding." -ForegroundColor Yellow
    Write-Host "  New installs won't be on PATH until you open a fresh terminal." -ForegroundColor Yellow
}

if ($issues.Count -eq 0 -and $installed.Count -eq 0) {
    Write-Host ""
    Write-Host "  ✅ All prerequisites satisfied. Ready to build." -ForegroundColor Green
}

Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "    1. Open a NEW PowerShell terminal" -ForegroundColor White
Write-Host "    2. cd C:\Users\kjrpu\Documents\2. LI\Claude" -ForegroundColor White
Write-Host "    3. git clone https://github.com/steadycalls/Campaign-Success-Local.git" -ForegroundColor White
Write-Host "    4. cd Campaign-Success-Local" -ForegroundColor White
Write-Host "    5. code ." -ForegroundColor White
Write-Host ""
