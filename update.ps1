# update.ps1 — CKG Auto Chrome Extension Updater
# Created by Yazj86

param(
    [string]$Repo      = "yazj86/ckg-auto-chrome-extensions",
    [string]$AssetName = "ckg-auto-chrome-extensions.zip"
)

# ============================================================
# FUNGSI: Deteksi install path (aman untuk .ps1 dan .exe)
# ============================================================
function Get-InstallPath {
    $procPath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    $procName = [System.IO.Path]::GetFileNameWithoutExtension($procPath).ToLower()

    # Dijalankan sebagai PowerShell script
    if ($procName -in @('powershell', 'pwsh')) {
        if ($PSScriptRoot) { return $PSScriptRoot }
        return (Get-Location).Path
    }

    # Dijalankan sebagai .exe → pakai folder exe
    return [System.IO.Path]::GetDirectoryName($procPath)
}

# ============================================================
# FUNGSI: Pause aman (tidak error di exe)
# ============================================================
function Pause-End {
    Write-Host ""
    Write-Host "  Tekan Enter untuk menutup..." -ForegroundColor DarkGray
    try {
        [void][System.Console]::ReadLine()
    } catch {
        try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") }
        catch { Start-Sleep -Seconds 5 }
    }
}

# ============================================================
# INIT
# ============================================================
$installPath = Get-InstallPath
$tempZip     = Join-Path $env:TEMP "ckg_update.zip"
$tempExtract = Join-Path $env:TEMP "ckg_update_extract"

Clear-Host
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    CKG Auto Chrome Extension Updater" -ForegroundColor Cyan
Write-Host "    Created by Yazj86" -ForegroundColor DarkCyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [i] Install path : $installPath" -ForegroundColor DarkGray
Write-Host ""

try {
    # ============================================================
    # 1. AMBIL RILIS TERBARU
    # ============================================================
    Write-Host "  [1/6] Cek rilis terbaru..." -ForegroundColor Cyan

    $headers = @{
        "User-Agent" = "CKG-Updater"
        "Accept"     = "application/vnd.github.v3+json"
    }

    $release = Invoke-RestMethod `
        -Uri "https://api.github.com/repos/$Repo/releases/latest" `
        -Headers $headers -TimeoutSec 30

    $asset = $release.assets | Where-Object { $_.name -eq $AssetName }
    if (-not $asset) {
        throw "Asset '$AssetName' tidak ditemukan di release $($release.tag_name)"
    }

    $downloadUrl = $asset.browser_download_url
    $version     = $release.tag_name
    $sizeKB      = [math]::Round($asset.size / 1KB, 1)

    Write-Host "        Versi  : $version" -ForegroundColor Green
    Write-Host "        Asset  : $AssetName ($sizeKB KB)" -ForegroundColor Green
    Write-Host ""

    # ============================================================
    # 2. DOWNLOAD
    # ============================================================
    Write-Host "  [2/6] Download..." -ForegroundColor Cyan

    if (Test-Path $tempZip) { Remove-Item $tempZip -Force }
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip `
        -UseBasicParsing -Headers $headers -TimeoutSec 300

    $gotKB = [math]::Round((Get-Item $tempZip).Length / 1KB, 1)
    if ($gotKB -lt 1) { throw "File download kosong / korup" }

    Write-Host "        Selesai ($gotKB KB)" -ForegroundColor Green
    Write-Host ""

    # ============================================================
    # 3. EKSTRAK
    # ============================================================
    Write-Host "  [3/6] Ekstrak..." -ForegroundColor Cyan

    if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

    # Deteksi root folder dalam zip
    $src     = $tempExtract
    $subDirs = @(Get-ChildItem $tempExtract -Directory)
    if ($subDirs.Count -eq 1 -and -not (Get-ChildItem $tempExtract -File)) {
        $src = $subDirs[0].FullName
    }

    Write-Host "        Selesai" -ForegroundColor Green
    Write-Host ""

    # ============================================================
    # 4. SYNC KE INSTALL PATH (robocopy)
    # ============================================================
    Write-Host "  [4/6] Install..." -ForegroundColor Cyan

    New-Item -ItemType Directory -Force -Path $installPath | Out-Null

    $null = robocopy $src $installPath /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP `
        /XF "update.ps1" "update.bat" "update.exe" `
            "build.ps1" "build.bat" "build.exe" `
            "release.ps1" "release.bat" `
            "CKG-Updater.exe" "icon.ico" `
            "version.txt" "update_info.json" `
            "*.log" "*.zip" `
        /XD ".git" ".github" ".vscode" "node_modules" `
            "backup" "data" "logs" "dist" "temp"

    if ($LASTEXITCODE -ge 8) {
        throw "robocopy gagal (exit code: $LASTEXITCODE)"
    }

    Write-Host "        Files synced" -ForegroundColor Green
    Write-Host ""

    # ============================================================
    # 5. UPDATE manifest.json VERSION (Chrome format)
    # ============================================================
    Write-Host "  [5/6] Update manifest.json..." -ForegroundColor Cyan

    $manifestPath = Join-Path $installPath "manifest.json"

    if (Test-Path $manifestPath) {
        try {
            # Konversi tag → versi Chrome (x.y.z)
            $ver = $version -replace '^[vV]', ''
            $ver = $ver -replace '-.*$', ''
            $ver = $ver -replace '[^\d\.]', ''

            $parts = $ver -split '\.' | Where-Object { $_ -ne '' }
            while ($parts.Count -lt 3) { $parts += '0' }
            $ver = ($parts[0..2]) -join '.'

            # Baca manifest (UTF-8 tanpa BOM)
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            $raw       = [System.IO.File]::ReadAllText($manifestPath, $utf8NoBom)
            $manifest  = $raw | ConvertFrom-Json

            $oldVer = $manifest.version
            $manifest.version = $ver

            # Tulis ulang
            $json = $manifest | ConvertTo-Json -Depth 100
            [System.IO.File]::WriteAllText($manifestPath, $json, $utf8NoBom)

            Write-Host "        Version: $oldVer -> $ver" -ForegroundColor Green
        } catch {
            Write-Host "        [!] Gagal update manifest: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "        [!] manifest.json tidak ada" -ForegroundColor Yellow
    }
    Write-Host ""

    # ============================================================
    # 6. CLEANUP & SELESAI
    # ============================================================
    Write-Host "  [6/6] Cleanup..." -ForegroundColor Cyan

    # Simpan versi
    $version | Out-File (Join-Path $installPath "version.txt") -Encoding UTF8 -NoNewline

    # Hapus temp
    Remove-Item $tempZip     -Force -ErrorAction SilentlyContinue
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host "        Selesai" -ForegroundColor Green
    Write-Host ""

    # ============================================================
    # SELESAI
    # ============================================================
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "    [+] Update BERHASIL: $version" -ForegroundColor Green
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host ""

    # Buka Chrome
    try {
        Start-Process -FilePath "chrome.exe" -ArgumentList "--new-tab", "chrome://extensions/"
        Write-Host "  [!] Buka chrome://extensions/ lalu klik Reload" -ForegroundColor Yellow
    } catch {
        Write-Host "  [!] Buka Chrome manual, lalu ke chrome://extensions/" -ForegroundColor Yellow
    }

    Pause-End
    exit 0
}
catch {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Red
    Write-Host "    [x] UPDATE GAGAL" -ForegroundColor Red
    Write-Host "  ============================================" -ForegroundColor Red
    Write-Host "    $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""

    # Cleanup
    Remove-Item $tempZip     -Force -ErrorAction SilentlyContinue
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    Pause-End
    exit 1
}