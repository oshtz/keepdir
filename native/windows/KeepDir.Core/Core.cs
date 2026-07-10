using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace KeepDir.Core;

public static class KeepDirConstants
{
    public const string AutomationRulesKey = "automationRules";
    public const string QueueUnmatchedFilesKey = "queueUnmatchedFiles";
    public const string RuleAssistantSettingsKey = "ruleAssistantSettings";
    public const string KeychainService = "KeepDir Rule Assistant";
    public const string LatestReleaseUrl = "https://github.com/oshtz/keepdir/releases";
    public const string RuleAssistantPrompt = "Draft one or more KeepDir FileRule objects as JSON only. Return either one object or an array. Allowed keys: name, match.nameContains, match.extensionIn, match.sourceUrlContains, match.downloadedFromContains, action.targetFolder, action.targetNameTemplate, action.ask, stopOnMatch. Do not invent other keys. Use relative target folders. If the user asks to move or sort files, set action.targetFolder. Set action.ask true when the request is ambiguous.";
    public const long TerminalHistoryRetentionMs = 30L * 24 * 60 * 60 * 1000;
    public const int MaxRuleActionsPerWorkspace = 1_000;

    public static string DataDirectory(string? overrideDirectory = null)
    {
        var configured = overrideDirectory ?? Environment.GetEnvironmentVariable("KEEPDIR_DATA_DIR");
        return string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "com.oshtz.keepdir")
            : Path.GetFullPath(configured.Trim());
    }
}

public sealed class WatchFolder
{
    public string Id { get; set; } = "";
    public string Path { get; set; } = "";
    public bool Enabled { get; set; }
    public string? CreatedAt { get; set; }
    public bool Recursive { get; set; }
}

public sealed class RuleMatch
{
    public string? NameContains { get; set; }
    public List<string> ExtensionIn { get; set; } = [];
    public string? SourceUrlContains { get; set; }
    public string? DownloadedFromContains { get; set; }
}

public sealed class RuleActionConfig
{
    public string? TargetFolder { get; set; }
    public string? TargetNameTemplate { get; set; }
    public bool? Ask { get; set; }
}

public sealed class FileRule
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Enabled { get; set; }
    public long Order { get; set; }
    [JsonPropertyName("match")]
    public RuleMatch Match { get; set; } = new();
    public RuleActionConfig Action { get; set; } = new();
    public bool? StopOnMatch { get; set; } = true;
}

public sealed class DownloadMetadata
{
    public string? SourceUrl { get; set; }
    public string? DownloadedFrom { get; set; }
}

public sealed class RuleTraceItem
{
    public string RuleId { get; set; } = "";
    public string RuleName { get; set; } = "";
    public bool Matched { get; set; }
    public bool Uncertain { get; set; }
    public List<string> Reasons { get; set; } = [];
}

public sealed class RuleAction
{
    public string Id { get; set; } = "";
    public string WorkspaceId { get; set; } = "";
    public string FolderPath { get; set; } = "";
    public string FilePath { get; set; } = "";
    public string OriginalName { get; set; } = "";
    public string? TargetPath { get; set; }
    public string? TargetName { get; set; }
    public string? RuleId { get; set; }
    public string? RuleName { get; set; }
    public List<RuleTraceItem> RuleTrace { get; set; } = [];
    public string Status { get; set; } = "pending";
    public long FileSize { get; set; }
    public long FileMtimeMs { get; set; }
    public string? ErrorMessage { get; set; }
    public string? AppliedSourcePath { get; set; }
    public string? AppliedTargetPath { get; set; }
    public string CreatedAt { get; set; } = Clock.NowString();
    public string UpdatedAt { get; set; } = Clock.NowString();
}

public sealed class Store
{
    public JsonNode? Settings { get; set; } = new JsonObject();
    public Dictionary<string, Dictionary<string, JsonNode?>> WorkspaceSettings { get; set; } = [];
    public Dictionary<string, List<WatchFolder>> WatchFolders { get; set; } = [];
    public Dictionary<string, List<RuleAction>> RuleActions { get; set; } = [];
}

public readonly record struct FileSnapshot(long Size, long MtimeMs);

public static class JsonOptions
{
    public static readonly JsonSerializerOptions Default = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };
}

public static class Clock
{
    public static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    public static string NowString() => NowMs().ToString();
    public static string TodayUtc() => DateTimeOffset.UtcNow.ToString("yyyy-MM-dd");
}

public static class RuleEngine
{
    public static RuleAction EvaluateRuleAction(
        string id,
        string workspaceId,
        string folderPath,
        string filePath,
        FileSnapshot fileSnapshot,
        IReadOnlyList<FileRule> rules,
        DownloadMetadata metadata)
    {
        var originalName = Path.GetFileName(filePath);
        var extension = FileExtension(originalName);
        var trace = new List<RuleTraceItem>();
        var action = new RuleActionConfig();
        FileRule? matchedRule = null;
        string? uncertainReason = null;

        foreach (var rule in rules.Where(rule => rule.Enabled).OrderBy(rule => rule.Order))
        {
            var match = RuleMatches(rule, originalName, extension, metadata);
            trace.Add(new RuleTraceItem
            {
                RuleId = rule.Id,
                RuleName = rule.Name,
                Matched = match.Matched,
                Uncertain = match.Uncertain,
                Reasons = match.Reasons
            });
            if (!match.Matched)
            {
                continue;
            }

            matchedRule = rule;
            if (match.Uncertain)
            {
                uncertainReason = string.Join("; ", match.Reasons);
                break;
            }

            if (rule.Action.TargetFolder is not null)
            {
                action.TargetFolder = rule.Action.TargetFolder;
            }
            if (rule.Action.TargetNameTemplate is not null)
            {
                action.TargetNameTemplate = rule.Action.TargetNameTemplate;
            }
            if (rule.Action.Ask is not null)
            {
                action.Ask = rule.Action.Ask;
            }
            if (rule.StopOnMatch ?? true)
            {
                break;
            }
        }

        var timestamp = Clock.NowString();
        var row = new RuleAction
        {
            Id = id,
            WorkspaceId = workspaceId,
            FolderPath = folderPath,
            FilePath = filePath,
            OriginalName = originalName,
            RuleId = matchedRule?.Id,
            RuleName = matchedRule?.Name,
            RuleTrace = trace,
            Status = "pending",
            FileSize = fileSnapshot.Size,
            FileMtimeMs = fileSnapshot.MtimeMs,
            CreatedAt = timestamp,
            UpdatedAt = timestamp
        };

        if (matchedRule is null)
        {
            row.Status = "needs_review";
            row.ErrorMessage = "No rule matched";
            return row;
        }
        if (uncertainReason is not null)
        {
            row.Status = "needs_review";
            row.ErrorMessage = uncertainReason;
            return row;
        }
        if (action.Ask == true)
        {
            row.Status = "needs_review";
            row.ErrorMessage = "Rule is set to ask before acting";
            return row;
        }

        try
        {
            var (targetPath, targetName) = BuildTargetPath(folderPath, originalName, action);
            if (PathSafety.SamePath(filePath, targetPath))
            {
                row.Status = "needs_review";
                row.ErrorMessage = "Rule does not change this file";
            }
            else if (File.Exists(targetPath) || Directory.Exists(targetPath))
            {
                row.Status = "conflict";
                row.ErrorMessage = "Target already exists";
            }
            row.TargetPath = targetPath;
            row.TargetName = targetName;
        }
        catch (Exception error)
        {
            row.Status = "error";
            row.ErrorMessage = error.Message;
        }

        return row;
    }

