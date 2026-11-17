# Builds dist\gta6-spoiler-blocker-v<version>.zip with only the files Chrome needs.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File scripts\package.ps1
# (Writes zip entries with forward slashes; Windows PowerShell's Compress-Archive uses backslashes,
#  which break unzipping on macOS/Linux and are rejected by the Chrome Web Store.)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
$include = 'manifest.json', 'shared.js', 'content.js', 'content.css', 'popup.html', 'popup.css', 'popup.js', 'LICENSE', 'icons'

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zipPath = Join-Path $dist "gta6-spoiler-blocker-v$version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
    foreach ($item in $include) {
        $full = Join-Path $root $item
        $files = if (Test-Path $full -PathType Container) { Get-ChildItem $full -Recurse -File } else { Get-Item $full }
        foreach ($f in $files) {
            $entry = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entry, 'Optimal')
        }
    }
} finally { $zip.Dispose() }
Write-Host "Built $zipPath"
