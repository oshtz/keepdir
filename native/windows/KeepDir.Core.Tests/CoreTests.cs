using System.Text.Json;
using System.Text.Json.Nodes;
using KeepDir.Core;

namespace KeepDir.Core.Tests;

public sealed class FixtureTests
{
    static readonly string FixtureRoot = Path.Combine(AppContext.BaseDirectory, "fixtures");

    [Fact]
    public void Data_directory_override_is_absolute_and_isolated()
    {
        var relative = Path.Combine("artifacts", "keepdir-test-data");
        Assert.Equal(Path.GetFullPath(relative), KeepDirConstants.DataDirectory(relative));
    }

    [Theory]
    [MemberData(nameof(RuleEvalCases))]
    public void Rule_eval_fixtures_match_expected(RuleEvalFixture fixture)
    {
        using var temp = new TempDir();
        var root = temp.Path;
        var filePath = Path.Combine(root, fixture.FileName);
        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
        File.WriteAllText(filePath, "a");

        foreach (var existing in fixture.ExistingTargets)
        {
            var path = Path.Combine(root, existing);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, "existing");
        }

        var action = RuleEngine.EvaluateRuleAction(
            "id",
            "default",
            root,
            filePath,
            QueueEngine.Snapshot(new FileInfo(filePath)),
            fixture.Rules,
            fixture.Metadata ?? new DownloadMetadata());

        Assert.Equal(fixture.Expected.Status, action.Status);
        Assert.Equal(fixture.Expected.RuleId, action.RuleId);
        Assert.Equal(fixture.Expected.RuleName, action.RuleName);
        Assert.Equal(ExpandExpected(fixture.Expected.TargetName), action.TargetName);
        Assert.Equal(ExpandExpected(fixture.Expected.ErrorMessage), action.ErrorMessage);
        if (fixture.Expected.TargetPathSuffix is not null)
        {
            Assert.EndsWith(
                ExpandExpected(fixture.Expected.TargetPathSuffix)!.Replace('\\', Path.DirectorySeparatorChar),
                action.TargetPath);
        }
        foreach (var expectedTrace in fixture.Expected.Trace)
        {
            var actual = Assert.Single(action.RuleTrace, item => item.RuleId == expectedTrace.RuleId);
            Assert.Equal(expectedTrace.Matched, actual.Matched);
            Assert.Equal(expectedTrace.Uncertain, actual.Uncertain);
            foreach (var reason in expectedTrace.Reasons)
            {
                Assert.Contains(reason, actual.Reasons);
            }
        }
    }

    [Theory]
    [MemberData(nameof(SanitizeCases))]
    public void Filename_sanitize_fixtures_match_expected(string input, string? output, string? error)
    {
        if (error is not null)
        {
            var actual = Assert.Throws<InvalidOperationException>(() => RuleEngine.SafeFilename(input));
            Assert.Equal(error, actual.Message);
            return;
        }

        Assert.Equal(output, RuleEngine.SafeFilename(input));
    }

    [Fact]
    public async Task Store_recovers_from_backup_and_round_trips_opaque_json()
    {
        using var temp = new TempDir();
        var manager = new StoreManager(temp.Path);
        var store = LoadFixture<Store>("store/valid-store.json");
        await manager.SaveAsync(store);

        var path = manager.StorePath;
        var backup = Path.ChangeExtension(path, "json.bak");
        File.Copy(path, backup, overwrite: true);
        await File.WriteAllTextAsync(path, "{ bad json");

        var recovered = await new StoreManager(temp.Path).LoadAsync();
        Assert.Equal("dark", recovered.Settings!["theme"]!.GetValue<string>());
        Assert.Equal("yes", recovered.WorkspaceSettings["default"]["opaque"]!["nested"]!.GetValue<string>());
    }

    [Fact]
    public void Existing_store_preserves_opaque_json_semantically_when_present()
    {
        var path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "com.oshtz.keepdir",
            "keepdir.json");
        if (!File.Exists(path))
        {
            return;
        }

        var originalText = File.ReadAllText(path);
        var store = JsonSerializer.Deserialize<Store>(originalText, JsonOptions.Default)!;
        var roundTripText = JsonSerializer.Serialize(store, JsonOptions.Default);
        var original = JsonNode.Parse(originalText)!;
        var roundTrip = JsonNode.Parse(roundTripText)!;

        Assert.True(JsonNode.DeepEquals(original["settings"], roundTrip["settings"]));
        Assert.True(JsonNode.DeepEquals(original["workspaceSettings"], roundTrip["workspaceSettings"]));
        Assert.Equal(original["watchFolders"]?.AsObject().Count, roundTrip["watchFolders"]?.AsObject().Count);
        Assert.Equal(original["ruleActions"]?.AsObject().Count, roundTrip["ruleActions"]?.AsObject().Count);
    }

    [Fact]
    public void Release_url_points_to_public_releases_page()
    {
        Assert.Equal("https://github.com/oshtz/keepdir/releases", KeepDirConstants.LatestReleaseUrl);
    }

    [Fact]
    public void Prune_drops_old_terminal_history_not_pending()
    {
        var store = LoadFixture<Store>("store/prune-store.json");
        var changed = QueueEngine.PruneRuleActions(store);

        Assert.Contains("default", changed);
        Assert.Equal(["recent", "pending"], store.RuleActions["default"].Select(action => action.Id));
    }

    public static IEnumerable<object[]> RuleEvalCases() =>
        Directory.EnumerateFiles(Path.Combine(FixtureRoot, "rule-eval"), "*.json")
            .Order()
            .Select(path => new object[] { LoadFixture<RuleEvalFixture>(path) });

    public static IEnumerable<object?[]> SanitizeCases()
    {
        var fixture = LoadFixture<SanitizeFixture>("filename-sanitize/cases.json");
        return fixture.Cases.Select(item => new object?[] { item.Input, item.Output, item.Error });
    }

    static T LoadFixture<T>(string path)
    {
        var fullPath = Path.IsPathRooted(path) ? path : Path.Combine(FixtureRoot, path);
        var json = File.ReadAllText(fullPath);
        return JsonSerializer.Deserialize<T>(json, JsonOptions.Default)!;
    }

    static string? ExpandExpected(string? value) => value?.Replace("{today}", Clock.TodayUtc());
}