    public static (bool Matched, bool Uncertain, List<string> Reasons) RuleMatches(
        FileRule rule,
        string originalName,
        string extension,
        DownloadMetadata metadata)
    {
        var reasons = new List<string>();

        if (!string.IsNullOrEmpty(rule.Match.NameContains))
        {
            var needle = rule.Match.NameContains;
            if (!IncludesCaseInsensitive(originalName, needle))
            {
                return (false, false, [$"name does not contain \"{needle}\""]);
            }
            reasons.Add($"name contains \"{needle}\"");
        }

        if (rule.Match.ExtensionIn.Count > 0)
        {
            var allowed = rule.Match.ExtensionIn
                .Select(item => item.TrimStart('.').ToLowerInvariant())
                .ToList();
            if (!allowed.Any(item => item == extension))
            {
                return (false, false, [$"extension is not {string.Join(", ", allowed)}"]);
            }
            reasons.Add($"extension is {(extension.Length == 0 ? "(none)" : extension)}");
        }

        if (!string.IsNullOrEmpty(rule.Match.SourceUrlContains))
        {
            var needle = rule.Match.SourceUrlContains;
            if (metadata.SourceUrl is string source && IncludesCaseInsensitive(source, needle))
            {
                reasons.Add($"source URL contains \"{needle}\"");
            }
            else if (metadata.SourceUrl is not null)
            {
                return (false, false, [$"source URL does not contain \"{needle}\""]);
            }
            else
            {
                return (true, true, ["source URL metadata unavailable"]);
            }
        }

        if (!string.IsNullOrEmpty(rule.Match.DownloadedFromContains))
        {
            var needle = rule.Match.DownloadedFromContains;
            if (metadata.DownloadedFrom is string source && IncludesCaseInsensitive(source, needle))
            {
                reasons.Add($"downloaded-from contains \"{needle}\"");
            }
            else if (metadata.DownloadedFrom is not null)
            {
                return (false, false, [$"downloaded-from does not contain \"{needle}\""]);
            }
            else
            {
                return (true, true, ["downloaded-from metadata unavailable"]);
            }
        }

        if (reasons.Count == 0)
        {
            reasons.Add("matched all files");
        }
        return (true, false, reasons);
    }

    public static string SafeFilename(string raw)
    {
        var name = new string(raw.Select(character =>
            char.IsControl(character) || character is '<' or '>' or ':' or '"' or '/' or '\\' or '|' or '?' or '*'
                ? '_'
                : character).ToArray())
            .Trim()
            .Trim('.')
            .ToString();

        if (name.Length == 0)
        {
            throw new InvalidOperationException("Target filename is empty after sanitizing");
        }

        if (WindowsReservedFilename(name))
        {
            var dot = name.IndexOf('.');
            name = dot >= 0 ? name.Insert(dot, "_") : name + "_";
        }
        return name;
    }

    public static string ExpandTemplate(string template, string originalName)
    {
        var extension = FileExtension(originalName);
        var basename = Path.GetFileNameWithoutExtension(originalName) ?? originalName;
        var date = Clock.TodayUtc();
        return SafeFilename(template
            .Replace("{name}", originalName)
            .Replace("{originalName}", originalName)
            .Replace("{basename}", basename)
            .Replace("{ext}", extension)
            .Replace("{date}", date));
    }

    public static string ExpandTargetFolderSegment(string raw)
    {
        var date = Clock.TodayUtc();
        return SafeFilename(raw
            .Replace("{date}", date)
            .Replace("{yyyy}", date[..4])
            .Replace("{mm}", date[5..7]));
    }

    public static string SafeTargetDir(string root, string? targetFolder)
    {
        var target = root;
        if (string.IsNullOrWhiteSpace(targetFolder))
        {
            return target;
        }
        if (Path.IsPathRooted(targetFolder))
        {
            throw new InvalidOperationException("Target folder must stay inside the watched folder");
        }
        foreach (var part in targetFolder.Split(['\\', '/'], StringSplitOptions.None))
        {
            if (part.Length == 0 || part == ".")
            {
                continue;
            }
            if (part == "..")
            {
                throw new InvalidOperationException("Target folder must stay inside the watched folder");
            }
            target = Path.Combine(target, ExpandTargetFolderSegment(part));
        }
        return target;
    }

    public static (string TargetPath, string TargetName) BuildTargetPath(
        string folderPath,
        string originalName,
        RuleActionConfig action)
    {
        var targetDir = SafeTargetDir(folderPath, action.TargetFolder);
        var targetName = !string.IsNullOrWhiteSpace(action.TargetNameTemplate)
            ? ExpandTemplate(action.TargetNameTemplate, originalName)
            : originalName;
        return (Path.Combine(targetDir, targetName), targetName);
    }

