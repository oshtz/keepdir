param(
    [string]$ExpectedVersion = "0.1.0",
    [string]$ExpectedMacBuild = "1"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$windowsWorkflow = Get-Content -Raw (Join-Path $root ".github/workflows/windows-native.yml")
$macWorkflow = Get-Content -Raw (Join-Path $root ".github/workflows/macos-native.yml")

function Assert-Contains([string]$Text, [string]$Expected, [string]$Message) {
    if (-not $Text.Contains($Expected)) { throw $Message }
}

foreach ($workflow in @($windowsWorkflow, $macWorkflow)) {
    Assert-Contains $workflow "fetch-depth: 0" "Release checkout must fetch tags."
    Assert-Contains $workflow "inputs.release_tag || github.ref" "Manual release checkout must use release_tag."
    if ($workflow.Contains("--clobber")) { throw "Release workflows must not overwrite published assets." }
}

Assert-Contains $windowsWorkflow '-p:Version=$env:APP_VERSION' "Windows release must inject the tag version."
Assert-Contains $windowsWorkflow "Publishing an unsigned Windows executable" "Windows releases must disclose their unsigned status."
if ($windowsWorkflow.Contains("WINDOWS_CODESIGN_")) { throw "Windows workflow must not reference unused signing secrets." }
Assert-Contains $macWorkflow "Set :CFBundleShortVersionString `$APP_VERSION" "macOS release must inject the tag version."
Assert-Contains $macWorkflow "Print :CFBundleVersion" "macOS release must validate its independent bundle build version."

$rootVersion = (Get-Content -Raw (Join-Path $root "VERSION")).Trim()
if ($rootVersion -ne $ExpectedVersion) { throw "Root version is $rootVersion, expected $ExpectedVersion." }

[xml]$project = Get-Content -Raw (Join-Path $root "native/windows/KeepDir.App/KeepDir.App.csproj")
$projectVersion = [string]$project.Project.PropertyGroup.Version
if ($projectVersion -ne $ExpectedVersion) { throw "Windows project version is $projectVersion, expected $ExpectedVersion." }

$plist = Get-Content -Raw (Join-Path $root "native/macos/Packaging/Info.plist")
$marketingVersion = [regex]::Match($plist, '<key>CFBundleShortVersionString</key>\s*<string>([^<]+)</string>').Groups[1].Value
$buildVersion = [regex]::Match($plist, '<key>CFBundleVersion</key>\s*<string>([^<]+)</string>').Groups[1].Value
if ($marketingVersion -ne $ExpectedVersion) { throw "macOS marketing version is $marketingVersion, expected $ExpectedVersion." }
if ($buildVersion -ne $ExpectedMacBuild -or $buildVersion -notmatch '^[1-9][0-9]*$') {
    throw "macOS bundle build is $buildVersion, expected positive integer $ExpectedMacBuild."
}

Write-Host "OK release gates are immutable, tag-bound, and version-aligned at $ExpectedVersion (macOS build $ExpectedMacBuild)."
