# update.ps1
param(
    [string]$Repo = "yazj86/ckg-auto-chrome-extensions",
    [string]$AssetName = "ckg-auto-chrome-extensions.zip"
)

# Setup paths
$installPath = Split-Path -Parent $PSScriptRoot
$tempZip = Join-Path $env:TEMP "extension_update.zip"
$tempExtract = Join-Path $env:TEMP "extension_update_extract"
$backupPath = Join-Path $env:TEMP "extension_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

# Log function
function Write-Log {
    param([string]$Message, [string]$Type = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Type) {
        "ERROR"   { "Red" }
        "WARNING" { "Yellow" }
        "SUCCESS" { "Green" }
        default   { "White" }
    }
    Write-Host "[$timestamp] [$Type] $Message" -ForegroundColor $color
}

# Error handling
try {
    Write-Log "========================================="
    Write-Log "CKG Auto Chrome Extension Updater"
    Write-Log "========================================="
    Write-Log "Checking latest release..." "INFO"

    # 1. Get latest release from GitHub
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{
        "User-Agent" = "CKG-Updater"
        "Accept" = "application/vnd.github.v3+json"
    }

    # 2. Find asset
    $asset = $release.assets | Where-Object { $_.name -eq $AssetName }

    if (-not $asset) {
        Write-Log "Asset not found: $AssetName" "ERROR"
        Write-Log "Available assets:" "WARNING"
        $release.assets | ForEach-Object { Write-Log "  - $($_.name)" "WARNING" }
        exit 1
    }

    $downloadUrl = $asset.browser_download_url
    $version = $release.tag_name
    $releaseNotes = $release.body

    Write-Log "Latest version: $version" "SUCCESS"
    Write-Log "Release notes:" "INFO"
    Write-Log "$releaseNotes" "INFO"
    Write-Log "Downloading..." "INFO"

    # 3. Download zip
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
    Write-Log "Download completed: $tempZip" "SUCCESS"

    # 4. Backup current version
    Write-Log "Creating backup..." "INFO"
    if (Test-Path $backupPath) {
        Remove-Item $backupPath -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $backupPath | Out-Null
    Copy-Item "$installPath\*" $backupPath -Recurse -Force -Exclude "*.log"
    Write-Log "Backup created: $backupPath" "SUCCESS"

    # 5. Clean temp extract folder
    if (Test-Path $tempExtract) {
        Remove-Item $tempExtract -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $tempExtract | Out-Null

    # 6. Extract new version
    Write-Log "Extracting..." "INFO"
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    Write-Log "Extraction completed" "SUCCESS"

    # 7. Find extracted folder
    $extractedFolder = Get-ChildItem $tempExtract -Directory | Select-Object -First 1
    $sourcePath = if ($extractedFolder) {
        $extractedFolder.FullName
    } else {
        $tempExtract
    }

    # 8. Move extracted files to install path
    Write-Log "Installing update..." "INFO"
    
    # Files/folders yang TIDAK boleh di-overwrite
    $excludeItems = @(
        ".git",
        ".gitignore",
        "data",
        "backup",
        "*.log",
        "update.ps1",
        "update.bat",
        "config.local.json"
    )

    # Copy semua file kecuali yang di-exclude
    Get-ChildItem $sourcePath -Force | Where-Object {
        $item = $_
        -not ($excludeItems | Where-Object { $item.Name -like $_ })
    } | ForEach-Object {
        $destination = Join-Path $installPath $_.Name
        if ($_.PSIsContainer) {
            Copy-Item $_.FullName $destination -Recurse -Force
        } else {
            Copy-Item $_.FullName $destination -Force
        }
        Write-Log "Updated: $($_.Name)" "SUCCESS"
    }

    # 9. Cleanup temp files
    Write-Log "Cleaning up..." "INFO"
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    # 10. Save update info
    $updateInfo = @{
        version = $version
        updated_at = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        backup_path = $backupPath
    }
    $updateInfo | ConvertTo-Json | Out-File (Join-Path $installPath "update_info.json") -Force

    Write-Log "========================================="
    Write-Log "Update completed successfully!" "SUCCESS"
    Write-Log "Version: $version" "SUCCESS"
    Write-Log "========================================="

    # 11. Open Chrome extension page
    Write-Log "Opening Chrome extension page..." "INFO"
    Start-Process "chrome.exe" -ArgumentList "chrome://extensions/"
   
    Write-Log "Please reload the extension in Chrome!" "WARNING"
    Write-Log "Go to chrome://extensions and click reload button" "WARNING"

    # Pause agar user bisa baca pesan
    Write-Host ""
    Read-Host "Press Enter to close..."

} catch {
    Write-Log "=========================================" "ERROR"
    Write-Log "Update failed!" "ERROR"
    Write-Log $_.Exception.Message "ERROR"
    Write-Log "=========================================" "ERROR"

    # Restore backup jika ada
    if (Test-Path $backupPath) {
        Write-Log "Restoring backup..." "WARNING"
        Copy-Item "$backupPath\*" $installPath -Recurse -Force
        Write-Log "Backup restored" "SUCCESS"
    }

    # Cleanup
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    Read-Host "Press Enter to close..."
    exit 1
}