    public static string FileExtension(string name) =>
        (Path.GetExtension(name) ?? "").TrimStart('.').ToLowerInvariant();

    public static bool IncludesCaseInsensitive(string value, string needle) =>
        value.Contains(needle, StringComparison.OrdinalIgnoreCase);

    static bool WindowsReservedFilename(string name)
    {
        var stem = name.Split('.')[0].TrimEnd(' ').ToUpperInvariant();
        return stem is "CON" or "PRN" or "AUX" or "NUL"
            || (stem.Length == 4
                && (stem.StartsWith("COM", StringComparison.Ordinal) || stem.StartsWith("LPT", StringComparison.Ordinal))
                && stem[3] is >= '1' and <= '9');
    }
}

public static class MetadataReader
{
    public static DownloadMetadata ParseWindowsZoneIdentifier(string content)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in content.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var index = line.IndexOf('=');
            if (index >= 0)
            {
                values[line[..index].Trim()] = line[(index + 1)..].Trim();
            }
        }
        return new DownloadMetadata
        {
            SourceUrl = values.TryGetValue("HostUrl", out var host)
                ? host
                : values.TryGetValue("ReferrerUrl", out var referrer) ? referrer : null,
            DownloadedFrom = values.TryGetValue("AppName", out var app) ? app : null
        };
    }

    public static DownloadMetadata DownloadMetadataFromWhereFroms(IEnumerable<string> values)
    {
        var cleaned = values.Select(value => value.Trim()).Where(value => value.Length > 0).ToList();
        return new DownloadMetadata
        {
            SourceUrl = cleaned.FirstOrDefault(),
            DownloadedFrom = cleaned.Count == 0 ? null : string.Join(" ", cleaned)
        };
    }

    public static DownloadMetadata ReadDownloadMetadata(string filePath)
    {
        var streamPath = filePath + ":Zone.Identifier";
        if (!File.Exists(streamPath))
        {
            return new DownloadMetadata();
        }
        var bytes = File.ReadAllBytes(streamPath);
        var content = HasUtf16NullPair(bytes)
            ? Encoding.Unicode.GetString(bytes)
            : Encoding.UTF8.GetString(bytes);
        return ParseWindowsZoneIdentifier(content);
    }

    static bool HasUtf16NullPair(byte[] bytes)
    {
        for (var i = 0; i + 1 < bytes.Length; i++)
        {
            if (bytes[i] == 0 && bytes[i + 1] == 0)
            {
                return true;
            }
        }
        return false;
    }
}

public static class RuleAssistant
{
    static readonly Dictionary<string, RuleAssistantProviderConfig> Providers = new(StringComparer.Ordinal)
    {
        ["openai"] = new("OpenAI", "https://api.openai.com/v1", "gpt-5.4-mini"),
        ["google"] = new("Google Gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-3-flash-preview"),
        ["anthropic"] = new("Anthropic", "https://api.anthropic.com/v1", "claude-opus-4-8"),
        ["openrouter"] = new("OpenRouter", "https://openrouter.ai/api/v1", "openai/gpt-5.4-mini"),
        ["lmstudio"] = new("LM Studio", "http://localhost:1234/v1", "openai/gpt-oss-20b"),
        ["ollama"] = new("Ollama", "http://localhost:11434/v1", "gemma3")
    };

    public static IReadOnlyList<string> ProviderNames => Providers.Keys.ToList();

    public static void EnsureProvider(string provider)
    {
        if (!Providers.ContainsKey(provider))
        {
            throw new InvalidOperationException("Unknown rule assistant provider");
        }
    }

    public static RuleAssistantProviderConfig ProviderConfig(string provider)
    {
        EnsureProvider(provider);
        return Providers[provider];
    }

    public static string DefaultEndpoint(string provider) => ProviderConfig(provider).Endpoint;

    public static string DefaultModel(string provider) => ProviderConfig(provider).Model;

    public static string EndpointBase(string endpoint)
    {
        var value = endpoint.Trim().TrimEnd('/');
        if (value.Length == 0)
        {
            throw new InvalidOperationException("Rule assistant base URL is empty");
        }
        return value;
    }

    public static HttpRequestMessage BuildModelsRequest(string provider, string endpoint, string apiKey)
    {
        EnsureProvider(provider);
        var request = new HttpRequestMessage(HttpMethod.Get, $"{EndpointBase(endpoint)}/models");
        ApplyAuth(request, provider, apiKey);
        return request;
    }

