using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using KeepDir.Core;
using Microsoft.Win32;
using WinForms = System.Windows.Forms;

namespace KeepDir.App;

public partial class MainWindow : Window
{
    const string WorkspaceId = "default";
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string UiLayoutSettingsKey = "uiLayout";
    readonly StoreManager _storeManager = new(KeepDirConstants.DataDirectory());
    readonly Dictionary<string, SeenFile> _seen = [];
    readonly DispatcherTimer _scanTimer = new() { Interval = TimeSpan.FromSeconds(2) };
    readonly DispatcherTimer _eventScanTimer = new() { Interval = TimeSpan.FromMilliseconds(250) };
    readonly DispatcherTimer _stableScanTimer = new() { Interval = TimeSpan.FromMilliseconds(500) };
    readonly DispatcherTimer _ruleSaveTimer = new() { Interval = TimeSpan.FromMilliseconds(500) };
    readonly List<FileSystemWatcher> _watchers = [];
    Store _store = new();
    List<FileRule> _rules = [];
    bool _loaded;
    bool _scanning;
    bool _refreshingUi;
    bool _refreshingWatchUi;
    bool _refreshingAssistantUi;
    bool _refreshingRuleUi;
    string _watcherSignature = "";
    string? _latestReleaseUrl;

    public bool AllowQuit { get; set; }

    public MainWindow()
    {
        EnsureApplicationResources();
        InitializeComponent();
        AssistantProviderBox.ItemsSource = RuleAssistant.ProviderNames;
        _scanTimer.Tick += async (_, _) => await ScanAsync();
        _eventScanTimer.Tick += async (_, _) => await EventScanTimerTickAsync();
        _stableScanTimer.Tick += async (_, _) => await StableScanTimerTickAsync();
        _ruleSaveTimer.Tick += async (_, _) => await RuleSaveTimerTickAsync();
    }

    static void EnsureApplicationResources()
    {
        if (System.Windows.Application.Current is not null)
        {
            return;
        }

        var app = new App();
        app.InitializeComponent();
    }

