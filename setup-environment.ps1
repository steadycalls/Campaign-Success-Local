<#
.SYNOPSIS
Sets up the local development environment for the Campaign-Success-Local project.

.DESCRIPTION
This script checks for and installs the necessary prerequisites:
- Node.js (v20+)
- Git
- Python (v3.11+)
- C++ Build Tools
- Checks PowerShell execution policy

.NOTES
Run this script as Administrator.
#>

Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

function Write-Step ($message) {
    Write-Host "`n[+] $message" -ForegroundColor Cyan
}

function Write-Success ($message) {
    Write-Host "    [✓] $message" -ForegroundColor Green
}

function Write-WarningMsg ($message) {
    Write-Host "    [!] $message" -ForegroundColor Yellow
}

function Write-ErrorMsg ($message) {
    Write-Host "    [x] $message" -ForegroundColor Red
}

function Check-Command ($command) {
    return (Get-Command $command -ErrorAction SilentlyContinue) -ne $null
}

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Campaign-Success-Local Environment Setup Script" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Check Execution Policy
Write-Step "Checking PowerShell Execution Policy..."
$policy = Get-ExecutionPolicy
if ($policy -eq "Restricted" -or $policy -eq "AllSigned") {
    Write-WarningMsg "Execution policy is set to $policy. This might prevent running scripts."
    Write-WarningMsg "Run: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser"
} else {
    Write-Success "Execution policy is $policy (Good)."
}

# 2. Check Git
Write-Step "Checking Git..."
if (Check-Command "git") {
    $gitVer = git --version
    Write-Success "Git is installed: $gitVer"
} else {
    Write-WarningMsg "Git not found. Installing via winget..."
    winget install --id Git.Git -e --source winget
    Write-Success "Git installed."
}

# 3. Check Node.js (20+)
Write-Step "Checking Node.js..."
if (Check-Command "node") {
    $nodeVer = node -v
    $major = [int]($nodeVer -replace '^v', '').Split('.')[0]
    if ($major -ge 20) {
        Write-Success "Node.js is installed: $nodeVer"
    } else {
        Write-WarningMsg "Node.js version is $nodeVer (Requires 20+). Installing via winget..."
        winget install --id OpenJS.NodeJS -e --source winget
        Write-Success "Node.js installed. Please restart your terminal."
    }
} else {
    Write-WarningMsg "Node.js not found. Installing via winget..."
    winget install --id OpenJS.NodeJS -e --source winget
    Write-Success "Node.js installed. Please restart your terminal."
}

# 4. Check Python (3.11+)
Write-Step "Checking Python..."
if (Check-Command "python") {
    $pyVer = python --version
    Write-Success "Python is installed: $pyVer"
} else {
    Write-WarningMsg "Python not found. Installing via winget..."
    winget install --id Python.Python.3.11 -e --source winget
    Write-Success "Python installed."
}

# 5. Check C++ Build Tools
Write-Step "Checking C++ Build Tools..."
$vsWherePath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vsWherePath) {
    $tools = & $vsWherePath -latest -requires Microsoft.VisualStudio.Workload.VCTools -property installationPath
    if ($tools) {
        Write-Success "C++ Build Tools are installed at: $tools"
    } else {
        Write-WarningMsg "Visual Studio Installer found, but C++ Build Tools workload is missing."
        Write-WarningMsg "Please open Visual Studio Installer, modify your installation, and check 'Desktop development with C++'."
    }
} else {
    Write-WarningMsg "C++ Build Tools not found."
    Write-WarningMsg "Installing Visual Studio Build Tools via winget..."
    winget install --id Microsoft.VisualStudio.2022.BuildTools -e --source winget
    Write-WarningMsg "ACTION REQUIRED: Open Visual Studio Installer and ensure 'Desktop development with C++' is checked."
}

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "  Setup checks complete. Please review any warnings above." -ForegroundColor Cyan
Write-Host "  If Node or Python was installed, restart your terminal." -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