    public static HttpRequestMessage BuildDraftRequest(string provider, string endpoint, string model, string description, string apiKey)
    {
        EnsureProvider(provider);
        endpoint = EndpointBase(endpoint);
        model = model.Trim();
        if (model.Length == 0)
        {
            throw new InvalidOperationException("Rule assistant model is empty");
        }
        if (description.Trim().Length == 0)
        {
            throw new InvalidOperationException("Rule description is empty");
        }

        object body;
        string url;
        if (provider == "anthropic")
        {
            url = $"{endpoint}/messages";
            body = new
            {
                model,
                max_tokens = 800,
                temperature = 0,
                system = KeepDirConstants.RuleAssistantPrompt,
                messages = new[] { new { role = "user", content = description } }
            };
        }
        else if (provider == "google")
        {
            model = model.StartsWith("models/", StringComparison.Ordinal) ? model["models/".Length..] : model;
            url = $"{endpoint}/models/{model}:generateContent";
            body = new
            {
                contents = new[]
                {
                    new
                    {
                        role = "user",
                        parts = new[] { new { text = $"{KeepDirConstants.RuleAssistantPrompt}\n\nUser request:\n{description}" } }
                    }
                },
                generationConfig = new { temperature = 0, responseMimeType = "application/json" }
            };
        }
        else
        {
            url = $"{endpoint}/chat/completions";
            body = new
            {
                model,
                temperature = 0,
                messages = new[]
                {
                    new { role = "system", content = KeepDirConstants.RuleAssistantPrompt },
                    new { role = "user", content = description }
                }
            };
        }

        var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions.Default), Encoding.UTF8, "application/json")
        };
        ApplyAuth(request, provider, apiKey);
        return request;
    }

    public static List<string> ExtractModelNames(string provider, JsonNode data)
    {
        var items = provider == "google"
            ? data["models"]?.AsArray()
            : (data["data"] as JsonArray) ?? data["models"]?.AsArray();
        if (items is null)
        {
            return [];
        }

        var names = new List<string>();
        foreach (var item in items)
        {
            if (item is null)
            {
                continue;
            }
            if (provider == "google" && item["supportedGenerationMethods"]?.AsArray().Any(method => method?.GetValue<string>() == "generateContent") != true)
            {
                continue;
            }
            var name = item["id"]?.GetValue<string>() ?? item["name"]?.GetValue<string>();
            name = name?.Trim();
            if (!string.IsNullOrEmpty(name))
            {
                names.Add(name.StartsWith("models/", StringComparison.Ordinal) ? name["models/".Length..] : name);
            }
        }
        return names.Distinct().Order().ToList();
    }

    public static string? ExtractAssistantContent(string provider, JsonNode data)
    {
        if (provider == "anthropic")
        {
            return data["content"]?.AsArray()
                .Select(item => item?["text"]?.GetValue<string>())
                .FirstOrDefault(text => text is not null);
        }
        if (provider == "google")
        {
            return data["candidates"]?[0]?["content"]?["parts"]?.AsArray()
                .Select(item => item?["text"]?.GetValue<string>())
                .FirstOrDefault(text => text is not null);
        }
        return data["choices"]?[0]?["message"]?["content"]?.GetValue<string>();
    }

    public static string AssistantErrorMessage(JsonNode data, string fallback)
    {
        var error = data["error"];
        if (error is JsonObject errorObject
            && errorObject["message"]?.GetValueKind() == JsonValueKind.String)
        {
            return errorObject["message"]!.GetValue<string>();
        }
        if (error?.GetValueKind() == JsonValueKind.String)
        {
            return error.GetValue<string>();
        }
        return fallback;
    }

    public static List<FileRule> ParseDraftedRules(string text, int startingOrder)
    {
        var node = ParseJsonValue(text);
        var items = node is JsonArray array
            ? array.ToList()
            : node is JsonObject obj && obj["rules"] is JsonArray rulesArray
                ? rulesArray.ToList()
                : [node];

        return items
            .Where(item => item is JsonObject)
            .Select((item, index) => NormalizeAssistantRule((JsonObject)item!, startingOrder + index, index))
            .ToList();
    }

    static void ApplyAuth(HttpRequestMessage request, string provider, string apiKey)
    {
        apiKey = apiKey.Trim();
        if (provider == "anthropic")
        {
            request.Headers.Add("anthropic-version", "2023-06-01");
            if (apiKey.Length > 0)
            {
                request.Headers.Add("x-api-key", apiKey);
            }
        }
        else if (provider == "google")
        {
            if (apiKey.Length > 0)
            {
                request.Headers.Add("x-goog-api-key", apiKey);
            }
        }
        else if (apiKey.Length > 0)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        }
    }

    static JsonNode ParseJsonValue(string text)
    {
        text = text.Trim();
        try
        {
            return JsonNode.Parse(text) ?? throw new InvalidOperationException("Rule assistant did not return JSON");
        }
        catch (JsonException)
        {
            var objectStart = text.IndexOf('{');
            var arrayStart = text.IndexOf('[');
            var useArray = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart);
            var start = useArray ? arrayStart : objectStart;
            var end = useArray ? text.LastIndexOf(']') : text.LastIndexOf('}');
            if (start >= 0 && end > start)
            {
                return JsonNode.Parse(text[start..(end + 1)]) ?? throw new InvalidOperationException("Rule assistant did not return JSON");
            }
            throw new InvalidOperationException("Rule assistant did not return JSON");
        }
    }

    static FileRule NormalizeAssistantRule(JsonObject raw, int order, int index)
    {
        var extensionValue = NestedValue(raw, "match", "extensionIn");
        var extensionIn = extensionValue is JsonArray extensions
            ? extensions.Select(CleanString).Where(item => item is not null).Select(item => item!.TrimStart('.').ToLowerInvariant()).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
            : ParseExtensions(CleanString(extensionValue) ?? "");

        return new FileRule
        {
            Id = $"rule-{Clock.NowMs()}-{index}",
            Name = CleanString(FindValueByLooseKey(raw, "name")) ?? "Drafted rule",
            Enabled = false,
            Order = order,
            Match = new RuleMatch
            {
                NameContains = CleanString(NestedValue(raw, "match", "nameContains")),
                ExtensionIn = extensionIn,
                SourceUrlContains = CleanString(NestedValue(raw, "match", "sourceUrlContains")),
                DownloadedFromContains = CleanString(NestedValue(raw, "match", "downloadedFromContains"))
            },
            Action = new RuleActionConfig
            {
                TargetFolder = CleanString(NestedValue(raw, "action", "targetFolder")),
                TargetNameTemplate = CleanString(NestedValue(raw, "action", "targetNameTemplate")),
                Ask = NestedValue(raw, "action", "ask")?.GetValueKind() == JsonValueKind.True
            },
            StopOnMatch = FindValueByLooseKey(raw, "stopOnMatch")?.GetValueKind() != JsonValueKind.False
        };
    }

    static List<string> ParseExtensions(string value) =>
        value.Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(item => item.TrimStart('.').ToLowerInvariant())
            .Where(item => item.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    static string? CleanString(JsonNode? value) =>
        value?.GetValueKind() == JsonValueKind.String && value.GetValue<string>().Trim() is { Length: > 0 } text
            ? text
            : null;

    static JsonNode? NestedValue(JsonObject raw, string section, string key)
    {
        if (FindValueByLooseKey(raw, section) is JsonObject sectionObject
            && FindValueByLooseKey(sectionObject, key) is { } direct)
        {
            return direct;
        }
        return FindValueByLooseKey(raw, $"{section}.{key}");
    }

    static JsonNode? FindValueByLooseKey(JsonObject raw, string key)
    {
        if (raw.TryGetPropertyValue(key, out var direct))
        {
            return direct;
        }

        var normalized = NormalizeLookupKey(key);
        foreach (var (candidate, value) in raw)
        {
            if (NormalizeLookupKey(candidate) == normalized)
            {
                return value;
            }
        }
        return null;
    }

    static string NormalizeLookupKey(string value) =>
        new(value.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());
}

