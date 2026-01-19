$ErrorActionPreference = "Stop"

# Build an unpacked distribution and zip it with no compression.
# This avoids the portable EXE self-extraction cost on each launch.
$projectRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $projectRoot "dist"
$unpackedDir = Join-Path $distDir "win-unpacked"
$zipPath = Join-Path $distDir "MD-Reader-fast.zip"

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

& npx electron-builder --win --dir
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (!(Test-Path $unpackedDir)) {
  throw "Expected unpacked build at $unpackedDir"
}

Compress-Archive -Path (Join-Path $unpackedDir "*") -DestinationPath $zipPath -CompressionLevel NoCompression
Write-Host "Fast-startup package created at $zipPath"
