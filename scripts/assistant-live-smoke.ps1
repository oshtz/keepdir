param(
    [string[]]$Providers = @("openai", "google", "anthropic", "openrouter", "lmstudio", "ollama"),
    [int]$RequiredHosted = 0,
    [switch]$RequireLocal,
    [string]$EvidencePath
)

$ErrorActionPreference = "Stop"

$configs = @{
    openai = @{ Url = "https://api.openai.com/v1/models"; Key = $env:OPENAI_API_KEY; Hosted = $true; Headers = { param($key) @{ Authorization = "Bearer $key" } } }
    google = @{ Url = "https://generativelanguage.googleapis.com/v1beta/models"; Key = $(if ($env:GOOGLE_API_KEY) { $env:GOOGLE_API_KEY } else { $env:GEMINI_API_KEY }); Hosted = $true; Headers = { param($key) @{ "x-goog-api-key" = $key } } }
    anthropic = @{ Url = "https://api.anthropic.com/v1/models"; Key = $env:ANTHROPIC_API_KEY; Hosted = $true; Headers = { param($key) @{ "x-api-key" = $key; "anthropic-version" = "2023-06-01" } } }
    openrouter = @{ Url = "https://openrouter.ai/api/v1/models"; Key = $env:OPENROUTER_API_KEY; Hosted = $true; Headers = { param($key) @{ Authorization = "Bearer $key" } } }
    lmstudio = @{ Url = $(if ($env:LMSTUDIO_MODELS_URL) { $env:LMSTUDIO_MODELS_URL } else { "http://127.0.0.1:1234/v1/models" }); Key = ""; Hosted = $false; Headers = { @{} } }
    ollama = @{ Url = $(if ($env:OLLAMA_MODELS_URL) { $env:OLLAMA_MODELS_URL } else { "http://127.0.0.1:11434/v1/models" }); Key = ""; Hosted = $false; Headers = { @{} } }
}

$hostedOk = 0
$localOk = 0
$results = @()

foreach ($provider in $Providers) {
    if (-not $configs.ContainsKey($provider)) {
        throw "Unknown provider: $provider"
    }

    $config = $configs[$provider]
    if ($config.Hosted -and [string]::IsNullOrWhiteSpace($config.Key)) {
        Write-Host "SKIP $provider missing key"
        $results += [pscustomobject]@{ provider = $provider; kind = "hosted"; status = "skipped"; modelCount = 0 }
        continue
    }

    try {
        $headers = & $config.Headers $config.Key
        $response = Invoke-RestMethod -Uri $config.Url -Headers $headers -TimeoutSec 30
        $models = if ($provider -eq "google") { $response.models } elseif ($response.data) { $response.data } else { $response.models }
        $count = @($models).Count
        if ($count -lt 1) { throw "no models returned" }
        if ($config.Hosted) { $hostedOk++ } else { $localOk++ }
        $results += [pscustomobject]@{ provider = $provider; kind = $(if ($config.Hosted) { "hosted" } else { "local" }); status = "ok"; modelCount = $count }
        Write-Host "OK $provider $count model(s)"
    } catch {
        $results += [pscustomobject]@{ provider = $provider; kind = $(if ($config.Hosted) { "hosted" } else { "local" }); status = "failed"; modelCount = 0 }
        Write-Host "FAIL $provider $($_.Exception.Message)"
    }
}

if (-not [string]::IsNullOrWhiteSpace($EvidencePath)) {
    $commit = if ($env:GITHUB_SHA) { $env:GITHUB_SHA } else { (git rev-parse HEAD).Trim() }
    $dirty = -not [string]::IsNullOrWhiteSpace((git status --porcelain))
    $evidence = [ordered]@{
        commit = $commit
        workingTreeDirty = $dirty
        checkedAtUtc = [DateTimeOffset]::UtcNow.ToString("O")
        hostedPassed = $hostedOk
        localPassed = $localOk
        results = $results
    }
    $parent = Split-Path -Parent $EvidencePath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
}

if ($hostedOk -lt $RequiredHosted) {
    throw "Hosted provider requirement failed: $hostedOk/$RequiredHosted"
}
if ($RequireLocal -and $localOk -lt 1) {
    throw "Local provider requirement failed"
}