public sealed record RuleAssistantProviderConfig(string Label, string Endpoint, string Model);

public static class RuleAssistantCredentialStore
{
    const uint CRED_TYPE_GENERIC = 1;
    const uint CRED_PERSIST_ENTERPRISE = 3;
    const int ERROR_NOT_FOUND = 1168;

    public static string TargetName(string provider)
    {
        RuleAssistant.EnsureProvider(provider);
        return $"{provider}.{KeepDirConstants.KeychainService}";
    }

    public static string ResolveApiKey(string provider, string apiKey)
    {
        apiKey = apiKey.Trim();
        return apiKey.Length > 0 ? apiKey : GetApiKey(provider) ?? "";
    }

    public static string? GetApiKey(string provider)
    {
        if (!CredReadW(TargetName(provider), CRED_TYPE_GENERIC, 0, out var credentialPtr))
        {
            var error = Marshal.GetLastWin32Error();
            if (error == ERROR_NOT_FOUND)
            {
                return null;
            }
            throw new Win32Exception(error);
        }

        try
        {
            var credential = Marshal.PtrToStructure<NativeCredential>(credentialPtr);
            if (credential.CredentialBlobSize == 0)
            {
                return "";
            }
            var bytes = new byte[credential.CredentialBlobSize];
            Marshal.Copy(credential.CredentialBlob, bytes, 0, bytes.Length);
            return Encoding.Unicode.GetString(bytes);
        }
        finally
        {
            CredFree(credentialPtr);
        }
    }

    public static void SaveApiKey(string provider, string apiKey)
    {
        apiKey = apiKey.Trim();
        if (apiKey.Length == 0)
        {
            DeleteApiKey(provider);
            return;
        }

        var bytes = Encoding.Unicode.GetBytes(apiKey);
        var blob = Marshal.AllocHGlobal(bytes.Length);
        try
        {
            Marshal.Copy(bytes, 0, blob, bytes.Length);
            var credential = new NativeCredential
            {
                Type = CRED_TYPE_GENERIC,
                TargetName = TargetName(provider),
                Comment = "keyring v3",
                CredentialBlobSize = (uint)bytes.Length,
                CredentialBlob = blob,
                Persist = CRED_PERSIST_ENTERPRISE,
                UserName = provider
            };
            if (!CredWriteW(ref credential, 0))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }
        }
        finally
        {
            Array.Clear(bytes);
            Marshal.FreeHGlobal(blob);
        }
    }

    public static void DeleteApiKey(string provider)
    {
        if (!CredDeleteW(TargetName(provider), CRED_TYPE_GENERIC, 0))
        {
            var error = Marshal.GetLastWin32Error();
            if (error != ERROR_NOT_FOUND)
            {
                throw new Win32Exception(error);
            }
        }
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CredWriteW(ref NativeCredential credential, uint flags);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CredDeleteW(string target, uint type, uint flags);

    [DllImport("advapi32.dll")]
    static extern void CredFree(IntPtr buffer);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct NativeCredential
    {
        public uint Flags;
        public uint Type;
        [MarshalAs(UnmanagedType.LPWStr)] public string? TargetName;
        [MarshalAs(UnmanagedType.LPWStr)] public string? Comment;
        public long LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        [MarshalAs(UnmanagedType.LPWStr)] public string? TargetAlias;
        [MarshalAs(UnmanagedType.LPWStr)] public string? UserName;
    }
}

public static class QueueEngine
{
    public static bool TerminalStatus(string status) =>
        status is "applied" or "skipped" or "stale" or "undone";

    public static bool CanUpdateRuleActionStatus(string current, string next) =>
        next == "skipped" && !TerminalStatus(current);

    public static FileSnapshot Snapshot(FileInfo file) =>
        new(file.Length, new DateTimeOffset(file.LastWriteTimeUtc).ToUnixTimeMilliseconds());

    public static string ActionDedupeKey(string filePath, FileSnapshot snapshot) =>
        $"{filePath}:{snapshot.Size}:{snapshot.MtimeMs}";

