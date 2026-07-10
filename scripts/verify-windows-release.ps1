param(
    [Parameter(Mandatory = $true)]
    [string]$ExePath,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedVersion,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedCommit,
    [string]$ChecksumPath,
    [switch]$RequireSignature
)

$ErrorActionPreference = "Stop"
$exe = Get-Item -LiteralPath (Resolve-Path -LiteralPath $ExePath)
$info = $exe.VersionInfo
$expectedFileVersion = "$ExpectedVersion.0"
if ($info.FileVersion -ne $expectedFileVersion) {
    throw "Windows FileVersion is $($info.FileVersion), expected $expectedFileVersion."
}
if (-not $info.ProductVersion.StartsWith("$ExpectedVersion+", [StringComparison]::Ordinal) -or $info.ProductVersion.IndexOf($ExpectedCommit, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw "Windows ProductVersion does not identify $ExpectedVersion at $ExpectedCommit`: $($info.ProductVersion)"
}

$signature = Get-AuthenticodeSignature -LiteralPath $exe.FullName
if ($RequireSignature -and $signature.Status -ne "Valid") {
    throw "Windows signature is required but status is $($signature.Status): $($signature.StatusMessage)"
}
if (-not $RequireSignature -and $signature.Status -ne "Valid") {
    Write-Warning "Windows artifact is unsigned; Windows SmartScreen may warn users."
}

if (-not [string]::IsNullOrWhiteSpace($ChecksumPath)) {
    $manifestLine = (Get-Content -LiteralPath (Resolve-Path -LiteralPath $ChecksumPath) -Raw).Trim()
    $expectedHash = ($manifestLine -split '\s+')[0]
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $exe.FullName).Hash
    if ($actualHash -ne $expectedHash) { throw "Windows SHA-256 mismatch: expected $expectedHash, got $actualHash." }
}

Write-Host "OK Windows artifact version $($info.ProductVersion), signature $($signature.Status)."