public sealed class QueueTests
{
    [Fact]
    public void Apply_moves_pending_file_and_undo_moves_it_back()
    {
        using var temp = new TempDir();
        var source = Path.Combine(temp.Path, "invoice.pdf");
        var target = Path.Combine(temp.Path, "Documents", "invoice.pdf");
        File.WriteAllText(source, "a");
        var action = PendingAction(temp.Path, source, target);

        QueueEngine.ApplyOne(action);
        Assert.Equal("applied", action.Status);
        Assert.False(File.Exists(source));
        Assert.True(File.Exists(target));

        QueueEngine.UndoOne(action);
        Assert.Equal("undone", action.Status);
        Assert.True(File.Exists(source));
        Assert.False(File.Exists(target));
    }

    [Fact]
    public void Apply_marks_conflict_without_overwriting()
    {
        using var temp = new TempDir();
        var source = Path.Combine(temp.Path, "invoice.pdf");
        var target = Path.Combine(temp.Path, "Documents", "invoice.pdf");
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.WriteAllText(source, "a");
        File.WriteAllText(target, "existing");
        var action = PendingAction(temp.Path, source, target);

        var error = Assert.Throws<InvalidOperationException>(() => QueueEngine.ApplyOne(action));
        Assert.Equal("Target already exists", error.Message);
        Assert.Equal("conflict", action.Status);
        Assert.Equal("existing", File.ReadAllText(target));
        Assert.True(File.Exists(source));
    }