    public static string ActionId(string filePath, FileSnapshot snapshot)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(ActionDedupeKey(filePath, snapshot)));
        return $"rule-action-{Clock.NowMs()}-{Convert.ToHexString(hash)[..16].ToLowerInvariant()}";
    }

    public static bool QueueFile(Store store, string workspaceId, string folderPath, string filePath, FileSnapshot snapshot)
    {
        var actions = store.RuleActions.GetOrAdd(workspaceId);
        if (actions.Any(action => action.FilePath == filePath && action.FileSize == snapshot.Size && action.FileMtimeMs == snapshot.MtimeMs))
        {
            return false;
        }
        return PushRuleAction(store, workspaceId, folderPath, filePath, snapshot);
    }

    public static bool PushRuleAction(Store store, string workspaceId, string folderPath, string filePath, FileSnapshot snapshot)
    {
        var rules = NormalizedRules(store.WorkspaceSettings.GetValueOrDefault(workspaceId)?.GetValueOrDefault(KeepDirConstants.AutomationRulesKey));
        var row = RuleEngine.EvaluateRuleAction(
            ActionId(filePath, snapshot),
            workspaceId,
            folderPath,
            filePath,
            snapshot,
            rules,
            MetadataReader.ReadDownloadMetadata(filePath));

        if (row.RuleId is null
            && row.ErrorMessage == "No rule matched"
            && !WorkspaceBoolSetting(store, workspaceId, KeepDirConstants.QueueUnmatchedFilesKey))
        {
            return false;
        }

        store.RuleActions.GetOrAdd(workspaceId).Add(row);
        return true;
    }

    public static List<FileRule> NormalizedRules(JsonNode? value)
    {
        var rules = value?.Deserialize<List<FileRule>>(JsonOptions.Default) ?? [];
        return rules.OrderBy(rule => rule.Order).ToList();
    }

    public static HashSet<string> PruneRuleActions(Store store)
    {
        var cutoff = Clock.NowMs() - KeepDirConstants.TerminalHistoryRetentionMs;
        var changed = new HashSet<string>();

        foreach (var (workspaceId, actions) in store.RuleActions)
        {
            var before = actions.Count;
            actions.RemoveAll(action =>
                TerminalStatus(action.Status)
                && long.TryParse(action.UpdatedAt, out var updatedAt)
                && updatedAt < cutoff);

            var overflow = actions.Count - KeepDirConstants.MaxRuleActionsPerWorkspace;
            if (overflow > 0)
            {
                var remove = actions
                    .Select((action, index) => new { action, index })
                    .Where(item => TerminalStatus(item.action.Status))
                    .OrderBy(item => long.TryParse(item.action.UpdatedAt, out var updatedAt) ? updatedAt : long.MaxValue)
                    .Take(overflow)
                    .Select(item => item.index)
                    .ToHashSet();
                for (var index = actions.Count - 1; index >= 0; index--)
                {
                    if (remove.Contains(index))
                    {
                        actions.RemoveAt(index);
                    }
                }
            }

            if (actions.Count != before)
            {
                changed.Add(workspaceId);
            }
        }

        return changed;
    }

    public static void ApplyOne(RuleAction action)
    {
        if (action.TargetPath is null)
        {
            action.Status = "needs_review";
            action.ErrorMessage = "Action has no target path";
            action.UpdatedAt = Clock.NowString();
            throw new InvalidOperationException("Action has no target path");
        }
        if (action.Status != "pending")
        {
            throw new InvalidOperationException("Action is not ready to apply");
        }

        var filePath = action.FilePath;
        if (!SourceMatchesAction(action, filePath))
        {
            MarkStale(action);
            throw new InvalidOperationException("File changed since action was generated");
        }

        var targetPath = action.TargetPath;
        if (PathSafety.ContainsParentDir(targetPath) || !PathSafety.PathInside(action.FolderPath, targetPath))
        {
            MarkApplyError(action, "Target path must stay inside the watched folder");
        }
        if (PathSafety.SamePath(filePath, targetPath))
        {
            action.Status = "needs_review";
            action.ErrorMessage = "Rule does not change this file";
            action.UpdatedAt = Clock.NowString();
            throw new InvalidOperationException("Rule does not change this file");
        }
        if (File.Exists(targetPath) || Directory.Exists(targetPath))
        {
            action.Status = "conflict";
            action.ErrorMessage = "Target already exists";
            action.UpdatedAt = Clock.NowString();
            throw new InvalidOperationException("Target already exists");
        }

        var parent = Path.GetDirectoryName(targetPath);
        if (string.IsNullOrEmpty(parent))
        {
            MarkApplyError(action, "Target path has no parent directory");
        }
        try
        {
            PathSafety.RejectSymlinkAncestors(action.FolderPath, parent!);
        }
        catch (InvalidOperationException error)
        {
            MarkApplyError(action, error.Message);
        }
        Directory.CreateDirectory(parent!);
        MoveFileNoReplace(filePath, targetPath);

        action.Status = "applied";
        action.ErrorMessage = null;
        action.AppliedSourcePath = filePath;
        action.AppliedTargetPath = targetPath;
        action.UpdatedAt = Clock.NowString();
    }

    public static void UndoOne(RuleAction action)
    {
        if (action.Status != "applied")
        {
            throw new InvalidOperationException("Only applied actions can be undone");
        }

        var sourcePath = action.AppliedSourcePath ?? action.FilePath;
        var targetPath = action.AppliedTargetPath ?? action.TargetPath ?? throw new InvalidOperationException("Action has no applied target path");
        if (!PathSafety.PathInside(action.FolderPath, sourcePath) || !PathSafety.PathInside(action.FolderPath, targetPath))
        {
            action.ErrorMessage = "Undo path must stay inside the watched folder";
            action.UpdatedAt = Clock.NowString();
            throw new InvalidOperationException("Undo path must stay inside the watched folder");
        }
        if (File.Exists(sourcePath) || Directory.Exists(sourcePath))
        {
            action.ErrorMessage = "Original path already exists";
            action.UpdatedAt = Clock.NowString();
            throw new InvalidOperationException("Original path already exists");
        }
        if (!SourceMatchesAction(action, targetPath))
        {
            action.ErrorMessage = File.Exists(targetPath) ? "Moved file changed since apply" : "Moved file is missing";
            action.UpdatedAt = Clock.NowString();
            throw new InvalidOperationException(action.ErrorMessage);
        }

        var parent = Path.GetDirectoryName(sourcePath);
        if (string.IsNullOrEmpty(parent))
        {
            action.ErrorMessage = "Original path has no parent directory";
            action.UpdatedAt = Clock.NowString();
            throw new InvalidOperationException("Original path has no parent directory");
        }
        PathSafety.RejectSymlinkAncestors(action.FolderPath, parent);
        Directory.CreateDirectory(parent);
        MoveFileNoReplace(targetPath, sourcePath);

        action.Status = "undone";
        action.ErrorMessage = null;
        action.UpdatedAt = Clock.NowString();
    }

    public static void RetargetOne(RuleAction action, string targetName)
    {
        if (action.Status is "applied" or "undone" or "skipped")
        {
            throw new InvalidOperationException("Action target can only be changed before apply");
        }

        targetName = RuleEngine.SafeFilename(targetName);
        if (action.TargetPath is null)
        {
            throw new InvalidOperationException("Action has no target path");
        }

        var parent = Path.GetDirectoryName(action.TargetPath);
        if (string.IsNullOrEmpty(parent))
        {
            throw new InvalidOperationException("Target path has no parent directory");
        }
        if (!SourceMatchesAction(action, action.FilePath))
        {
            MarkStale(action);
            throw new InvalidOperationException("File changed since action was generated");
        }

        var targetPath = Path.Combine(parent, targetName);
        if (!PathSafety.PathInside(action.FolderPath, targetPath))
        {
            throw new InvalidOperationException("Target path must stay inside the watched folder");
        }
        PathSafety.RejectSymlinkAncestors(action.FolderPath, parent);

        action.TargetPath = targetPath;
        action.TargetName = targetName;
        if (PathSafety.SamePath(action.FilePath, targetPath))
        {
            action.Status = "needs_review";
            action.ErrorMessage = "Rule does not change this file";
        }
        else if (File.Exists(targetPath) || Directory.Exists(targetPath))
        {
            action.Status = "conflict";
            action.ErrorMessage = "Target already exists";
        }
        else
        {
            action.Status = "pending";
            action.ErrorMessage = null;
        }
        action.UpdatedAt = Clock.NowString();
    }

    public static bool RefreshMatchingRuleActions(Store store, string workspaceId, Func<RuleAction, bool> shouldRefresh)
    {
        var selected = store.RuleActions.GetValueOrDefault(workspaceId)?.Where(shouldRefresh).ToList() ?? [];
        if (selected.Count == 0)
        {
            return false;
        }

        var selectedIds = selected.Select(action => action.Id).ToHashSet();
        store.RuleActions.GetOrAdd(workspaceId).RemoveAll(action => selectedIds.Contains(action.Id));
        foreach (var action in selected)
        {
            if (IsRegularFile(action.FilePath))
            {
                PushRuleAction(store, workspaceId, action.FolderPath, action.FilePath, Snapshot(new FileInfo(action.FilePath)));
            }
            else
            {
                action.Status = "stale";
                action.ErrorMessage = "File changed since action was generated";
                action.UpdatedAt = Clock.NowString();
                store.RuleActions.GetOrAdd(workspaceId).Add(action);
            }
        }

        return true;
    }

    public static void MoveFileNoReplace(string from, string to) => File.Move(from, to, false);

    static bool WorkspaceBoolSetting(Store store, string workspaceId, string key)
    {
        var value = store.WorkspaceSettings.GetValueOrDefault(workspaceId)?.GetValueOrDefault(key);
        return value is not null && value.GetValueKind() == JsonValueKind.True;
    }

    static bool SourceMatchesAction(RuleAction action, string path)
    {
        if (!IsRegularFile(path))
        {
            return false;
        }
        var snapshot = Snapshot(new FileInfo(path));
        return snapshot.Size == action.FileSize && snapshot.MtimeMs == action.FileMtimeMs;
    }

    static bool IsRegularFile(string path)
    {
        if (!File.Exists(path))
        {
            return false;
        }
        var attributes = File.GetAttributes(path);
        return !attributes.HasFlag(FileAttributes.Directory) && !attributes.HasFlag(FileAttributes.ReparsePoint);
    }

    static void MarkStale(RuleAction action)
    {
        action.Status = "stale";
        action.ErrorMessage = "File changed since action was generated";
        action.UpdatedAt = Clock.NowString();
    }

    static void MarkApplyError(RuleAction action, string message)
    {
        action.Status = "error";
        action.ErrorMessage = message;
        action.UpdatedAt = Clock.NowString();
        throw new InvalidOperationException(message);
    }
}

