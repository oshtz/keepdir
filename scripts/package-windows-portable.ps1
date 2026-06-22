$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$releaseDir = Join-Path $repoRoot 'src-tauri\target\release'
$exe = Join-Path $releaseDir 'keepdir.exe'
if (-not (Test-Path -LiteralPath $exe)) {
  throw "Windows portable exe was not created at $exe"
}

$portableDir = Join-Path $releaseDir 'portable'
New-Item -ItemType Directory -Force -Path $portableDir | Out-Null
$portable = Join-Path $portableDir 'KeepDir-portable.exe'
Copy-Item -LiteralPath $exe -Destination $portable -Force

$portableFile = Get-Item -LiteralPath $portable
if ($portableFile.Length -lt 1MB) {
  throw "Windows portable exe is unexpectedly small: $($portableFile.Length) bytes"
}

$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $stream = [System.IO.File]::OpenRead($portableFile.FullName)
  try {
    $hashBytes = $sha256.ComputeHash($stream)
  } finally {
    $stream.Dispose()
  }
} finally {
  $sha256.Dispose()
}
$hash = -join ($hashBytes | ForEach-Object { $_.ToString('x2') })
$manifest = Join-Path $portableDir 'SHA256SUMS-windows.txt'
"$hash  $($portableFile.Name)" | Set-Content -LiteralPath $manifest -Encoding ascii

$size = [math]::Round($portableFile.Length / 1MB, 2)
Write-Host "Windows portable exe created: $($portableFile.FullName) ($size MB)"
Write-Host "Windows checksum manifest created: $manifest"