    [Fact]
    public void Apply_marks_stale_when_file_changed()
    {
        using var temp = new TempDir();
        var source = Path.Combine(temp.Path, "invoice.pdf");
        var target = Path.Combine(temp.Path, "Documents", "invoice.pdf");
        File.WriteAllText(source, "a");
        var action = PendingAction(temp.Path, source, target);
        File.WriteAllText(source, "changed");

        Assert.Throws<InvalidOperationException>(() => QueueEngine.ApplyOne(action));
        Assert.Equal("stale", action.Status);
        Assert.True(File.Exists(source));
        Assert.False(File.Exists(target));
    }

    [Fact]
    public void Retarget_changes_conflict_to_pending_when_name_is_free()
    {
        using var temp = new TempDir();
        var source = Path.Combine(temp.Path, "invoice.pdf");
        var target = Path.Combine(temp.Path, "Documents", "invoice.pdf");
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.WriteAllText(source, "a");
        File.WriteAllText(target, "existing");
        var action = PendingAction(temp.Path, source, target);
        action.Status = "conflict";
        action.ErrorMessage = "Target already exists";

        QueueEngine.RetargetOne(action, "invoice-2.pdf");
        Assert.Equal("pending", action.Status);
        Assert.Null(action.ErrorMessage);
        Assert.Equal("invoice-2.pdf", action.TargetName);
        Assert.EndsWith("invoice-2.pdf", action.TargetPath);
    }

    [Fact]
    public void Conflict_retarget_apply_undo_full_cycle()
    {
        using var temp = new TempDir();
        var source = Path.Combine(temp.Path, "invoice.pdf");
        var target = Path.Combine(temp.Path, "Documents", "invoice.pdf");
        var retargeted = Path.Combine(temp.Path, "Documents", "invoice-2.pdf");
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.WriteAllText(source, "a");
        File.WriteAllText(target, "existing");
        var action = PendingAction(temp.Path, source, target);

        Assert.Throws<InvalidOperationException>(() => QueueEngine.ApplyOne(action));
        Assert.Equal("conflict", action.Status);

        QueueEngine.RetargetOne(action, "invoice-2.pdf");
        QueueEngine.ApplyOne(action);
        Assert.Equal("applied", action.Status);
        Assert.False(File.Exists(source));
        Assert.True(File.Exists(retargeted));
        Assert.Equal("existing", File.ReadAllText(target));

        QueueEngine.UndoOne(action);
        Assert.Equal("undone", action.Status);
        Assert.True(File.Exists(source));
        Assert.False(File.Exists(retargeted));
        Assert.Equal("existing", File.ReadAllText(target));
    }

    [Fact]
    public void Apply_rejects_parent_dir_target()
    {
        using var temp = new TempDir();
        var source = Path.Combine(temp.Path, "invoice.pdf");
        var target = Path.Combine(temp.Path, "..", "outside", "invoice.pdf");
        File.WriteAllText(source, "a");
        var action = PendingAction(temp.Path, source, target);

        var error = Assert.Throws<InvalidOperationException>(() => QueueEngine.ApplyOne(action));
        Assert.Equal("Target path must stay inside the watched folder", error.Message);
        Assert.Equal("error", action.Status);
        Assert.True(File.Exists(source));
    }

    [Fact]
    public void Apply_rejects_symlink_target_directory_when_available()
    {
        using var temp = new TempDir();
        using var outside = new TempDir();
        var link = Path.Combine(temp.Path, "Linked");
        try
        {
            Directory.CreateSymbolicLink(link, outside.Path);
        }
        catch
        {
            return;
        }

        var source = Path.Combine(temp.Path, "invoice.pdf");
        var target = Path.Combine(link, "invoice.pdf");
        File.WriteAllText(source, "a");
        var action = PendingAction(temp.Path, source, target);

        var error = Assert.Throws<InvalidOperationException>(() => QueueEngine.ApplyOne(action));
        Assert.Equal("Target directory resolves through a symlink", error.Message);
        Assert.Equal("error", action.Status);
        Assert.True(File.Exists(source));
    }