public sealed class SeenFile
{
    public FileSnapshot Snapshot { get; set; }
    public bool Queued { get; set; }
}

public static class Scanner
{
    public static HashSet<string> ScanStore(Store store, Dictionary<string, SeenFile> seen)
    {
        var result = ScanPaths(store.WatchFolders, seen);
        return ApplyScanResult(store, result, markStaleActions: true);
    }

    static ScanResult ScanPaths(Dictionary<string, List<WatchFolder>> watchFolders, Dictionary<string, SeenFile> seen)
    {
        var result = new ScanResult();
        var currentKeys = new HashSet<string>();

        foreach (var (workspaceId, folders) in watchFolders)
        {
            foreach (var folder in folders.Where(folder => folder.Enabled))
            {
                ScanFolder(seen, currentKeys, result, workspaceId, folder.Path, folder.Path, folder.Recursive);
            }
        }

        foreach (var key in seen.Keys.Except(currentKeys).ToList())
        {
            seen.Remove(key);
        }
        return result;
    }

    static HashSet<string> ApplyScanResult(Store store, ScanResult result, bool markStaleActions)
    {
        var changed = new HashSet<string>();
        var actionKeys = store.RuleActions.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.Select(action => QueueEngine.ActionDedupeKey(action.FilePath, new FileSnapshot(action.FileSize, action.FileMtimeMs))).ToHashSet());

        foreach (var candidate in result.Candidates)
        {
            if (!WatchFolderEnabled(store, candidate.WorkspaceId, candidate.FolderPath))
            {
                continue;
            }
            var key = QueueEngine.ActionDedupeKey(candidate.FilePath, candidate.Snapshot);
            var workspaceKeys = actionKeys.GetOrAdd(candidate.WorkspaceId);
            if (workspaceKeys.Contains(key))
            {
                continue;
            }
            if (!QueueEngine.PushRuleAction(store, candidate.WorkspaceId, candidate.FolderPath, candidate.FilePath, candidate.Snapshot))
            {
                continue;
            }
            workspaceKeys.Add(key);
            changed.Add(candidate.WorkspaceId);
        }

