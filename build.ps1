<#
.SYNOPSIS
    Compile update.ps1 menjadi CKG-Updater.exe (tanpa icon)
#>

[CmdletBinding()]
param(
    [string]$InputFile  = "update.ps1",
    [string]$OutputName = "CKG-Updater.exe",
    [string]$Version    = "1.0.0.0",
    [string]$Company    = "CKG",
    [string]$Product    = "CKG Auto Chrome Extension",
    [switch]$OpenFolder
)

$ErrorActionPreference = "Stop"

function Write-Step { param($m) Write-Host "`n[*] $m" -ForegroundColor Cyan }
function Write-OK   { param($m) Write-Host "    [+] $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "    [!] $m" -ForegroundColor Yellow }
function Write-Err  { param($m) Write-Host "    [x] $m" -ForegroundColor Red }

Clear-Host
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "   CKG Updater - Build Script" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
Set-Location $scriptDir

$inputPath  = Join-Path $scriptDir $InputFile
$outputPath = Join-Path $scriptDir $OutputName

# Normalisasi versi
$Version = ($Version -replace '^[vV]', '').Trim()
$Version = ($Version -replace '[^\d\.]', '')
$parts   = $Version -split '\.' | Where-Object { $_ -ne "" }
while ($parts.Count -lt 4) { $parts += "0" }
$parts   = $parts[0..3]
$Version = $parts -join '.'

Write-OK "Folder  : $scriptDir"
Write-OK "Source  : $InputFile"
Write-OK "Output  : $OutputName"
Write-OK "Versi   : $Version"

if (-not (Test-Path $inputPath)) {
    Write-Err "File source tidak ditemukan: $inputPath"
    Read-Host "`nTekan Enter untuk keluar"
    exit 1
}

# ============================================================
# PS2EXE
# ============================================================
Write-Step "Cek module ps2exe..."
$ps2exe = Get-Module -ListAvailable -Name ps2exe | Select-Object -First 1

if (-not $ps2exe) {
    Write-Warn "Install ps2exe..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        if (-not (Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue)) {
            Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
        }
        Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue
        Install-Module ps2exe -Scope CurrentUser -Force -AllowClobber -Repository PSGallery
        Write-OK "ps2exe terinstall"
    } catch {
        Write-Err "Gagal install ps2exe: $($_.Exception.Message)"
        Read-Host "`nTekan Enter untuk keluar"
        exit 1
    }
} else {
    Write-OK "ps2exe ditemukan (v$($ps2exe.Version))"
}
Import-Module ps2exe -Force

# ============================================================
# Compile
# ============================================================
Write-Step "Compiling $InputFile -> $OutputName"

if (Test-Path $outputPath) {
    Remove-Item $outputPath -Force
    Write-OK "Exe lama dihapus"
}

$params = @{
    InputFile    = $inputPath
    OutputFile   = $outputPath
    Title        = "CKG Auto Updater"
    Product      = $Product
    Description  = "Auto updater untuk ekstensi CKG - by Yazj86"
    Company      = "$Company (by Yazj86)"
    Version      = $Version
    noConsole    = $false
    RequireAdmin = $false
}

try {
    Invoke-PS2EXE @params
} catch {
    Write-Err "Compile gagal: $($_.Exception.Message)"
    Read-Host "`nTekan Enter untuk keluar"
    exit 1
}

if (-not (Test-Path $outputPath)) {
    Write-Err "Compile selesai tapi exe tidak ditemukan."
    Read-Host "`nTekan Enter untuk keluar"
    exit 1
}

$sizeKB = [math]::Round((Get-Item $outputPath).Length / 1KB, 1)
Write-OK "Compile berhasil ($sizeKB KB)"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   Build Selesai!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "   File  : $OutputName"
Write-Host "   Versi : $Version"
Write-Host "   Size  : $sizeKB KB"
Write-Host ""

if ($OpenFolder) {
    Start-Process explorer.exe -ArgumentList "/select,`"$outputPath`""
}

Write-Host "Double-click $OutputName untuk menjalankan updater." -ForegroundColor Cyan
Read-Host "`nEnter untuk menutup"