    [Fact]
    public void Scanner_queues_only_after_file_is_stable()
    {
        using var temp = new TempDir();
        var source = Path.Combine(temp.Path, "invoice.pdf");
        File.WriteAllText(source, "a");
        var store = StoreWithRule(temp.Path);
        var seen = new Dictionary<string, SeenFile>();

        Assert.Empty(Scanner.ScanStore(store, seen));
        Assert.Equal(["default"], Scanner.ScanStore(store, seen));
        Assert.Single(store.RuleActions["default"]);
        Assert.Empty(Scanner.ScanStore(store, seen));
    }

    static Store StoreWithRule(string root)
    {
        var store = new Store();
        store.WatchFolders["default"] =
        [
            new WatchFolder { Id = "watch-1", Path = root, Enabled = true }
        ];
        store.WorkspaceSettings["default"] = new()
        {
            [KeepDirConstants.AutomationRulesKey] = JsonSerializer.SerializeToNode(new[] { Rule("pdf", "Documents") }, JsonOptions.Default)
        };
        return store;
    }

    static FileRule Rule(string extension, string target) => new()
    {
        Id = "rule-1",
        Name = "Docs",
        Enabled = true,
        Match = new RuleMatch { ExtensionIn = [extension] },
        Action = new RuleActionConfig { TargetFolder = target }
    };

    static RuleAction PendingAction(string root, string source, string target)
    {
        var snapshot = QueueEngine.Snapshot(new FileInfo(source));
        return new RuleAction
        {
            Id = "id",
            WorkspaceId = "default",
            FolderPath = root,
            FilePath = source,
            OriginalName = Path.GetFileName(source),
            TargetPath = target,
            TargetName = Path.GetFileName(target),
            RuleId = "rule-1",
            RuleName = "Docs",
            Status = "pending",
            FileSize = snapshot.Size,
            FileMtimeMs = snapshot.MtimeMs
        };
    }
}

public sealed class RuleAssistantTests
{
    [Fact]
    public void Rejects_unknown_provider()
    {
        Assert.Throws<InvalidOperationException>(() => RuleAssistant.EnsureProvider("not-a-provider"));
    }

    [Fact]
    public void Provides_defaults_and_keyring_compatible_windows_target_names()
    {
        Assert.Equal("https://api.openai.com/v1", RuleAssistant.DefaultEndpoint("openai"));
        Assert.Equal("gpt-5.4-mini", RuleAssistant.DefaultModel("openai"));
        Assert.Equal("openai.KeepDir Rule Assistant", RuleAssistantCredentialStore.TargetName("openai"));
    }

    [Fact]
    public async Task Builds_provider_specific_draft_requests()
    {
        using var anthropic = RuleAssistant.BuildDraftRequest("anthropic", "https://api.anthropic.com/", "claude", "sort pdfs", "key");
        Assert.Equal("https://api.anthropic.com/messages", anthropic.RequestUri!.ToString());
        Assert.Equal("2023-06-01", anthropic.Headers.GetValues("anthropic-version").Single());
        Assert.Equal("key", anthropic.Headers.GetValues("x-api-key").Single());
        Assert.Contains("\"max_tokens\": 800", await anthropic.Content!.ReadAsStringAsync());

        using var google = RuleAssistant.BuildDraftRequest("google", "https://generativelanguage.googleapis.com/v1beta", "models/gemini", "sort pdfs", "key");
        Assert.Equal("https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent", google.RequestUri!.ToString());
        Assert.Equal("key", google.Headers.GetValues("x-goog-api-key").Single());

        using var openai = RuleAssistant.BuildDraftRequest("openai", "https://api.openai.com/v1", "gpt", "sort pdfs", "key");
        Assert.Equal("https://api.openai.com/v1/chat/completions", openai.RequestUri!.ToString());
        Assert.Equal("Bearer", openai.Headers.Authorization!.Scheme);
        Assert.Equal("key", openai.Headers.Authorization.Parameter);

        using var lmStudio = RuleAssistant.BuildDraftRequest("lmstudio", "http://localhost:1234/v1", "local-model", "sort pdfs", "");
        Assert.Equal("http://localhost:1234/v1/chat/completions", lmStudio.RequestUri!.ToString());
        Assert.Null(lmStudio.Headers.Authorization);

        using var ollamaModels = RuleAssistant.BuildModelsRequest("ollama", "http://localhost:11434/v1/", "");
        Assert.Equal("http://localhost:11434/v1/models", ollamaModels.RequestUri!.ToString());
        Assert.Null(ollamaModels.Headers.Authorization);
    }