    async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        if (_loaded)
        {
            return;
        }
        try
        {
            await LoadAsync();
            if (Environment.GetEnvironmentVariable("KEEPDIR_SMOKE_CONFLICT_CYCLE") == "1")
            {
                await RunPackagedSmokeConflictCycleAsync();
            }
        }
        catch when (Environment.GetEnvironmentVariable("KEEPDIR_SMOKE_CONFLICT_CYCLE") == "1")
        {
            System.Windows.Application.Current.Shutdown(1);
        }
    }

    async Task LoadAsync()
    {
        _store = await _storeManager.LoadAsync();
        RefreshUi();
        _loaded = true;
        _scanTimer.Start();
        _ = CheckUpdatesOncePerDayAsync();
    }

    internal void LoadStoreForTests(Store store)
    {
        _store = store;
        RefreshUi();
        _loaded = true;
    }

    internal void RefreshUiForTests() => RefreshUi();

    async Task RunPackagedSmokeConflictCycleAsync()
    {
        var action = AssertSingleConflict();
        QueueList.SelectedItem = action;
        RetargetNameBox.Text = SuggestedRetargetName(action);
        if (!RetargetSelectedInUi() || action.Status != "pending")
        {
            throw new InvalidOperationException("Packaged smoke could not retarget the conflict.");
        }
        if (!ApplySelectedInUi() || action.Status != "applied")
        {
            throw new InvalidOperationException("Packaged smoke could not apply the retargeted action.");
        }
        if (!UndoSelectedInUi() || action.Status != "undone")
        {
            throw new InvalidOperationException("Packaged smoke could not undo the applied action.");
        }
        await _storeManager.SaveAsync(_store);

        RuleAction AssertSingleConflict()
        {
            var conflicts = _store.RuleActions.GetValueOrDefault(WorkspaceId)?.Where(candidate => candidate.Status == "conflict").ToList() ?? [];
            return conflicts.Count == 1 ? conflicts[0] : throw new InvalidOperationException($"Packaged smoke expected one conflict, found {conflicts.Count}.");
        }
    }

    public async Task ApplyPendingAsync()
    {
        foreach (var action in _store.RuleActions.GetValueOrDefault(WorkspaceId)?.Where(action => action.Status == "pending") ?? [])
        {
            try
            {
                QueueEngine.ApplyOne(action);
            }
            catch
            {
                // Action status/error is already updated for user review.
            }
        }
        await SaveAndRefreshAsync();
    }

    async void WatchFolderEnabledCheck_Changed(object sender, RoutedEventArgs e)
    {
        if (!_loaded || _refreshingWatchUi)
        {
            return;
        }
        var folder = SelectedWatchFolder();
        if (folder is null)
        {
            return;
        }
        folder.Enabled = WatchFolderEnabledCheck.IsChecked == true;
        _seen.Clear();
        await SaveAndRefreshAsync();
    }

    async void WatchFolderRecursiveCheck_Changed(object sender, RoutedEventArgs e)
    {
        if (!_loaded || _refreshingWatchUi)
        {
            return;
        }
        var folder = SelectedWatchFolder();
        if (folder is null)
        {
            return;
        }
        folder.Recursive = WatchFolderRecursiveCheck.IsChecked == true;
        _seen.Clear();
        await SaveAndRefreshAsync();
    }

    async void RemoveWatchFolder_Click(object sender, RoutedEventArgs e)
    {
        var folder = SelectedWatchFolder();
        if (folder is null)
        {
            WatchFolderStatusText.Text = "Select a watched folder first.";
            return;
        }
        if (_store.WatchFolders.TryGetValue(WorkspaceId, out var folders))
        {
            folders.RemoveAll(item => item.Id == folder.Id);
        }
        _seen.Clear();
        WatchFolderStatusText.Text = "Removed watched folder.";
        await SaveAndRefreshAsync();
    }

    void WatchFoldersList_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        PopulateWatchFolderEditor(SelectedWatchFolder());
    }

    public bool IsStartupEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: false);
        return key?.GetValue("KeepDir") is string value && value.Length > 0;
    }

    public void ToggleStartup()
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey);
        if (IsStartupEnabled())
        {
            key.DeleteValue("KeepDir", throwOnMissingValue: false);
        }
        else
        {
            key.SetValue("KeepDir", StartupCommand(Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule?.FileName));
        }
        StartupCheck.IsChecked = IsStartupEnabled();
        RefreshTrayIfAvailable();
    }

    internal static string StartupCommand(string? executablePath)
    {
        var path = executablePath?.Trim().Trim('"') ?? "";
        return path.Length == 0 ? "" : $"\"{path}\"";
    }

    public void OpenLatestRelease()
    {
        Process.Start(new ProcessStartInfo(_latestReleaseUrl ?? KeepDirConstants.LatestReleaseUrl) { UseShellExecute = true });
    }

    async void AddFolder_Click(object sender, RoutedEventArgs e)
    {
        using var dialog = new WinForms.FolderBrowserDialog { Description = "Choose a folder for KeepDir to watch" };
        if (dialog.ShowDialog() != WinForms.DialogResult.OK)
        {
            return;
        }

        if (!_store.WatchFolders.TryGetValue(WorkspaceId, out var folders))
        {
            folders = [];
            _store.WatchFolders[WorkspaceId] = folders;
        }
        folders.Add(new WatchFolder
        {
            Id = $"watch-{Clock.NowMs()}",
            Path = dialog.SelectedPath,
            Enabled = true,
            CreatedAt = Clock.NowString()
        });
        _seen.Clear();
        await SaveAndRefreshAsync();
    }

    async void Refresh_Click(object sender, RoutedEventArgs e)
    {
        QueueEngine.RefreshMatchingRuleActions(_store, WorkspaceId, action => !QueueEngine.TerminalStatus(action.Status));
        await SaveAndRefreshAsync();
    }

    async void ApplyReady_Click(object sender, RoutedEventArgs e)
    {
        await ApplyPendingAsync();
    }

    void OpenDataFolder_Click(object sender, RoutedEventArgs e)
    {
        var directory = Path.GetDirectoryName(_storeManager.StorePath)!;
        Directory.CreateDirectory(directory);
        Process.Start(new ProcessStartInfo(directory) { UseShellExecute = true });
    }

    async void CheckUpdates_Click(object sender, RoutedEventArgs e)
    {
        await CheckUpdatesAsync();
    }

    void OpenLatestRelease_Click(object sender, RoutedEventArgs e)
    {
        OpenLatestRelease();
    }

    async void ApplySelected_Click(object sender, RoutedEventArgs e)
    {
        if (ApplySelectedInUi())
        {
            await SaveAndRefreshAsync();
        }
    }

    async void SkipSelected_Click(object sender, RoutedEventArgs e)
    {
        if (SkipSelectedInUi())
        {
            await SaveAndRefreshAsync();
        }
    }

    async void SkipVisible_Click(object sender, RoutedEventArgs e)
    {
        if (SkipVisibleInUi())
        {
            await SaveAndRefreshAsync();
        }
    }

    async void UndoSelected_Click(object sender, RoutedEventArgs e)
    {
        if (UndoSelectedInUi())
        {
            await SaveAndRefreshAsync();
        }
    }

    async void RefreshSelected_Click(object sender, RoutedEventArgs e)
    {
        var actions = SelectedActions();
        if (actions.Count == 0)
        {
            QueueStatusText.Text = "Select a queue row first.";
            return;
        }
        var selectedIds = actions.Select(action => action.Id).ToHashSet();
        QueueEngine.RefreshMatchingRuleActions(_store, WorkspaceId, candidate => selectedIds.Contains(candidate.Id));
        QueueStatusText.Text = actions.Count == 1 ? "Refreshed selected action." : $"Refreshed {actions.Count} selected actions.";
        await SaveAndRefreshAsync();
    }

    async void Retarget_Click(object sender, RoutedEventArgs e)
    {
        if (RetargetSelectedInUi())
        {
            await SaveAndRefreshAsync();
        }
    }

    void QueueList_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (SelectedAction() is { } action)
        {
            RetargetNameBox.Text = SuggestedRetargetName(action);
            QueueStatusText.Text = action.ErrorMessage ?? "";
        }
        UpdateQueueSelectAllState();
        UpdateQueueButtonState();
    }

    void QueueSelectAllCheck_Changed(object sender, RoutedEventArgs e)
    {
        if (_refreshingUi)
        {
            return;
        }
        if (QueueSelectAllCheck.IsChecked == true)
        {
            QueueList.SelectAll();
        }
        else if (QueueSelectAllCheck.IsChecked == false)
        {
            QueueList.UnselectAll();
        }
        UpdateQueueSelectAllState();
        UpdateQueueButtonState();
    }

    internal bool ApplySelectedInUi()
    {
        var actions = SelectedActions();
        if (actions.Count == 0)
        {
            QueueStatusText.Text = "Select a queue row first.";
            return false;
        }
        var applied = 0;
        try
        {
            foreach (var action in actions)
            {
                QueueEngine.ApplyOne(action);
                applied++;
            }
            QueueStatusText.Text = applied == 1 ? "Applied selected action." : $"Applied {applied} selected actions.";
        }
        catch (Exception error)
        {
            QueueStatusText.Text = applied > 0 ? $"Applied {applied}; {error.Message}" : error.Message;
        }
        return true;
    }

    internal bool UndoSelectedInUi()
    {
        var actions = SelectedActions();
        if (actions.Count == 0)
        {
            QueueStatusText.Text = "Select a queue row first.";
            return false;
        }
        var undone = 0;
        try
        {
            foreach (var action in actions)
            {
                QueueEngine.UndoOne(action);
                undone++;
            }
            QueueStatusText.Text = undone == 1 ? "Undone selected action." : $"Undone {undone} selected actions.";
        }
        catch (Exception error)
        {
            QueueStatusText.Text = undone > 0 ? $"Undone {undone}; {error.Message}" : error.Message;
        }
        return true;
    }

    internal bool SkipSelectedInUi()
    {
        var actions = SelectedActions();
        if (actions.Count == 0)
        {
            QueueStatusText.Text = "Select a queue row first.";
            return false;
        }
        var terminal = actions.FirstOrDefault(action => !QueueEngine.CanUpdateRuleActionStatus(action.Status, "skipped"));
        if (terminal is not null)
        {
            QueueStatusText.Text = $"Cannot skip {terminal.Status}.";
            return false;
        }
        foreach (var action in actions)
        {
            action.Status = "skipped";
            action.ErrorMessage = null;
            action.UpdatedAt = Clock.NowString();
        }
        QueueStatusText.Text = actions.Count == 1 ? "Skipped selected action." : $"Skipped {actions.Count} selected actions.";
        return true;
    }

    internal bool RetargetSelectedInUi()
    {
        var action = SelectedAction();
        if (action is null)
        {
            QueueStatusText.Text = "Select a queue row first.";
            return false;
        }
        try
        {
            QueueEngine.RetargetOne(action, RetargetNameBox.Text);
            QueueStatusText.Text = "Updated target name.";
        }
        catch (Exception error)
        {
            QueueStatusText.Text = error.Message;
        }
        return true;
    }

    internal bool SkipVisibleInUi()
    {
        var actions = FilteredQueueActions();
        if (actions.Count == 0)
        {
            QueueStatusText.Text = "No visible actions to skip.";
            return false;
        }
        var terminal = actions.FirstOrDefault(action => QueueEngine.TerminalStatus(action.Status));
        if (terminal is not null)
        {
            QueueStatusText.Text = $"Cannot skip {terminal.Status}.";
            return false;
        }

        foreach (var action in actions)
        {
            action.Status = "skipped";
            action.ErrorMessage = null;
            action.UpdatedAt = Clock.NowString();
        }
        QueueStatusText.Text = actions.Count == 1 ? "Skipped 1 visible action." : $"Skipped {actions.Count} visible actions.";
        return true;
    }

    void QueueFilterBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (_loaded && !_refreshingUi)
        {
            RefreshUi();
        }
    }

    void QueueFilterChip_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement { Tag: string tag })
        {
            return;
        }

        for (var i = 0; i < QueueFilterBox.Items.Count; i++)
        {
            if (QueueFilterBox.Items[i] is System.Windows.Controls.ComboBoxItem item && Equals(item.Tag, tag))
            {
                QueueFilterBox.SelectedIndex = i;
                break;
            }
        }
    }

    void Minimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    void MaximizeRestore_Click(object sender, RoutedEventArgs e) =>
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;

    void CloseWindow_Click(object sender, RoutedEventArgs e) => Close();

    void QueueHistoryCheck_Changed(object sender, RoutedEventArgs e)
    {
        if (_loaded && !_refreshingUi)
        {
            RefreshUi();
        }
    }

    void StartupCheck_Changed(object sender, RoutedEventArgs e)
    {
        if (_loaded && StartupCheck.IsChecked != IsStartupEnabled())
        {
            ToggleStartup();
        }
    }

    async void ThemeButton_Click(object sender, RoutedEventArgs e)
    {
        if (!_loaded || _refreshingUi)
        {
            return;
        }

        var currentTheme = (_store.Settings as JsonObject)?["theme"]?.GetValue<string>() ?? "light";
        var theme = currentTheme == "dark" ? "light" : "dark";
        ApplyTheme(theme);
        if (_store.Settings is not JsonObject settings)
        {
            settings = [];
            _store.Settings = settings;
        }
        settings["theme"] = theme;
        await SaveAndRefreshAsync();
    }

    async void QueueUnmatchedCheck_Changed(object sender, RoutedEventArgs e)
    {
        if (!_loaded || _refreshingUi)
        {
            return;
        }

        WorkspaceSettings()[KeepDirConstants.QueueUnmatchedFilesKey] = JsonValue.Create(QueueUnmatchedCheck.IsChecked == true);
        await SaveAndRefreshAsync();
    }

    async void AssistantProviderBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (!_loaded || _refreshingAssistantUi)
        {
            return;
        }

        var provider = SelectedAssistantProvider();
        AssistantEndpointBox.Text = RuleAssistant.DefaultEndpoint(provider);
        AssistantModelBox.Text = RuleAssistant.DefaultModel(provider);
        AssistantModelBox.ItemsSource = null;
        LoadAssistantKey(provider);
        await SaveAssistantSettingsAsync();
    }

    async void AssistantSettings_LostFocus(object sender, RoutedEventArgs e)
    {
        if (_loaded && !_refreshingAssistantUi)
        {
            await SaveAssistantSettingsAsync();
        }
    }

    void AssistantApiKeyBox_LostFocus(object sender, RoutedEventArgs e)
    {
        if (!_loaded || _refreshingAssistantUi)
        {
            return;
        }
        SaveAssistantKey();
    }

    void ForgetAssistantKey_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            RuleAssistantCredentialStore.DeleteApiKey(SelectedAssistantProvider());
            AssistantApiKeyBox.Password = "";
            AssistantStatusText.Text = "Key forgotten.";
        }
        catch (Exception error)
        {
            AssistantStatusText.Text = error.Message;
        }
    }

    async void LoadAssistantModels_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            SaveAssistantKey();
            await SaveAssistantSettingsAsync();
            AssistantStatusText.Text = "Loading models...";
            var provider = SelectedAssistantProvider();
            using var request = RuleAssistant.BuildModelsRequest(
                provider,
                AssistantEndpointBox.Text,
                RuleAssistantCredentialStore.ResolveApiKey(provider, AssistantApiKeyBox.Password));
            var data = await SendAssistantRequestAsync(request);
            var models = RuleAssistant.ExtractModelNames(provider, data);
            AssistantModelBox.ItemsSource = models;
            if (string.IsNullOrWhiteSpace(AssistantModelBox.Text) && models.Count > 0)
            {
                AssistantModelBox.Text = models[0];
                await SaveAssistantSettingsAsync();
            }
            AssistantStatusText.Text = models.Count == 0 ? "No models returned." : $"Loaded {models.Count} model(s).";
        }
        catch (Exception error)
        {
            AssistantStatusText.Text = error.Message;
        }
    }

    async void DraftRule_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            SaveAssistantKey();
            await SaveAssistantSettingsAsync();
            AssistantStatusText.Text = "Drafting...";
            var provider = SelectedAssistantProvider();
            using var request = RuleAssistant.BuildDraftRequest(
                provider,
                AssistantEndpointBox.Text,
                AssistantModelBox.Text,
                AssistantDescriptionBox.Text,
                RuleAssistantCredentialStore.ResolveApiKey(provider, AssistantApiKeyBox.Password));
            var data = await SendAssistantRequestAsync(request);
            var content = RuleAssistant.ExtractAssistantContent(provider, data)
                ?? throw new InvalidOperationException("Rule assistant returned no content");
            var drafted = RuleAssistant.ParseDraftedRules(content, _rules.Count);
            if (drafted.Count == 0)
            {
                throw new InvalidOperationException("Rule assistant returned no rules");
            }

            _rules.AddRange(drafted);
            await SaveRulesAsync(drafted.Last().Id);
            AssistantStatusText.Text = drafted.Count == 1
                ? "Drafted 1 disabled rule."
                : $"Drafted {drafted.Count} disabled rules.";
        }
        catch (Exception error)
        {
            AssistantStatusText.Text = error.Message;
        }
    }

    void BrowseRuleTestFile_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new Microsoft.Win32.OpenFileDialog { Title = "Choose a file to test against rules" };
        if (dialog.ShowDialog(this) == true)
        {
            RuleTestFileBox.Text = dialog.FileName;
        }
    }

    void TestRules_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var filePath = RuleTestFileBox.Text.Trim();
            if (!File.Exists(filePath))
            {
                RuleTestStatusText.Text = "Choose an existing file.";
                return;
            }

            var root = SelectedWatchFolder()?.Path;
            if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root) || !PathSafety.PathInside(root, filePath))
            {
                root = Path.GetDirectoryName(filePath)!;
            }

            var action = RuleEngine.EvaluateRuleAction(
                "rule-test",
                WorkspaceId,
                root,
                filePath,
                QueueEngine.Snapshot(new FileInfo(filePath)),
                _rules,
                MetadataReader.ReadDownloadMetadata(filePath));

            var target = action.TargetPath is null ? action.OriginalName : Path.GetRelativePath(root, action.TargetPath);
            RuleTestStatusText.Text = $"{action.Status}: {target}"
                + (string.IsNullOrWhiteSpace(action.RuleName) ? "" : $" via {action.RuleName}")
                + (string.IsNullOrWhiteSpace(action.ErrorMessage) ? "" : $" - {action.ErrorMessage}");
        }
        catch (Exception error)
        {
            RuleTestStatusText.Text = error.Message;
        }
    }

    void RulesList_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        PopulateRuleEditor(SelectedRule());
    }

    void RuleEditor_Changed(object sender, RoutedEventArgs e)
    {
        if (!_loaded || _refreshingRuleUi)
        {
            return;
        }
        _ruleSaveTimer.Stop();
        _ruleSaveTimer.Start();
        RuleStatusText.Text = "Saving...";
    }

    async Task RuleSaveTimerTickAsync()
    {
        _ruleSaveTimer.Stop();
        await SaveSelectedRuleFromEditorAsync();
    }

    void NewRule_Click(object sender, RoutedEventArgs e)
    {
        var rule = new FileRule
        {
            Id = $"rule-{Clock.NowMs()}",
            Name = "New rule",
            Enabled = false,
            Order = _rules.Count,
            Match = new RuleMatch(),
            Action = new RuleActionConfig(),
            StopOnMatch = true
        };
        _rules.Add(rule);
        RulesList.ItemsSource = null;
        RulesList.ItemsSource = _rules;
        RulesList.SelectedItem = rule;
        RuleStatusText.Text = "Created draft rule. Save to persist.";
    }

    async void SaveRule_Click(object sender, RoutedEventArgs e)
    {
        _ruleSaveTimer.Stop();
        await SaveSelectedRuleFromEditorAsync();
    }

    async Task<bool> SaveSelectedRuleFromEditorAsync()
    {
        var rule = SelectedRule();
        if (rule is null)
        {
            RuleStatusText.Text = "Select or create a rule first.";
            return false;
        }

        rule.Name = string.IsNullOrWhiteSpace(RuleNameBox.Text) ? "Untitled rule" : RuleNameBox.Text.Trim();
        rule.Enabled = RuleEnabledCheck.IsChecked == true;
        rule.Match.NameContains = string.IsNullOrWhiteSpace(RuleNameContainsBox.Text) ? null : RuleNameContainsBox.Text.Trim();
        rule.Match.ExtensionIn = RuleExtensionBox.Text
            .Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(item => item.TrimStart('.'))
            .Where(item => item.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        rule.Match.SourceUrlContains = string.IsNullOrWhiteSpace(RuleSourceUrlBox.Text) ? null : RuleSourceUrlBox.Text.Trim();
        rule.Match.DownloadedFromContains = string.IsNullOrWhiteSpace(RuleDownloadedFromBox.Text) ? null : RuleDownloadedFromBox.Text.Trim();
        rule.Action.TargetFolder = string.IsNullOrWhiteSpace(RuleTargetFolderBox.Text) ? null : RuleTargetFolderBox.Text.Trim();
        rule.Action.TargetNameTemplate = string.IsNullOrWhiteSpace(RuleTargetNameBox.Text) ? null : RuleTargetNameBox.Text.Trim();
        rule.Action.Ask = RuleAskCheck.IsChecked == true;
        rule.StopOnMatch = RuleStopCheck.IsChecked != false;

        await SaveRulesAsync(rule.Id);
        RuleStatusText.Text = "Saved rule.";
        return true;
    }

    async void DeleteRule_Click(object sender, RoutedEventArgs e)
    {
        var rule = SelectedRule();
        if (rule is null)
        {
            RuleStatusText.Text = "Select a rule first.";
            return;
        }

        _rules.RemoveAll(item => item.Id == rule.Id);
        for (var i = 0; i < _rules.Count; i++)
        {
            _rules[i].Order = i;
        }
        await SaveRulesAsync(_rules.FirstOrDefault()?.Id);
        RuleStatusText.Text = "Deleted rule.";
    }

    async void DuplicateRule_Click(object sender, RoutedEventArgs e)
    {
        var rule = SelectedRule();
        if (rule is null)
        {
            RuleStatusText.Text = "Select a rule first.";
            return;
        }

        var index = Math.Max(0, _rules.FindIndex(item => item.Id == rule.Id));
        var copy = new FileRule
        {
            Id = $"rule-{Clock.NowMs()}",
            Name = $"{rule.Name} copy",
            Enabled = false,
            Order = index + 1,
            Match = new RuleMatch
            {
                NameContains = rule.Match.NameContains,
                ExtensionIn = [.. rule.Match.ExtensionIn],
                SourceUrlContains = rule.Match.SourceUrlContains,
                DownloadedFromContains = rule.Match.DownloadedFromContains
            },
            Action = new RuleActionConfig
            {
                TargetFolder = rule.Action.TargetFolder,
                TargetNameTemplate = rule.Action.TargetNameTemplate,
                Ask = rule.Action.Ask
            },
            StopOnMatch = rule.StopOnMatch
        };
        _rules.Insert(index + 1, copy);
        await SaveRulesAsync(copy.Id);
        RuleStatusText.Text = "Copied rule as a disabled draft.";
    }

    async void MoveRuleUp_Click(object sender, RoutedEventArgs e)
    {
        await MoveSelectedRuleAsync(-1);
    }

    async void MoveRuleDown_Click(object sender, RoutedEventArgs e)
    {
        await MoveSelectedRuleAsync(1);
    }

    async Task MoveSelectedRuleAsync(int delta)
    {
        var rule = SelectedRule();
        if (rule is null)
        {
            RuleStatusText.Text = "Select a rule first.";
            return;
        }

        var index = _rules.FindIndex(item => item.Id == rule.Id);
        var next = index + delta;
        if (index < 0 || next < 0 || next >= _rules.Count)
        {
            RuleStatusText.Text = "Rule is already at that edge.";
            return;
        }

        (_rules[index], _rules[next]) = (_rules[next], _rules[index]);
        await SaveRulesAsync(rule.Id);
        RuleStatusText.Text = "Reordered rule.";
    }

    void Window_Closing(object? sender, CancelEventArgs e)
    {
        CloseToTrayUnlessQuit(e);
    }

    internal void CloseToTrayUnlessQuit(CancelEventArgs e)
    {
        if (AllowQuit)
        {
            DisposeWatchers();
            return;
        }

        e.Cancel = true;
        Hide();
    }

    async Task SaveAndRefreshAsync()
    {
        await _storeManager.SaveAsync(_store);
        _store = await _storeManager.LoadAsync();
        RefreshUi();
    }

    async Task ScanAsync()
    {
        if (_scanning)
        {
            return;
        }

        _scanning = true;
        try
        {
            var changed = Scanner.ScanStore(_store, _seen);
            if (changed.Count > 0)
            {
                await SaveAndRefreshAsync();
            }
        }
        finally
        {
            _scanning = false;
        }
    }

    void RefreshUi()
    {
        _refreshingUi = true;
        try
        {
            var selectedId = SelectedAction()?.Id;
            var selectedRuleId = SelectedRule()?.Id;
            var selectedWatchId = SelectedWatchFolder()?.Id;
            var theme = (_store.Settings as JsonObject)?["theme"]?.GetValue<string>() ?? "light";
            ApplyTheme(theme);
            ApplyUiLayout();
            StorePathText.Text = _storeManager.StorePath;
            var watchFolders = _store.WatchFolders.GetValueOrDefault(WorkspaceId) ?? [];
            WatchFoldersList.ItemsSource = watchFolders;
            WatchFoldersList.SelectedItem = selectedWatchId is null ? watchFolders.FirstOrDefault() : watchFolders.FirstOrDefault(folder => folder.Id == selectedWatchId);
            var queueActions = FilteredQueueActions();
            QueueList.ItemsSource = queueActions;
            ApplyQueueGrouping();
            UpdateQueueEmptyState(queueActions);
            if (selectedId is not null)
            {
                QueueList.SelectedItem = queueActions.FirstOrDefault(action => action.Id == selectedId);
            }
            _rules = LoadRules();
            RulesList.ItemsSource = null;
            RulesList.ItemsSource = _rules;
            RulesList.SelectedItem = selectedRuleId is null ? _rules.FirstOrDefault() : _rules.FirstOrDefault(rule => rule.Id == selectedRuleId);
            UpdateDashboardMetrics(watchFolders);
            UpdateThemeButton(theme);
            StartupCheck.IsChecked = IsStartupEnabled();
            QueueUnmatchedCheck.IsChecked = WorkspaceBool(KeepDirConstants.QueueUnmatchedFilesKey);
            UpdateQueueSelectAllState();
            UpdateQueueButtonState();
            UpdateQueueFilterChips();
            RefreshTrayIfAvailable();
            RefreshWatchers();
            PopulateWatchFolderEditor(SelectedWatchFolder());
            PopulateAssistantSettings();
            PopulateRuleEditor(SelectedRule());
        }
        finally
        {
            _refreshingUi = false;
        }
    }

    int PendingCount() => _store.RuleActions.Values.SelectMany(actions => actions).Count(action => action.Status == "pending");

    int AttentionCount() => _store.RuleActions.Values
        .SelectMany(actions => actions)
        .Count(action => !QueueEngine.TerminalStatus(action.Status) && action.Status is "needs_review" or "conflict" or "error" or "stale");

    void UpdateDashboardMetrics(IReadOnlyCollection<WatchFolder> watchFolders)
    {
        var enabledFolders = watchFolders.Count(folder => folder.Enabled);
        var enabledRules = _rules.Count(rule => rule.Enabled);
        var ready = PendingCount();
        var attention = AttentionCount();
        var activeQueue = _store.RuleActions.Values.SelectMany(actions => actions).Count(action => !QueueEngine.TerminalStatus(action.Status));

        FoldersMetricText.Text = enabledFolders.ToString(CultureInfo.InvariantCulture);
        RulesMetricText.Text = enabledRules.ToString(CultureInfo.InvariantCulture);
        ReadyMetricText.Text = ready.ToString(CultureInfo.InvariantCulture);
        CheckMetricText.Text = attention.ToString(CultureInfo.InvariantCulture);
        EngineFoldersCountText.Text = watchFolders.Count.ToString(CultureInfo.InvariantCulture);
        EngineFoldersText.Text = enabledFolders == 1 ? "1 active" : $"{enabledFolders} active";
        EngineRulesCountText.Text = _rules.Count.ToString(CultureInfo.InvariantCulture);
        EngineRulesText.Text = enabledRules == 1 ? "1 enabled" : $"{enabledRules} enabled";
        PendingCountText.Text = ready.ToString(CultureInfo.InvariantCulture);
        EngineQueueText.Text = $"{ready} ready - {attention} flagged";
        QueueBadgeText.Text = activeQueue.ToString(CultureInfo.InvariantCulture);
    }

    RuleAction? SelectedAction() => QueueList.SelectedItem as RuleAction;

    List<RuleAction> SelectedActions() => QueueList.SelectedItems.Cast<RuleAction>().ToList();

    static string SuggestedRetargetName(RuleAction action)
    {
        var targetName = action.TargetName ?? action.OriginalName;
        if (action.Status != "conflict" || string.IsNullOrWhiteSpace(action.TargetPath))
        {
            return targetName;
        }

        var parent = Path.GetDirectoryName(action.TargetPath);
        if (string.IsNullOrEmpty(parent))
        {
            return targetName;
        }

        var stem = Path.GetFileNameWithoutExtension(targetName);
        var ext = Path.GetExtension(targetName);
        for (var index = 2; ; index++)
        {
            var candidate = $"{stem}-{index}{ext}";
            var path = Path.Combine(parent, candidate);
            if (!File.Exists(path) && !Directory.Exists(path))
            {
                return candidate;
            }
        }
    }

    void UpdateQueueSelectAllState()
    {
        var visible = QueueList.Items.Count;
        QueueSelectAllCheck.IsEnabled = visible > 0;
        QueueSelectAllCheck.IsChecked = visible > 0 && QueueList.SelectedItems.Count == visible
            ? true
            : QueueList.SelectedItems.Count == 0 ? false : null;
    }

    void UpdateQueueButtonState()
    {
        var visible = QueueList.Items.Cast<RuleAction>().ToList();
        var selected = SelectedActions();
        var hasSelection = selected.Count > 0;
        var canRetarget = selected.Count == 1 && selected[0].Status is not ("applied" or "undone" or "skipped");

        ApplyReadyButton.IsEnabled = PendingCount() > 0;
        ApplySelectedButton.IsEnabled = hasSelection && selected.All(action => action.Status == "pending");
        SkipSelectedButton.IsEnabled = hasSelection && selected.All(action => !QueueEngine.TerminalStatus(action.Status));
        UndoSelectedButton.IsEnabled = hasSelection && selected.All(action => action.Status == "applied");
        RefreshSelectedButton.IsEnabled = hasSelection;
        RetargetNameBox.IsEnabled = canRetarget;
        RetargetButton.IsEnabled = canRetarget;
        RetargetPanel.Visibility = canRetarget ? Visibility.Visible : Visibility.Collapsed;
        SkipVisibleButton.IsEnabled = visible.Count > 0 && visible.All(action => !QueueEngine.TerminalStatus(action.Status));
    }

    void UpdateQueueFilterChips()
    {
        var selected = SelectedQueueFilter();
        var active = _store.RuleActions.GetValueOrDefault(WorkspaceId)?.Where(action => QueueHistoryCheck.IsChecked == true || !QueueEngine.TerminalStatus(action.Status)).ToList() ?? [];
        QueueAllFilterButton.Content = $"ALL {active.Count}";
        QueueReadyFilterButton.Content = $"READY {active.Count(action => action.Status == "pending")}";
        QueueCheckFilterButton.Content = $"CHECK {active.Count(action => action.Status == "needs_review")}";
        QueueBlockedFilterButton.Content = $"BLOCKED {active.Count(action => action.Status is "conflict" or "error" or "stale")}";

        foreach (var button in new[] { QueueAllFilterButton, QueueReadyFilterButton, QueueCheckFilterButton, QueueBlockedFilterButton })
        {
            var isSelected = Equals(button.Tag, selected);
            button.IsChecked = isSelected;
            button.Background = (System.Windows.Media.Brush)FindResource(isSelected ? "KdSelectedChipBg" : "KdCard");
            button.Foreground = (System.Windows.Media.Brush)FindResource(isSelected ? "KdSelectedChipText" : "KdSecondary");
        }
    }

    void UpdateQueueEmptyState(IReadOnlyCollection<RuleAction> visible)
    {
        if (visible.Count > 0)
        {
            QueueEmptyText.Visibility = Visibility.Collapsed;
            return;
        }

        QueueEmptyText.Text = SelectedQueueFilter() switch
        {
            "ready" => "No ready files.",
            "check" => "No files need review.",
            "blocked" => "No blocked files.",
            _ when QueueHistoryCheck.IsChecked == true => "No queue history yet.",
            _ => "No active queue items."
        };
        QueueEmptyText.Visibility = Visibility.Visible;
    }

    void ApplyQueueGrouping()
    {
        var view = CollectionViewSource.GetDefaultView(QueueList.ItemsSource);
        view.GroupDescriptions.Clear();
        view.GroupDescriptions.Add(new PropertyGroupDescription(nameof(RuleAction.RuleName), new RuleActionGroupNameConverter()));
    }

    List<RuleAction> FilteredQueueActions()
    {
        IEnumerable<RuleAction> actions = _store.RuleActions.GetValueOrDefault(WorkspaceId) ?? [];
        if (QueueHistoryCheck.IsChecked != true)
        {
            actions = actions.Where(action => !QueueEngine.TerminalStatus(action.Status));
        }

        actions = SelectedQueueFilter() switch
        {
            "ready" => actions.Where(action => action.Status == "pending"),
            "check" => actions.Where(action => action.Status == "needs_review"),
            "blocked" => actions.Where(action => action.Status is "conflict" or "error" or "stale"),
            _ => actions
        };
        return actions
            .OrderBy(action => action.RuleName ?? "Unmatched", StringComparer.OrdinalIgnoreCase)
            .ThenBy(action => long.TryParse(action.CreatedAt, out var createdAt) ? createdAt : long.MaxValue)
            .ToList();
    }

    string SelectedQueueFilter() =>
        QueueFilterBox.SelectedItem is System.Windows.Controls.ComboBoxItem item
            && item.Tag is string tag
            ? tag
            : "all";

    FileRule? SelectedRule() => RulesList.SelectedItem as FileRule;

    WatchFolder? SelectedWatchFolder() => WatchFoldersList.SelectedItem as WatchFolder;

    string SelectedAssistantProvider() =>
        AssistantProviderBox.SelectedItem as string is { Length: > 0 } provider ? provider : "openai";

    public async Task CheckUpdatesAsync()
    {
        _latestReleaseUrl = KeepDirConstants.LatestReleaseUrl;
        UpdateStatusText.Text = "Releases: open GitHub Releases to check for updates.";
        OpenReleaseButton.IsEnabled = true;
        await MarkUpdateCheckedTodayAsync();
    }

    async Task CheckUpdatesOncePerDayAsync()
    {
        var settings = _store.Settings as JsonObject;
        if (!ShouldCheckUpdatesToday(settings))
        {
            return;
        }
        await CheckUpdatesAsync();
    }

    internal static bool ShouldCheckUpdatesToday(JsonObject? settings) =>
        settings?["lastUpdateCheckDate"]?.GetValue<string>() != Clock.TodayUtc();

    async Task MarkUpdateCheckedTodayAsync()
    {
        if (_store.Settings is not JsonObject settings)
        {
            settings = [];
            _store.Settings = settings;
        }
        settings["lastUpdateCheckDate"] = Clock.TodayUtc();
        await _storeManager.SaveAsync(_store);
    }

    void ApplyTheme(string theme)
    {
        var dark = theme == "dark";
        SetBrush("KdBg", dark ? "#0c0c0d" : "#f4f4f1");
        SetBrush("KdSurface", dark ? "#141416" : "#fbfbf6");
        SetBrush("KdElevated", dark ? "#1e1e22" : "#ecece4");
        SetBrush("KdCard", dark ? "#1a1a1d" : "#e9e9e1");
        SetBrush("KdHover", dark ? "#242428" : "#dfdfd5");
        SetBrush("KdAccentWash", dark ? "#253018" : "#eaf0d3");
        SetBrush("KdText", dark ? "#f4f4f2" : "#121211");
        SetBrush("KdSecondary", dark ? "#9c9c97" : "#6a6a64");
        SetBrush("KdSelectedChipBg", dark ? "#f4f4f2" : "#121211");
        SetBrush("KdSelectedChipText", dark ? "#101109" : "#f4f4f1");
        SetBrush("KdAccent", dark ? "#d4ff4f" : "#7c941f");
        SetBrush("KdAccentBorder", dark ? "#4DD4FF4F" : "#337C941F");
        SetBrush("KdAccentInk", "#101109");
        SetBrush("KdReadyRow", dark ? "#1d2317" : "#edf2de");
        SetBrush("KdDanger", "#ff5c5c");
        SetBrush("KdWarning", "#f5a623");
        SetBrush("KdInfo", "#60a5fa");
        SetBrush("KdBorder", dark ? "#17FFFFFF" : "#1A000000");
        SetBrush(System.Windows.SystemColors.WindowBrushKey, dark ? "#1e1e22" : "#fbfbf6");
        SetBrush(System.Windows.SystemColors.ControlBrushKey, dark ? "#1e1e22" : "#ecece4");
        SetBrush(System.Windows.SystemColors.ControlTextBrushKey, dark ? "#f4f4f2" : "#121211");
        SetBrush(System.Windows.SystemColors.WindowTextBrushKey, dark ? "#f4f4f2" : "#121211");
        SetBrush(System.Windows.SystemColors.HighlightBrushKey, dark ? "#253018" : "#eaf0d3");
        SetBrush(System.Windows.SystemColors.HighlightTextBrushKey, dark ? "#f4f4f2" : "#121211");
        UpdateThemeButton(theme);
        SetTitleBarTheme(dark);
    }

    void UpdateThemeButton(string theme)
    {
        var dark = theme == "dark";
        ThemeSunIcon.Visibility = dark ? Visibility.Visible : Visibility.Collapsed;
        ThemeMoonIcon.Visibility = dark ? Visibility.Collapsed : Visibility.Visible;
        ThemeButton.ToolTip = dark ? "Light mode" : "Dark mode";
    }

    void RefreshTrayIfAvailable()
    {
        if (System.Windows.Application.Current is App app)
        {
            app.RefreshTray(PendingCount());
        }
    }

    void SetBrush(string key, string color)
    {
        Resources[key] = new SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(color));
        if (System.Windows.Application.Current is { } app)
        {
            app.Resources[key] = Resources[key];
        }
    }

    void SetBrush(object key, string color)
    {
        Resources[key] = new SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(color));
        if (System.Windows.Application.Current is { } app)
        {
            app.Resources[key] = Resources[key];
        }
    }

    void SetTitleBarTheme(bool dark)
    {
        var handle = new WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero)
        {
            return;
        }
        var value = dark ? 1 : 0;
        _ = DwmSetWindowAttribute(handle, 20, ref value, sizeof(int));
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    async void UiLayout_Changed(object sender, RoutedEventArgs e) => await SaveUiLayoutAsync();

    async void LayoutSplitter_MouseLeftButtonUp(object sender, System.Windows.Input.MouseButtonEventArgs e) => await SaveUiLayoutAsync();

    async Task SaveUiLayoutAsync()
    {
        if (!_loaded || _refreshingUi)
        {
            return;
        }

        StoreSettings()[UiLayoutSettingsKey] = new JsonObject
        {
            ["leftPanelWidth"] = ColumnWidth(LeftPanelColumn),
            ["rightPanelWidth"] = ColumnWidth(RightPanelColumn),
            ["settingsExpanded"] = SettingsExpander.IsExpanded,
            ["assistantExpanded"] = AssistantExpander.IsExpanded,
            ["assistantSettingsExpanded"] = AssistantSettingsExpander.IsExpanded,
            ["tryFileExpanded"] = TryFileExpander.IsExpanded,
            ["rulesExpanded"] = RulesExpander.IsExpanded,
            ["editRuleExpanded"] = EditRuleExpander.IsExpanded
        };
        await _storeManager.SaveAsync(_store);
    }

    void ApplyUiLayout()
    {
        if ((_store.Settings as JsonObject)?[UiLayoutSettingsKey] is not JsonObject layout)
        {
            return;
        }

        RestoreColumnWidth(LeftPanelColumn, layout["leftPanelWidth"]);
        RestoreColumnWidth(RightPanelColumn, layout["rightPanelWidth"]);
        CenterPanelColumn.Width = new GridLength(1, GridUnitType.Star);
        RestoreExpanded(SettingsExpander, layout, "settingsExpanded");
        RestoreExpanded(AssistantExpander, layout, "assistantExpanded");
        RestoreExpanded(AssistantSettingsExpander, layout, "assistantSettingsExpanded");
        RestoreExpanded(TryFileExpander, layout, "tryFileExpanded");
        RestoreExpanded(RulesExpander, layout, "rulesExpanded");
        RestoreExpanded(EditRuleExpander, layout, "editRuleExpanded");
    }

    JsonObject StoreSettings()
    {
        if (_store.Settings is JsonObject settings)
        {
            return settings;
        }

        settings = [];
        _store.Settings = settings;
        return settings;
    }

    static double ColumnWidth(ColumnDefinition column) => column.ActualWidth > 0 ? column.ActualWidth : column.Width.Value;

    static void RestoreColumnWidth(ColumnDefinition column, JsonNode? value)
    {
        if (value is not JsonValue jsonValue)
        {
            return;
        }

        double? width = null;
        if (jsonValue.TryGetValue<double>(out var doubleWidth))
        {
            width = doubleWidth;
        }
        else if (jsonValue.TryGetValue<int>(out var intWidth))
        {
            width = intWidth;
        }
        else if (jsonValue.TryGetValue<long>(out var longWidth))
        {
            width = longWidth;
        }

        if (width >= column.MinWidth)
        {
            column.Width = new GridLength(width.Value);
        }
    }

    static void RestoreExpanded(Expander expander, JsonObject layout, string key)
    {
        var kind = layout[key]?.GetValueKind();
        if (kind == JsonValueKind.True)
        {
            expander.IsExpanded = true;
        }
        else if (kind == JsonValueKind.False)
        {
            expander.IsExpanded = false;
        }
    }

    List<FileRule> LoadRules() =>
        QueueEngine.NormalizedRules(_store.WorkspaceSettings.GetValueOrDefault(WorkspaceId)?.GetValueOrDefault(KeepDirConstants.AutomationRulesKey));

    Dictionary<string, JsonNode?> WorkspaceSettings()
    {
        if (!_store.WorkspaceSettings.TryGetValue(WorkspaceId, out var settings))
        {
            settings = [];
            _store.WorkspaceSettings[WorkspaceId] = settings;
        }
        return settings;
    }

    bool WorkspaceBool(string key) =>
        _store.WorkspaceSettings.GetValueOrDefault(WorkspaceId)?.GetValueOrDefault(key)?.GetValue<bool>() == true;

    async Task SaveRulesAsync(string? selectedRuleId)
    {
        for (var i = 0; i < _rules.Count; i++)
        {
            _rules[i].Order = i;
        }
        WorkspaceSettings()[KeepDirConstants.AutomationRulesKey] = JsonSerializer.SerializeToNode(_rules, JsonOptions.Default);
        QueueEngine.RefreshMatchingRuleActions(_store, WorkspaceId, action => !QueueEngine.TerminalStatus(action.Status));
        await SaveAndRefreshAsync();
        RulesList.SelectedItem = selectedRuleId is null ? null : _rules.FirstOrDefault(rule => rule.Id == selectedRuleId);
    }

    void PopulateRuleEditor(FileRule? rule)
    {
        _refreshingRuleUi = true;
        _ruleSaveTimer.Stop();
        try
        {
            RuleNameBox.Text = rule?.Name ?? "";
            RuleNameContainsBox.Text = rule?.Match.NameContains ?? "";
            RuleExtensionBox.Text = rule is null ? "" : string.Join(", ", rule.Match.ExtensionIn);
            RuleSourceUrlBox.Text = rule?.Match.SourceUrlContains ?? "";
            RuleDownloadedFromBox.Text = rule?.Match.DownloadedFromContains ?? "";
            RuleTargetFolderBox.Text = rule?.Action.TargetFolder ?? "";
            RuleTargetNameBox.Text = rule?.Action.TargetNameTemplate ?? "";
            RuleEnabledCheck.IsChecked = rule?.Enabled == true;
            RuleAskCheck.IsChecked = rule?.Action.Ask == true;
            RuleStopCheck.IsChecked = rule?.StopOnMatch != false;
        }
        finally
        {
            _refreshingRuleUi = false;
        }
    }

    void PopulateWatchFolderEditor(WatchFolder? folder)
    {
        _refreshingWatchUi = true;
        try
        {
            WatchFolderPathText.Text = folder?.Path ?? "";
            WatchFolderEnabledCheck.IsChecked = folder?.Enabled == true;
            WatchFolderRecursiveCheck.IsChecked = folder?.Recursive == true;
        }
        finally
        {
            _refreshingWatchUi = false;
        }
    }

    async Task EventScanTimerTickAsync()
    {
        _eventScanTimer.Stop();
        await ScanAsync();
        _stableScanTimer.Stop();
        _stableScanTimer.Start();
    }

    async Task StableScanTimerTickAsync()
    {
        _stableScanTimer.Stop();
        await ScanAsync();
    }

    void ScheduleEventScan()
    {
        if (!_loaded)
        {
            return;
        }
        _eventScanTimer.Stop();
        _eventScanTimer.Start();
    }

    void RefreshWatchers()
    {
        var folders = (_store.WatchFolders.GetValueOrDefault(WorkspaceId) ?? [])
            .Where(folder => folder.Enabled && Directory.Exists(folder.Path))
            .OrderBy(folder => folder.Path, StringComparer.OrdinalIgnoreCase)
            .ThenBy(folder => folder.Recursive)
            .ToList();
        var signature = string.Join("\n", folders.Select(folder => $"{folder.Path}|{folder.Recursive}"));
        if (signature == _watcherSignature)
        {
            return;
        }

        DisposeWatchers();
        _watcherSignature = signature;
        foreach (var folder in folders)
        {
            var watcher = new FileSystemWatcher(folder.Path)
            {
                IncludeSubdirectories = folder.Recursive,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.CreationTime
            };
            watcher.Created += WatcherChanged;
            watcher.Changed += WatcherChanged;
            watcher.Deleted += WatcherChanged;
            watcher.Renamed += WatcherChanged;
            watcher.Error += WatcherError;
            watcher.EnableRaisingEvents = true;
            _watchers.Add(watcher);
        }
    }

    void WatcherChanged(object sender, FileSystemEventArgs e)
    {
        Dispatcher.Invoke(ScheduleEventScan);
    }

    void WatcherError(object sender, ErrorEventArgs e)
    {
        Dispatcher.Invoke(async () =>
        {
            QueueStatusText.Text = "Watcher fell back to polling after a file event error.";
            await ScanAsync();
        });
    }

    void DisposeWatchers()
    {
        _eventScanTimer.Stop();
        _stableScanTimer.Stop();
        foreach (var watcher in _watchers)
        {
            watcher.Dispose();
        }
        _watchers.Clear();
        _watcherSignature = "";
    }

    void PopulateAssistantSettings()
    {
        _refreshingAssistantUi = true;
        try
        {
            var settings = _store.WorkspaceSettings
                .GetValueOrDefault(WorkspaceId)?
                .GetValueOrDefault(KeepDirConstants.RuleAssistantSettingsKey) as JsonObject;
            var provider = settings?["provider"]?.GetValue<string>() ?? "openai";
            try
            {
                RuleAssistant.EnsureProvider(provider);
            }
            catch
            {
                provider = "openai";
            }

            AssistantProviderBox.SelectedItem = provider;
            AssistantEndpointBox.Text = settings?["endpoint"]?.GetValue<string>() ?? RuleAssistant.DefaultEndpoint(provider);
            AssistantModelBox.Text = settings?["model"]?.GetValue<string>() ?? RuleAssistant.DefaultModel(provider);
            if (!_loaded)
            {
                LoadAssistantKey(provider);
            }
        }
        finally
        {
            _refreshingAssistantUi = false;
        }
    }

    async Task SaveAssistantSettingsAsync()
    {
        var provider = SelectedAssistantProvider();
        WorkspaceSettings()[KeepDirConstants.RuleAssistantSettingsKey] = new JsonObject
        {
            ["provider"] = provider,
            ["endpoint"] = string.IsNullOrWhiteSpace(AssistantEndpointBox.Text) ? RuleAssistant.DefaultEndpoint(provider) : AssistantEndpointBox.Text.Trim(),
            ["model"] = string.IsNullOrWhiteSpace(AssistantModelBox.Text) ? RuleAssistant.DefaultModel(provider) : AssistantModelBox.Text.Trim()
        };
        await _storeManager.SaveAsync(_store);
    }

    void LoadAssistantKey(string provider)
    {
        try
        {
            var saved = RuleAssistantCredentialStore.GetApiKey(provider);
            AssistantApiKeyBox.Password = saved ?? "";
            AssistantStatusText.Text = string.IsNullOrEmpty(saved) ? "No saved key." : "Key saved.";
        }
        catch (Exception error)
        {
            AssistantStatusText.Text = $"Key load failed: {error.Message}";
        }
    }

    void SaveAssistantKey()
    {
        try
        {
            RuleAssistantCredentialStore.SaveApiKey(SelectedAssistantProvider(), AssistantApiKeyBox.Password);
            AssistantStatusText.Text = string.IsNullOrWhiteSpace(AssistantApiKeyBox.Password) ? "Key cleared." : "Key saved.";
        }
        catch (Exception error)
        {
            AssistantStatusText.Text = error.Message;
        }
    }

    static async Task<JsonNode> SendAssistantRequestAsync(HttpRequestMessage request)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        using var response = await client.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        JsonNode data;
        try
        {
            data = JsonNode.Parse(text) ?? new JsonObject();
        }
        catch (JsonException)
        {
            data = new JsonObject { ["text"] = text };
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(RuleAssistant.AssistantErrorMessage(
                data,
                $"Rule assistant request failed: {(int)response.StatusCode} {response.ReasonPhrase}"));
        }
        return data;
    }
}

public sealed class RuleActionTooltipConverter : IValueConverter
{
    public object? Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is not RuleAction action)
        {
            return null;
        }

        var lines = new List<string>();
        if (!string.IsNullOrWhiteSpace(action.ErrorMessage))
        {
            lines.Add(action.ErrorMessage);
        }

        foreach (var item in action.RuleTrace)
        {
            var state = item.Uncertain ? "uncertain" : item.Matched ? "matched" : "not matched";
            var reasons = item.Reasons.Count == 0 ? "" : $": {string.Join("; ", item.Reasons)}";
            lines.Add($"{item.RuleName} - {state}{reasons}");
        }

        return lines.Count == 0 ? null : string.Join(Environment.NewLine, lines);
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class FileNameConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is string path && path.Length > 0 ? Path.GetFileName(path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)) : "";

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class RuleActionStatusLabelConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        (value as string) switch
        {
            "pending" => "ready",
            "needs_review" => "check",
            "conflict" => "blocked",
            "stale" => "warning",
            "error" => "danger",
            "applied" or "skipped" or "undone" => "history",
            var status => status ?? ""
        };

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class RuleActionGroupNameConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        string.IsNullOrWhiteSpace(value as string) ? "Unmatched" : value;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
