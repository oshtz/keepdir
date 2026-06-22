$ErrorActionPreference = 'Stop'

$existing = Get-Process | Where-Object { $_.ProcessName -eq 'keepdir' }
if ($existing) {
  throw 'KeepDir is already running. Quit it before running the runtime smoke.'
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$exe = Join-Path $repoRoot 'src-tauri\target\debug\keepdir.exe'
if (!(Test-Path -LiteralPath $exe)) {
  throw 'Missing src-tauri\target\debug\keepdir.exe. Run npm run test:e2e first.'
}

$appDataDir = Join-Path $env:APPDATA 'com.oshtz.keepdir'
$storePath = Join-Path $appDataDir 'keepdir.json'
$backupPath = Join-Path $env:TEMP ('keepdir-json-backup-' + [guid]::NewGuid() + '.json')
$hadStore = Test-Path -LiteralPath $storePath
$smokeRoot = Join-Path $env:TEMP ('keepdir-runtime-smoke-' + [guid]::NewGuid())
$stdoutPath = Join-Path $env:TEMP ('keepdir-smoke-out-' + [guid]::NewGuid() + '.txt')
$stderrPath = Join-Path $env:TEMP ('keepdir-smoke-err-' + [guid]::NewGuid() + '.txt')
$process = $null

try {
  if ($hadStore) {
    Copy-Item -LiteralPath $storePath -Destination $backupPath -Force
  }

  New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null
  New-Item -ItemType Directory -Path $smokeRoot -Force | Out-Null

  $store = [ordered]@{
    settings = @{}
    workspaceSettings = @{
      default = @{
        automationRules = @(
          [ordered]@{
            id = 'rule-smoke'
            name = 'Smoke TXT'
            enabled = $true
            order = 0
            match = @{ extensionIn = @('txt') }
            action = @{
              targetFolder = 'Sorted'
              targetNameTemplate = '{basename}-sorted.{ext}'
            }
            stopOnMatch = $true
          }
        )
      }
    }
    watchFolders = @{
      default = @(
        [ordered]@{
          id = 'watch-smoke'
          path = $smokeRoot
          enabled = $true
          createdAt = (Get-Date).ToString('o')
        }
      )
    }
    ruleActions = @{}
  }
  $json = $store | ConvertTo-Json -Depth 20
  [System.IO.File]::WriteAllText($storePath, $json, (New-Object System.Text.UTF8Encoding($false)))

  $process = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  Start-Sleep -Seconds 2

  $sourcePath = Join-Path $smokeRoot 'invoice.txt'
  [System.IO.File]::WriteAllText($sourcePath, 'smoke', [System.Text.Encoding]::ASCII)
  Start-Sleep -Seconds 8

  $saved = Get-Content -LiteralPath $storePath -Raw | ConvertFrom-Json
  $actions = @($saved.ruleActions.PSObject.Properties['default'].Value)
  $action = $actions | Where-Object { $_.originalName -eq 'invoice.txt' } | Select-Object -First 1
  if (!$action) {
    throw 'Watcher did not create a rule action for invoice.txt.'
  }
  if ($action.status -ne 'pending') {
    throw "Expected pending action, got $($action.status)."
  }
  if ($action.ruleName -ne 'Smoke TXT') {
    throw "Expected Smoke TXT rule, got $($action.ruleName)."
  }
  if (!(Test-Path -LiteralPath $sourcePath)) {
    throw 'Source file moved during dry-run smoke.'
  }
  if ($action.targetPath -and (Test-Path -LiteralPath $action.targetPath)) {
    throw 'Target file exists before apply.'
  }

  [pscustomobject]@{
    status = $action.status
    ruleName = $action.ruleName
    originalName = $action.originalName
    targetPath = $action.targetPath
  } | ConvertTo-Json -Depth 4
}
finally {
  if ($process -and !$process.HasExited) {
    Stop-Process -Id $process.Id -Force
    Start-Sleep -Seconds 1
  }
  Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stdoutPath,$stderrPath -Force -ErrorAction SilentlyContinue

  if ($hadStore) {
    Copy-Item -LiteralPath $backupPath -Destination $storePath -Force
    Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
  } else {
    Remove-Item -LiteralPath $storePath -Force -ErrorAction SilentlyContinue
  }
}
