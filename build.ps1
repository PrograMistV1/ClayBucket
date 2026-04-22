#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ROOT_DIR   = Get-Location
$BP_DIR     = Join-Path $ROOT_DIR "ClayBucket_BP"
$RP_DIR     = Join-Path $ROOT_DIR "ClayBucket_RP"
$DIST_DIR   = Join-Path $ROOT_DIR "dist"
$STAGING_DIR = Join-Path $DIST_DIR "staging"

$manifest   = Get-Content (Join-Path $BP_DIR "manifest.json") | ConvertFrom-Json
$BP_VERSION = $manifest.header.version -join "."

$ARCHIVE_PATH  = Join-Path $DIST_DIR "ClayBucket-${BP_VERSION}.zip"
$MCADDON_PATH  = Join-Path $DIST_DIR "ClayBucket-${BP_VERSION}.mcaddon"

Write-Host "[1/4] Installing BP dependencies (if needed) and compiling TypeScript..."
if (-not (Test-Path (Join-Path $BP_DIR "node_modules"))) {
    npm --prefix $BP_DIR install
}
npm --prefix $BP_DIR run build

Write-Host "[2/4] Preparing clean staging directory..."
if (Test-Path $STAGING_DIR) { Remove-Item $STAGING_DIR -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $STAGING_DIR "ClayBucket_BP") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $STAGING_DIR "ClayBucket_RP") | Out-Null

$excludesBP = @(
    ".git", ".idea", "node_modules", "src",
    "package.json", "package-lock.json", "tsconfig.json",
    "*.tsbuildinfo", ".DS_Store"
)

$excludesRP = @(".git", ".idea", "node_modules", ".DS_Store")

function Copy-Filtered {
    param(
        [string]$Source,
        [string]$Destination,
        [string[]]$Exclude
    )
    Get-ChildItem -Path $Source -Recurse |
        Where-Object {
            $item = $_
            -not ($Exclude | Where-Object {
                $item.FullName -like "*\$_*" -or $item.Name -like $_
            })
        } |
        ForEach-Object {
            $relative = $_.FullName.Substring($Source.Length).TrimStart('\', '/')
            $target   = Join-Path $Destination $relative
            if ($_.PSIsContainer) {
                New-Item -ItemType Directory -Path $target -Force | Out-Null
            } else {
                $targetDir = Split-Path $target -Parent
                if (-not (Test-Path $targetDir)) {
                    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
                }
                Copy-Item -Path $_.FullName -Destination $target -Force
            }
        }
}

Copy-Filtered -Source $BP_DIR -Destination (Join-Path $STAGING_DIR "ClayBucket_BP") -Exclude $excludesBP
Copy-Filtered -Source $RP_DIR -Destination (Join-Path $STAGING_DIR "ClayBucket_RP") -Exclude $excludesRP

Write-Host "[3/4] Creating zip archive..."
if (Test-Path $ARCHIVE_PATH) { Remove-Item $ARCHIVE_PATH }
Compress-Archive -Path (Join-Path $STAGING_DIR "ClayBucket_BP"), (Join-Path $STAGING_DIR "ClayBucket_RP") `
                 -DestinationPath $ARCHIVE_PATH

Write-Host "[4/4] Creating mcaddon archive..."
if (Test-Path $MCADDON_PATH) { Remove-Item $MCADDON_PATH }
Compress-Archive -Path (Join-Path $STAGING_DIR "ClayBucket_BP"), (Join-Path $STAGING_DIR "ClayBucket_RP") `
                 -DestinationPath $MCADDON_PATH

Write-Host "Done: $ARCHIVE_PATH"
Write-Host "Done: $MCADDON_PATH"
