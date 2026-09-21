$ErrorActionPreference = "Stop"

# Python 3.12.10 is the last Python 3.12 release that ships Windows binaries.
# The official embeddable distribution is sufficient for the stdlib-only judge
# and avoids requiring users to install Python separately.
$runtimeVersion = "3.12.10"
$archiveName = "python-$runtimeVersion-embed-amd64.zip"
$downloadUrl = "https://www.python.org/ftp/python/$runtimeVersion/$archiveName"
$expectedSha256 = "4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3"

$projectRoot = Split-Path -Parent $PSScriptRoot
$cacheDirectory = Join-Path $projectRoot ".cache\python-runtime"
$archivePath = Join-Path $cacheDirectory $archiveName
$runtimeDirectory = Join-Path $projectRoot "resources\python"
$versionMarker = Join-Path $runtimeDirectory ".runtime-version"
$pythonExecutable = Join-Path $runtimeDirectory "python.exe"

if ((Test-Path -LiteralPath $pythonExecutable) -and (Test-Path -LiteralPath $versionMarker)) {
  $installedVersion = (Get-Content -LiteralPath $versionMarker -Raw).Trim()
  if ($installedVersion -eq $runtimeVersion) {
    Write-Host "Embedded Python $runtimeVersion is ready."
    exit 0
  }
}

New-Item -ItemType Directory -Force -Path $cacheDirectory | Out-Null
if (-not (Test-Path -LiteralPath $archivePath)) {
  Write-Host "Downloading the official Python $runtimeVersion embeddable runtime..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath
}

$sha256 = [System.Security.Cryptography.SHA256]::Create()
$archiveStream = [System.IO.File]::OpenRead($archivePath)
try {
  $actualSha256 = ([System.BitConverter]::ToString($sha256.ComputeHash($archiveStream))).Replace("-", "").ToLowerInvariant()
} finally {
  $archiveStream.Dispose()
  $sha256.Dispose()
}
if ($actualSha256 -ne $expectedSha256) {
  throw "Embedded Python checksum mismatch. Expected $expectedSha256, received $actualSha256."
}

$stagingDirectory = Join-Path $projectRoot "resources\python-staging"
if (Test-Path -LiteralPath $stagingDirectory) {
  Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stagingDirectory | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $stagingDirectory)

if (-not (Test-Path -LiteralPath (Join-Path $stagingDirectory "python.exe"))) {
  throw "The downloaded archive does not contain python.exe."
}

if (Test-Path -LiteralPath $runtimeDirectory) {
  Remove-Item -LiteralPath $runtimeDirectory -Recurse -Force
}
Move-Item -LiteralPath $stagingDirectory -Destination $runtimeDirectory
Set-Content -LiteralPath $versionMarker -Value $runtimeVersion -Encoding ascii -NoNewline
Write-Host "Embedded Python $runtimeVersion prepared at $runtimeDirectory."