        if (markStaleActions)
        {
            MarkOutOfScopeActionsStale(store, result.ActiveKeys, changed);
        }
        return changed;
    }

    static void ScanFolder(
        Dictionary<string, SeenFile> seen,
        HashSet<string> currentKeys,
        ScanResult result,
        string workspaceId,
        string folderPath,
        string currentPath,
        bool recursive)
    {
        if (!Directory.Exists(currentPath))
        {
            return;
        }

        foreach (var entry in Directory.EnumerateFileSystemEntries(currentPath))
        {
            var key = $"{workspaceId}:{entry}";
            currentKeys.Add(key);
            result.ActiveKeys.GetOrAdd(workspaceId).Add(key);

            var attributes = File.GetAttributes(entry);
            if (attributes.HasFlag(FileAttributes.ReparsePoint))
            {
                continue;
            }
            if (attributes.HasFlag(FileAttributes.Directory))
            {
                if (recursive)
                {
                    ScanFolder(seen, currentKeys, result, workspaceId, folderPath, entry, recursive);
                }
                continue;
            }

            var snapshot = QueueEngine.Snapshot(new FileInfo(entry));
            seen.TryGetValue(key, out var previous);
            var stable = previous?.Snapshot == snapshot;
            var queued = previous?.Queued == true;
            if (stable && !queued)
            {
                result.Candidates.Add(new QueueCandidate(workspaceId, folderPath, entry, snapshot));
            }
            seen[key] = new SeenFile { Snapshot = snapshot, Queued = stable };
        }
    }

    static bool WatchFolderEnabled(Store store, string workspaceId, string folderPath) =>
        store.WatchFolders.GetValueOrDefault(workspaceId)?.Any(folder => folder.Enabled && PathSafety.SamePath(folder.Path, folderPath)) == true;

    static void MarkOutOfScopeActionsStale(Store store, Dictionary<string, HashSet<string>> activeKeys, HashSet<string> changed)
    {
        foreach (var (workspaceId, actions) in store.RuleActions)
        {
            activeKeys.TryGetValue(workspaceId, out var keys);
            foreach (var action in actions)
            {
                if (QueueEngine.TerminalStatus(action.Status))
                {
                    continue;
                }
                var key = $"{workspaceId}:{action.FilePath}";
                if (keys?.Contains(key) == true || action.Status == "stale")
                {
                    continue;
                }
                action.Status = "stale";
                action.ErrorMessage = "File is no longer in the watched scope";
                action.UpdatedAt = Clock.NowString();
                changed.Add(workspaceId);
            }
        }
    }
}

public sealed record QueueCandidate(string WorkspaceId, string FolderPath, string FilePath, FileSnapshot Snapshot);

public sealed class ScanResult
{
    public Dictionary<string, HashSet<string>> ActiveKeys { get; } = [];
    public List<QueueCandidate> Candidates { get; } = [];
}

public sealed class StoreManager(string directory)
{
    readonly SemaphoreSlim _lock = new(1, 1);
    Store? _cache;

    public string StorePath
    {
        get
        {
            Directory.CreateDirectory(directory);
            return Path.Combine(directory, "keepdir.json");
        }
    }

    public async Task<Store> LoadAsync()
    {
        await _lock.WaitAsync();
        try
        {
            return await LoadUnlockedAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task SaveAsync(Store store)
    {
        await _lock.WaitAsync();
        try
        {
            QueueEngine.PruneRuleActions(store);
            var path = StorePath;
            var backup = Path.ChangeExtension(path, "json.bak");
            var tmp = Path.ChangeExtension(path, "json.tmp");
            await File.WriteAllTextAsync(tmp, JsonSerializer.Serialize(store, JsonOptions.Default));
            if (File.Exists(path))
            {
                File.Copy(path, backup, overwrite: true);
                File.Delete(path);
            }
            File.Move(tmp, path);
            _cache = store;
        }
        finally
        {
            _lock.Release();
        }
    }

    async Task<Store> LoadUnlockedAsync()
    {
        if (_cache is not null)
        {
            return _cache;
        }

        var path = StorePath;
        if (!File.Exists(path))
        {
            _cache = new Store();
            return _cache;
        }

        var text = await File.ReadAllTextAsync(path);
        try
        {
            _cache = JsonSerializer.Deserialize<Store>(text, JsonOptions.Default) ?? new Store();
            return _cache;
        }
        catch (JsonException error)
        {
            var backup = Path.ChangeExtension(path, "json.bak");
            if (!File.Exists(backup))
            {
                throw new InvalidOperationException(error.Message, error);
            }
            var backupText = await File.ReadAllTextAsync(backup);
            _cache = JsonSerializer.Deserialize<Store>(backupText, JsonOptions.Default) ?? new Store();
            return _cache;
        }
    }
}

public static class PathSafety
{
    public static bool SamePath(string first, string second) =>
        string.Equals(NormalizePath(first), NormalizePath(second), StringComparison.OrdinalIgnoreCase);

    public static bool PathInside(string root, string target)
    {
        var normalizedRoot = NormalizePath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var normalizedTarget = NormalizePath(target);
        return normalizedTarget.Equals(normalizedRoot, StringComparison.OrdinalIgnoreCase)
            || normalizedTarget.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            || normalizedTarget.StartsWith(normalizedRoot + Path.AltDirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    public static bool ContainsParentDir(string path) =>
        path.Split(['\\', '/'], StringSplitOptions.None).Any(part => part == "..");

    public static void RejectSymlinkAncestors(string root, string targetParent)
    {
        var fullRoot = Path.GetFullPath(root);
        var fullParent = Path.GetFullPath(targetParent);
        var relative = Path.GetRelativePath(fullRoot, fullParent);
        if (relative.StartsWith("..", StringComparison.Ordinal) || Path.IsPathRooted(relative))
        {
            throw new InvalidOperationException("Target parent must stay inside the watched folder");
        }

        var current = fullRoot;
        foreach (var part in relative.Split(['\\', '/'], StringSplitOptions.RemoveEmptyEntries))
        {
            if (part == ".")
            {
                continue;
            }
            current = Path.Combine(current, part);
            if (File.Exists(current) || Directory.Exists(current))
            {
                var attributes = File.GetAttributes(current);
                if (attributes.HasFlag(FileAttributes.ReparsePoint))
                {
                    throw new InvalidOperationException("Target directory resolves through a symlink");
                }
            }
        }
    }

    static string NormalizePath(string path) => Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
}

static class DictionaryExtensions
{
    public static TValue GetOrAdd<TKey, TValue>(this Dictionary<TKey, TValue> dictionary, TKey key)
        where TKey : notnull
        where TValue : new()
    {
        if (!dictionary.TryGetValue(key, out var value))
        {
            value = new TValue();
            dictionary[key] = value;
        }
        return value;
    }
}
