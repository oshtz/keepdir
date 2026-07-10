param(
    [Parameter(Mandatory = $true)]
    [string]$AppPath
)

$ErrorActionPreference = "Stop"
$app = (Resolve-Path -LiteralPath $AppPath).Path
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $tempBase "keepdir-packaged-smoke-$([Guid]::NewGuid().ToString('N'))"
$dataDir = Join-Path $tempRoot "data"
$watchDir = Join-Path $tempRoot "watch"
$instanceSuffix = [Guid]::NewGuid().ToString("N")
$first = $null
$second = $null

function Start-KeepDir {
    $start = [Diagnostics.ProcessStartInfo]::new($app)
    $start.UseShellExecute = $false
    $start.WorkingDirectory = Split-Path -Parent $app
    $start.Environment["KEEPDIR_DATA_DIR"] = $dataDir
    $start.Environment["KEEPDIR_SMOKE_EXIT_AFTER_MS"] = "20000"
    $start.Environment["KEEPDIR_SMOKE_INSTANCE_SUFFIX"] = $instanceSuffix
    $start.Environment["KEEPDIR_SMOKE_CONFLICT_CYCLE"] = "1"
    return [Diagnostics.Process]::Start($start)
}

try {
    New-Item -ItemType Directory -Force -Path $dataDir, $watchDir | Out-Null
    $source = Join-Path $watchDir "report-final.pdf"
    $targetDir = Join-Path $watchDir "Invoices"
    $target = Join-Path $targetDir "report-final.pdf"
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Set-Content -LiteralPath $source -Value "new" -NoNewline
    Set-Content -LiteralPath $target -Value "existing" -NoNewline
    $file = Get-Item -LiteralPath $source
    $mtime = [DateTimeOffset]::new($file.LastWriteTimeUtc).ToUnixTimeMilliseconds()
    $today = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-dd")
    $store = @{
        settings = @{ lastUpdateCheckDate = "2000-01-01" }
        workspaceSettings = @{ default = @{ queueUnmatchedFiles = $false; automationRules = @() } }
        watchFolders = @{ default = @(@{ id = "watch-smoke"; path = $watchDir; enabled = $true; createdAt = "1"; recursive = $false }) }
        ruleActions = @{ default = @(@{
            id = "smoke-conflict"; workspaceId = "default"; folderPath = $watchDir; filePath = $source
            originalName = "report-final.pdf"; targetPath = $target; targetName = "report-final.pdf"
            ruleId = "rule-smoke"; ruleName = "Smoke"; ruleTrace = @(); status = "conflict"
            fileSize = $file.Length; fileMtimeMs = $mtime; errorMessage = "Target already exists"
            appliedSourcePath = $null; appliedTargetPath = $null; createdAt = "1"; updatedAt = "1"
        }) }
    }
    $store | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $dataDir "keepdir.json") -Encoding utf8

    $first = Start-KeepDir
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        Start-Sleep -Milliseconds 200
        $first.Refresh()
    } while (-not $first.HasExited -and $first.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)
    if ($first.HasExited -or $first.MainWindowHandle -eq 0) { throw "Packaged app did not expose a main window." }

    $second = Start-KeepDir
    if (-not $second.WaitForExit(10000)) { throw "Second instance did not exit after focusing the first instance." }
    if ($second.ExitCode -ne 0) { throw "Second instance exited with code $($second.ExitCode)." }
    if ($first.HasExited) { throw "First instance exited when the second instance launched." }

    if (-not $first.WaitForExit(30000)) { throw "Packaged app did not exit cleanly after the smoke interval." }
    if ($first.ExitCode -ne 0) { throw "Packaged app exited with code $($first.ExitCode)." }
    $savedStore = Get-Content -LiteralPath (Join-Path $dataDir "keepdir.json") -Raw | ConvertFrom-Json
    if ($savedStore.settings.lastUpdateCheckDate -ne $today) { throw "Packaged app did not read and update the isolated data directory." }
    if ($savedStore.ruleActions.default[0].status -ne "undone") { throw "Packaged conflict cycle did not finish at undone." }
    if ((Get-Content -LiteralPath $source -Raw) -ne "new") { throw "Packaged conflict cycle did not restore the source file." }
    if (Test-Path -LiteralPath (Join-Path $targetDir "report-final-2.pdf")) { throw "Packaged conflict cycle left the retargeted file behind." }
    if ((Get-Content -LiteralPath $target -Raw) -ne "existing") { throw "Packaged conflict cycle changed the original conflict target." }
    Write-Host "OK packaged Windows launch, isolated data, single instance, conflict rename/apply/undo, and clean exit."
}
finally {
    foreach ($process in @($second, $first)) {
        if ($null -ne $process -and -not $process.HasExited) { $process.Kill($true) }
        if ($null -ne $process) { $process.Dispose() }
    }
    $resolvedRoot = [IO.Path]::GetFullPath($tempRoot)
    if ($resolvedRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedRoot)) {
        Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
    }
}