    [Fact]
    public void Extracts_model_names_and_content()
    {
        var googleModels = JsonNode.Parse("""
        {
          "models": [
            { "name": "models/gemini-pro", "supportedGenerationMethods": ["generateContent"] },
            { "name": "models/embed", "supportedGenerationMethods": ["embedContent"] }
          ]
        }
        """)!;
        Assert.Equal(["gemini-pro"], RuleAssistant.ExtractModelNames("google", googleModels));

        var openAiModels = JsonNode.Parse("""{ "data": [{ "id": "b" }, { "id": "a" }, { "id": "a" }] }""")!;
        Assert.Equal(["a", "b"], RuleAssistant.ExtractModelNames("openai", openAiModels));

        var anthropicContent = JsonNode.Parse("""{ "content": [{ "text": "[{\"name\":\"Docs\"}]" }] }""")!;
        Assert.Equal("[{\"name\":\"Docs\"}]", RuleAssistant.ExtractAssistantContent("anthropic", anthropicContent));
    }

    [Fact]
    public void Parses_assistant_drafted_rules_as_disabled_rules()
    {
        var rules = RuleAssistant.ParseDraftedRules("""
        Assistant draft:
        [
          {
            "name": "Docs",
            "match.extensionIn": "PDF jpg",
            "action": { "targetFolder": "Documents", "ask": true },
            "enabled": true,
            "stopOnMatch": false
          }
        ]
        """, 4);

        var rule = Assert.Single(rules);
        Assert.StartsWith("rule-", rule.Id);
        Assert.Equal("Docs", rule.Name);
        Assert.False(rule.Enabled);
        Assert.Equal(4, rule.Order);
        Assert.Equal(["pdf", "jpg"], rule.Match.ExtensionIn);
        Assert.Equal("Documents", rule.Action.TargetFolder);
        Assert.True(rule.Action.Ask);
        Assert.False(rule.StopOnMatch);
    }
}

public sealed class RuleEvalFixture
{
    public List<FileRule> Rules { get; set; } = [];
    public string FileName { get; set; } = "";
    public DownloadMetadata? Metadata { get; set; }
    public List<string> ExistingTargets { get; set; } = [];
    public ExpectedRuleAction Expected { get; set; } = new();
}

public sealed class ExpectedRuleAction
{
    public string Status { get; set; } = "";
    public string? TargetPathSuffix { get; set; }
    public string? TargetName { get; set; }
    public string? RuleId { get; set; }
    public string? RuleName { get; set; }
    public string? ErrorMessage { get; set; }
    public List<ExpectedTraceItem> Trace { get; set; } = [];
}

public sealed class ExpectedTraceItem
{
    public string RuleId { get; set; } = "";
    public bool Matched { get; set; }
    public bool Uncertain { get; set; }
    public List<string> Reasons { get; set; } = [];
}

public sealed class SanitizeFixture
{
    public List<SanitizeCase> Cases { get; set; } = [];
}

public sealed class SanitizeCase
{
    public string Input { get; set; } = "";
    public string? Output { get; set; }
    public string? Error { get; set; }
}

sealed class TempDir : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"keepdir-tests-{Environment.ProcessId}-{Guid.NewGuid():N}");

    public TempDir() => Directory.CreateDirectory(Path);

    public void Dispose()
    {
        if (Directory.Exists(Path))
        {
            Directory.Delete(Path, recursive: true);
        }
    }
}
