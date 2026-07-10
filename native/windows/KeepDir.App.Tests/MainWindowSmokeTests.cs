using System.IO;
using System.IO.Pipes;
using System.ComponentModel;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using KeepDir.Core;
using Button = System.Windows.Controls.Button;
using CheckBox = System.Windows.Controls.CheckBox;
using ComboBox = System.Windows.Controls.ComboBox;
using ListView = System.Windows.Controls.ListView;
using TextBox = System.Windows.Controls.TextBox;
using WinForms = System.Windows.Forms;

namespace KeepDir.App.Tests;

public sealed class MainWindowSmokeTests
{
    [Fact]
    public async Task Single_instance_ping_writes_show_message()
    {
        var pipeName = $"keepdir-test-{Guid.NewGuid():N}";
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        using var server = new NamedPipeServerStream(pipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        var read = Task.Run(async () =>
        {
            await server.WaitForConnectionAsync(cts.Token);
            using var reader = new StreamReader(server);
            return await reader.ReadLineAsync(cts.Token);
        }, cts.Token);

        await Task.Delay(50, cts.Token);
        App.PingExistingInstance(pipeName);
        Assert.Equal("show", await read.WaitAsync(TimeSpan.FromSeconds(2)));
    }

    [Fact]
    public void Tray_menu_matches_pending_and_startup_state()
    {
        var calls = new List<string>();
        using var empty = App.BuildTrayMenu(0, startupEnabled: false, () => calls.Add("apply"), () => calls.Add("startup"), () => calls.Add("updates"), () => calls.Add("show"), () => calls.Add("quit"));

        Assert.Equal(["Pending renames: 0", "Rename 0 pending files", "Open on startup", "Check for updates", "", "Show KeepDir", "Quit"], empty.Items.Cast<WinForms.ToolStripItem>().Select(item => item.Text));
        Assert.False(empty.Items[0].Enabled);
        Assert.False(empty.Items[1].Enabled);
        Assert.False(Assert.IsType<WinForms.ToolStripMenuItem>(empty.Items[2]).Checked);

        using var pending = App.BuildTrayMenu(2, startupEnabled: true, () => calls.Add("apply"), () => calls.Add("startup"), () => calls.Add("updates"), () => calls.Add("show"), () => calls.Add("quit"));

        Assert.Equal("Rename 2 pending files", pending.Items[1].Text);
        Assert.True(pending.Items[1].Enabled);
        Assert.True(Assert.IsType<WinForms.ToolStripMenuItem>(pending.Items[2]).Checked);
        Assert.IsType<WinForms.ToolStripSeparator>(pending.Items[4]);
        Assert.Empty(calls);

        using var single = App.BuildTrayMenu(1, startupEnabled: false, () => calls.Add("apply"), () => calls.Add("startup"), () => calls.Add("updates"), () => calls.Add("show"), () => calls.Add("quit"));
        Assert.Equal("Rename 1 pending file", single.Items[1].Text);
        Assert.Equal("KeepDir - 1 pending renames", App.TrayTooltip(1));
        Assert.False(App.ShouldNotifyPending(null, 2));
        Assert.True(App.ShouldNotifyPending(0, 2));
        Assert.False(App.ShouldNotifyPending(2, 3));
    }

    [Fact]
    public void Update_check_runs_at_most_once_per_utc_day()
    {
        Assert.True(MainWindow.ShouldCheckUpdatesToday(null));
        Assert.True(MainWindow.ShouldCheckUpdatesToday(new JsonObject { ["lastUpdateCheckDate"] = "2000-01-01" }));
        Assert.False(MainWindow.ShouldCheckUpdatesToday(new JsonObject { ["lastUpdateCheckDate"] = Clock.TodayUtc() }));
    }

    [Fact]
    public void Startup_command_quotes_executable_path_for_run_key()
    {
        Assert.Equal("\"C:\\Program Files\\KeepDir\\KeepDir.exe\"", MainWindow.StartupCommand("C:\\Program Files\\KeepDir\\KeepDir.exe"));
        Assert.Equal("\"C:\\KeepDir\\KeepDir.exe\"", MainWindow.StartupCommand("\"C:\\KeepDir\\KeepDir.exe\""));
        Assert.Equal("", MainWindow.StartupCommand(""));
    }

    [Fact]
    public void Rule_action_tooltip_converter_includes_error_and_trace()
    {
        var action = new RuleAction
        {
            ErrorMessage = "Target already exists",
            RuleTrace =
            [
                new RuleTraceItem { RuleName = "Docs", Matched = true, Reasons = ["extension matched"] },
                new RuleTraceItem { RuleName = "Downloads", Uncertain = true, Reasons = ["metadata missing"] }
            ]
        };

        var text = Assert.IsType<string>(new RuleActionTooltipConverter().Convert(action, typeof(string), "", CultureInfo.InvariantCulture));

        Assert.Contains("Target already exists", text);
        Assert.Contains("Docs - matched: extension matched", text);
        Assert.Contains("Downloads - uncertain: metadata missing", text);
        Assert.Null(new RuleActionTooltipConverter().Convert(new RuleAction(), typeof(string), "", CultureInfo.InvariantCulture));
    }

    [Fact]
    public void Rule_action_status_label_converter_matches_queue_pill_labels()
    {
        var converter = new RuleActionStatusLabelConverter();

        Assert.Equal("ready", converter.Convert("pending", typeof(string), "", CultureInfo.InvariantCulture));
        Assert.Equal("check", converter.Convert("needs_review", typeof(string), "", CultureInfo.InvariantCulture));
        Assert.Equal("blocked", converter.Convert("conflict", typeof(string), "", CultureInfo.InvariantCulture));
        Assert.Equal("warning", converter.Convert("stale", typeof(string), "", CultureInfo.InvariantCulture));
        Assert.Equal("danger", converter.Convert("error", typeof(string), "", CultureInfo.InvariantCulture));
        Assert.Equal("history", converter.Convert("applied", typeof(string), "", CultureInfo.InvariantCulture));
        Assert.Equal("history", converter.Convert("skipped", typeof(string), "", CultureInfo.InvariantCulture));
        Assert.Equal("history", converter.Convert("undone", typeof(string), "", CultureInfo.InvariantCulture));
    }

    [Fact]
    public void Rule_action_group_name_converter_uses_unmatched_fallback()
    {
        var converter = new RuleActionGroupNameConverter();

        Assert.Equal("Docs", converter.Convert("Docs", typeof(string), "", CultureInfo.InvariantCulture));
        Assert.Equal("Unmatched", converter.Convert(null!, typeof(string), "", CultureInfo.InvariantCulture));
    }

    [Fact]
    public void Main_window_xaml_loads()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                var window = new MainWindow();
                Assert.Equal("KeepDir", window.Title);
                Assert.True(window.MinWidth >= 880);
                Assert.True(window.MinHeight >= 560);
                var themeButton = Assert.IsType<Button>(window.FindName("ThemeButton"));
                Assert.Equal("Toggle light and dark theme", System.Windows.Automation.AutomationProperties.GetName(themeButton));
                Assert.Contains(themeButton.Template.Triggers.OfType<Trigger>(), trigger => trigger.Property == UIElement.IsKeyboardFocusedProperty);
                Assert.NotNull(window.FindName("QueueList"));
                Assert.NotNull(window.FindName("QueueEmptyText"));
                Assert.NotNull(window.FindName("QueueSelectAllCheck"));
                Assert.NotNull(window.FindName("QueueFilterBox"));
                Assert.NotNull(window.FindName("QueueHistoryCheck"));
                Assert.NotNull(window.FindName("ApplyReadyButton"));
                Assert.NotNull(window.FindName("ApplySelectedButton"));
                Assert.NotNull(window.FindName("SkipSelectedButton"));
                Assert.NotNull(window.FindName("UndoSelectedButton"));
                Assert.NotNull(window.FindName("RefreshSelectedButton"));
                Assert.NotNull(window.FindName("RetargetButton"));
                Assert.NotNull(window.FindName("SkipVisibleButton"));
                var ruleNameBox = Assert.IsType<TextBox>(window.FindName("RuleNameBox"));
                Assert.Equal("Rule name", System.Windows.Automation.AutomationProperties.GetName(ruleNameBox));
                Assert.NotNull(window.FindName("RuleNameContainsBox"));
                Assert.NotNull(window.FindName("RuleSourceUrlBox"));
                Assert.NotNull(window.FindName("RuleDownloadedFromBox"));
                Assert.NotNull(window.FindName("QueueUnmatchedCheck"));
                Assert.NotNull(window.FindName("WatchFolderEnabledCheck"));
                Assert.NotNull(window.FindName("WatchFolderRecursiveCheck"));
                Assert.NotNull(window.FindName("AssistantProviderBox"));
                Assert.NotNull(window.FindName("AssistantModelBox"));
                Assert.NotNull(window.FindName("RuleTestFileBox"));
                var settings = Assert.IsType<Expander>(window.FindName("SettingsExpander"));
                settings.ApplyTemplate();
                Assert.True(Assert.IsType<System.Windows.Controls.Primitives.ToggleButton>(settings.Template.FindName("HeaderSite", settings)).Focusable);
                var folderSwitch = Assert.IsType<CheckBox>(window.FindName("WatchFolderEnabledCheck"));
                Assert.Contains(folderSwitch.Template.Triggers.OfType<Trigger>(), trigger => trigger.Property == UIElement.IsKeyboardFocusedProperty);
                Assert.False(Assert.IsType<Button>(window.FindName("OpenReleaseButton")).IsEnabled);
                window.AllowQuit = true;
                window.Close();
            }
            catch (Exception error)
            {
                failure = error;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }
    }

    [Fact]
    public void Main_window_restores_persisted_layout()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            MainWindow? window = null;
            try
            {
                var store = new Store
                {
                    Settings = new JsonObject
                    {
                        ["uiLayout"] = new JsonObject
                        {
                            ["leftPanelWidth"] = 230,
                            ["rightPanelWidth"] = 300,
                            ["settingsExpanded"] = true,
                            ["assistantExpanded"] = false,
                            ["assistantSettingsExpanded"] = true,
                            ["tryFileExpanded"] = false,
                            ["rulesExpanded"] = false,
                            ["editRuleExpanded"] = true
                        }
                    }
                };

                window = new MainWindow();
                window.LoadStoreForTests(store);

                Assert.Equal(230d, Assert.IsType<ColumnDefinition>(window.FindName("LeftPanelColumn")).Width.Value, 1);
                Assert.Equal(300d, Assert.IsType<ColumnDefinition>(window.FindName("RightPanelColumn")).Width.Value, 1);
                Assert.True(Assert.IsType<Expander>(window.FindName("SettingsExpander")).IsExpanded);
                Assert.False(Assert.IsType<Expander>(window.FindName("AssistantExpander")).IsExpanded);
                Assert.True(Assert.IsType<Expander>(window.FindName("AssistantSettingsExpander")).IsExpanded);
                Assert.False(Assert.IsType<Expander>(window.FindName("TryFileExpander")).IsExpanded);
                Assert.False(Assert.IsType<Expander>(window.FindName("RulesExpander")).IsExpanded);
                Assert.True(Assert.IsType<Expander>(window.FindName("EditRuleExpander")).IsExpanded);
            }
            catch (Exception error)
            {
                failure = error;
            }
            finally
            {
                if (window is not null)
                {
                    window.AllowQuit = true;
                    window.Close();
                }
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }
    }

    [Fact]
    public void Main_window_dashboard_renders_nonblank_bitmap()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                foreach (var theme in new[] { "light", "dark" })
                {
                    foreach (var state in new[] { "empty", "populated", "conflict", "history" })
                    {
                        AssertRendersNonblank(theme, state);
                    }
                }
            }
            catch (Exception error)
            {
                failure = error;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }

        static void AssertRendersNonblank(string theme, string state)
        {
            var rootPath = Path.Combine(Path.GetTempPath(), "keepdir-render-fixture");
            var store = ScreenshotStore(theme, state, rootPath);
            Assert.All(store.RuleActions.GetValueOrDefault("default")?.Where(action => action.Status == "pending") ?? [], action =>
                Assert.False(PathSafety.SamePath(action.FilePath, action.TargetPath ?? action.FilePath)));

            var window = new MainWindow { Width = 1180, Height = 760 };
            window.LoadStoreForTests(store);
            window.Show();
            window.Dispatcher.Invoke(() => { }, System.Windows.Threading.DispatcherPriority.ApplicationIdle);
            if (state == "history")
            {
                Assert.IsType<CheckBox>(window.FindName("QueueHistoryCheck")).IsChecked = true;
            }
            else if (state == "conflict")
            {
                var queue = Assert.IsType<ListView>(window.FindName("QueueList"));
                queue.SelectedItem = Assert.Single(store.RuleActions["default"], action => action.Status == "conflict");
            }
            window.Dispatcher.Invoke(() => { }, System.Windows.Threading.DispatcherPriority.ApplicationIdle);
            var root = Assert.IsAssignableFrom<FrameworkElement>(window.Content);
            root.Measure(new System.Windows.Size(window.Width, window.Height));
            root.Arrange(new System.Windows.Rect(0, 0, window.Width, window.Height));
            root.UpdateLayout();

            var width = (int)(root.ActualWidth > 0 ? root.ActualWidth : window.Width);
            var height = (int)(root.ActualHeight > 0 ? root.ActualHeight : window.Height);
            var bitmap = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32);
            bitmap.Render(root);
            var pixels = new byte[width * height * 4];
            bitmap.CopyPixels(pixels, width * 4, 0);

            Assert.Contains(pixels, pixel => pixel != 0);

            var screenshotDir = Environment.GetEnvironmentVariable("KEEPDIR_SCREENSHOT_DIR");
            if (!string.IsNullOrWhiteSpace(screenshotDir))
            {
                Directory.CreateDirectory(screenshotDir);
                var encoder = new PngBitmapEncoder();
                encoder.Frames.Add(BitmapFrame.Create(bitmap));
                using var stream = File.Create(Path.Combine(screenshotDir, $"windows-{theme}-{state}.png"));
                encoder.Save(stream);
            }

            window.AllowQuit = true;
            window.Close();
        }

        static Store ScreenshotStore(string theme, string state, string rootPath)
        {
            var store = new Store { Settings = new JsonObject { ["theme"] = theme, ["lastUpdateCheckDate"] = "2099-01-01" } };
            if (state == "empty")
            {
                return store;
            }

            var downloads = Path.Combine(rootPath, "Downloads");
            var inbox = Path.Combine(rootPath, "Inbox");
            var rules = new[]
            {
                new FileRule { Id = "rule-docs", Name = "Documents", Enabled = true, Order = 0, Match = new RuleMatch { ExtensionIn = ["pdf"] }, Action = new RuleActionConfig { TargetFolder = "Documents" } },
                new FileRule { Id = "rule-images", Name = "Screenshots", Enabled = true, Order = 1, Match = new RuleMatch { ExtensionIn = ["png", "jpg"] }, Action = new RuleActionConfig { TargetFolder = "Images" } }
            };
            store.WorkspaceSettings["default"] = new Dictionary<string, JsonNode?>
            {
                [KeepDirConstants.AutomationRulesKey] = JsonSerializer.SerializeToNode(rules, JsonOptions.Default),
                [KeepDirConstants.QueueUnmatchedFilesKey] = false
            };
            store.WatchFolders["default"] =
            [
                new WatchFolder { Id = "downloads", Path = downloads, Enabled = true },
                new WatchFolder { Id = "inbox", Path = inbox, Enabled = true, Recursive = true }
            ];

            RuleAction Action(string id, string name, string targetName, string status, string ruleName, string? error = null)
            {
                var unmatched = ruleName == "Unmatched";
                var targetPath = unmatched ? null : Path.Combine(inbox, ruleName == "Screenshots" ? "Images" : "Documents", targetName);
                return new RuleAction
                {
                    Id = id,
                    WorkspaceId = "default",
                    FolderPath = inbox,
                    FilePath = Path.Combine(inbox, name),
                    OriginalName = name,
                    TargetPath = targetPath,
                    TargetName = unmatched ? null : targetName,
                    RuleId = unmatched ? null : ruleName == "Screenshots" ? "rule-images" : "rule-docs",
                    RuleName = unmatched ? null : ruleName,
                    Status = status,
                    ErrorMessage = error,
                    AppliedSourcePath = status == "applied" ? Path.Combine(inbox, name) : null,
                    AppliedTargetPath = status == "applied" ? targetPath : null,
                    CreatedAt = "1",
                    UpdatedAt = "1"
                };
            }

            store.RuleActions["default"] = state switch
            {
                "populated" =>
                [
                    Action("ready-document", "invoice.pdf", "invoice.pdf", "pending", "Documents"),
                    Action("ready-image", "screenshot.png", "screenshot.png", "pending", "Screenshots"),
                    Action("check-installer", "setup.exe", "setup.exe", "needs_review", "Unmatched", "No rule matched")
                ],
                "conflict" =>
                [
                    Action("conflict-document", "report-final.pdf", "report-final.pdf", "conflict", "Documents", "Target already exists")
                ],
                "history" =>
                [
                    Action("applied-document", "invoice.pdf", "invoice.pdf", "applied", "Documents"),
                    Action("skipped-image", "screenshot.png", "screenshot.png", "skipped", "Screenshots")
                ],
                _ => throw new InvalidOperationException($"Unknown screenshot state: {state}")
            };
            return store;
        }
    }

    [Fact]
    public void Conflict_inline_rename_apply_undo_cycle_uses_window_controls()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                using var temp = new TempDir();
                var source = Path.Combine(temp.Path, "invoice.pdf");
                var target = Path.Combine(temp.Path, "Documents", "invoice.pdf");
                var retargeted = Path.Combine(temp.Path, "Documents", "invoice-2.pdf");
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                File.WriteAllText(source, "new");
                File.WriteAllText(target, "existing");

                var store = new Store();
                var snapshot = QueueEngine.Snapshot(new FileInfo(source));
                store.RuleActions["default"] =
                [
                    new RuleAction
                    {
                        Id = "action-1",
                        WorkspaceId = "default",
                        FolderPath = temp.Path,
                        FilePath = source,
                        OriginalName = "invoice.pdf",
                        TargetPath = target,
                        TargetName = "invoice.pdf",
                        RuleName = "Docs",
                        Status = "conflict",
                        ErrorMessage = "Target already exists",
                        FileSize = snapshot.Size,
                        FileMtimeMs = snapshot.MtimeMs
                    }
                ];

                var window = new MainWindow();
                window.LoadStoreForTests(store);
                var history = Assert.IsType<CheckBox>(window.FindName("QueueHistoryCheck"));
                history.IsChecked = true;
                window.RefreshUiForTests();

                var queue = Assert.IsType<ListView>(window.FindName("QueueList"));
                Assert.Single(queue.Items);
                queue.SelectedIndex = 0;
                Assert.Equal("invoice-2.pdf", Assert.IsType<TextBox>(window.FindName("RetargetNameBox")).Text);

                Assert.IsType<TextBox>(window.FindName("RetargetNameBox")).Text = "invoice-2.pdf";
                Assert.True(window.RetargetSelectedInUi());
                Assert.Equal("pending", store.RuleActions["default"][0].Status);

                Assert.True(window.ApplySelectedInUi());
                Assert.Equal("applied", store.RuleActions["default"][0].Status);
                Assert.False(File.Exists(source));
                Assert.Equal("new", File.ReadAllText(retargeted));
                Assert.Equal("existing", File.ReadAllText(target));

                window.RefreshUiForTests();
                Assert.True(window.UndoSelectedInUi());
                Assert.Equal("undone", store.RuleActions["default"][0].Status);
                Assert.Equal("new", File.ReadAllText(source));
                Assert.False(File.Exists(retargeted));
                Assert.Equal("existing", File.ReadAllText(target));

                window.AllowQuit = true;
                window.Close();
            }
            catch (Exception error)
            {
                failure = error;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }
    }

    [Fact]
    public void Close_button_hides_unless_quitting()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                var window = new MainWindow();
                var close = new CancelEventArgs();

                window.CloseToTrayUnlessQuit(close);
                Assert.True(close.Cancel);

                close = new CancelEventArgs();
                window.AllowQuit = true;
                window.CloseToTrayUnlessQuit(close);
                Assert.False(close.Cancel);
                window.Close();
            }
            catch (Exception error)
            {
                failure = error;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }
    }

    [Fact]
    public void Queue_empty_state_tracks_filter_and_history()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                var window = new MainWindow();
                window.LoadStoreForTests(new Store());
                var filter = Assert.IsType<ComboBox>(window.FindName("QueueFilterBox"));
                var history = Assert.IsType<CheckBox>(window.FindName("QueueHistoryCheck"));
                var empty = Assert.IsType<TextBlock>(window.FindName("QueueEmptyText"));

                Assert.Equal(Visibility.Visible, empty.Visibility);
                Assert.Equal("No active queue items.", empty.Text);

                filter.SelectedIndex = 1;
                Assert.Equal("No ready files.", empty.Text);

                filter.SelectedIndex = 2;
                Assert.Equal("No files need review.", empty.Text);

                filter.SelectedIndex = 3;
                Assert.Equal("No blocked files.", empty.Text);

                filter.SelectedIndex = 0;
                history.IsChecked = true;
                Assert.Equal("No queue history yet.", empty.Text);

                window.AllowQuit = true;
                window.Close();
            }
            catch (Exception error)
            {
                failure = error;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }
    }

    [Fact]
    public void Queue_rows_group_by_rule_name()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                var store = new Store();
                store.RuleActions["default"] =
                [
                    new RuleAction { Id = "one", WorkspaceId = "default", OriginalName = "a.pdf", RuleName = "Docs", Status = "pending", CreatedAt = "1" },
                    new RuleAction { Id = "two", WorkspaceId = "default", OriginalName = "b.pdf", RuleName = "Images", Status = "pending", CreatedAt = "2" },
                    new RuleAction { Id = "three", WorkspaceId = "default", OriginalName = "c.pdf", Status = "pending", CreatedAt = "3" }
                ];

                var window = new MainWindow();
                window.LoadStoreForTests(store);
                var queue = Assert.IsType<ListView>(window.FindName("QueueList"));
                var view = CollectionViewSource.GetDefaultView(queue.ItemsSource);

                Assert.Equal(["Docs", "Images", "Unmatched"], view.Groups!.Cast<CollectionViewGroup>().Select(group => group.Name));

                window.AllowQuit = true;
                window.Close();
            }
            catch (Exception error)
            {
                failure = error;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }
    }

    [Fact]
    public void Queue_footer_buttons_track_selected_action_state()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                var store = new Store();
                store.RuleActions["default"] =
                [
                    new RuleAction { Id = "pending", WorkspaceId = "default", OriginalName = "a.pdf", TargetName = "a.pdf", RuleName = "Rule", Status = "pending", CreatedAt = "1" },
                    new RuleAction { Id = "conflict", WorkspaceId = "default", OriginalName = "b.pdf", TargetName = "b.pdf", RuleName = "Rule", Status = "conflict", CreatedAt = "2" },
                    new RuleAction { Id = "applied", WorkspaceId = "default", OriginalName = "c.pdf", TargetName = "c.pdf", RuleName = "Rule", Status = "applied", CreatedAt = "3" }
                ];

                var window = new MainWindow();
                window.LoadStoreForTests(store);
                var queue = Assert.IsType<ListView>(window.FindName("QueueList"));
                var history = Assert.IsType<CheckBox>(window.FindName("QueueHistoryCheck"));
                var applyReady = Assert.IsType<Button>(window.FindName("ApplyReadyButton"));
                var applySelected = Assert.IsType<Button>(window.FindName("ApplySelectedButton"));
                var skipSelected = Assert.IsType<Button>(window.FindName("SkipSelectedButton"));
                var undoSelected = Assert.IsType<Button>(window.FindName("UndoSelectedButton"));
                var refreshSelected = Assert.IsType<Button>(window.FindName("RefreshSelectedButton"));
                var retarget = Assert.IsType<Button>(window.FindName("RetargetButton"));
                var retargetName = Assert.IsType<TextBox>(window.FindName("RetargetNameBox"));
                var skipVisible = Assert.IsType<Button>(window.FindName("SkipVisibleButton"));

                Assert.True(applyReady.IsEnabled);
                Assert.False(applySelected.IsEnabled);
                Assert.False(skipSelected.IsEnabled);
                Assert.False(undoSelected.IsEnabled);
                Assert.False(refreshSelected.IsEnabled);
                Assert.False(retarget.IsEnabled);
                Assert.False(retargetName.IsEnabled);
                Assert.True(skipVisible.IsEnabled);

                queue.SelectedIndex = 0;
                Assert.True(applySelected.IsEnabled);
                Assert.True(skipSelected.IsEnabled);
                Assert.False(undoSelected.IsEnabled);
                Assert.True(refreshSelected.IsEnabled);
                Assert.True(retarget.IsEnabled);
                Assert.True(retargetName.IsEnabled);

                queue.SelectedItems.Add(queue.Items[1]);
                Assert.False(applySelected.IsEnabled);
                Assert.True(skipSelected.IsEnabled);
                Assert.False(undoSelected.IsEnabled);
                Assert.True(refreshSelected.IsEnabled);
                Assert.False(retarget.IsEnabled);

                history.IsChecked = true;
                queue = Assert.IsType<ListView>(window.FindName("QueueList"));
                queue.SelectedIndex = 2;
                Assert.False(applySelected.IsEnabled);
                Assert.False(skipSelected.IsEnabled);
                Assert.True(undoSelected.IsEnabled);
                Assert.True(refreshSelected.IsEnabled);
                Assert.False(retarget.IsEnabled);
                Assert.False(retargetName.IsEnabled);
                Assert.False(skipVisible.IsEnabled);

                window.AllowQuit = true;
                window.Close();
            }
            catch (Exception error)
            {
                failure = error;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }
    }

    [Fact]
    public void Skip_visible_skips_current_non_terminal_queue_rows()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                var store = new Store();
                store.RuleActions["default"] =
                [
                    new RuleAction { Id = "pending", WorkspaceId = "default", OriginalName = "a.pdf", Status = "pending" },
                    new RuleAction { Id = "conflict", WorkspaceId = "default", OriginalName = "b.pdf", Status = "conflict", ErrorMessage = "Target already exists" },
                    new RuleAction { Id = "applied", WorkspaceId = "default", OriginalName = "c.pdf", Status = "applied" }
                ];

                var window = new MainWindow();
                window.LoadStoreForTests(store);
                Assert.Equal(2, Assert.IsType<ListView>(window.FindName("QueueList")).Items.Count);

                Assert.True(window.SkipVisibleInUi());
                Assert.Equal(["skipped", "skipped", "applied"], store.RuleActions["default"].Select(action => action.Status));
                Assert.Equal("Skipped 2 visible actions.", Assert.IsType<TextBlock>(window.FindName("QueueStatusText")).Text);

                window.AllowQuit = true;
                window.Close();
            }
            catch (Exception error)
            {
                failure = error;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }
    }

    [Fact]
    public void Select_all_visible_tracks_queue_selection_state()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                var store = new Store();
                store.RuleActions["default"] =
                [
                    new RuleAction { Id = "one", WorkspaceId = "default", OriginalName = "a.pdf", Status = "pending" },
                    new RuleAction { Id = "two", WorkspaceId = "default", OriginalName = "b.pdf", Status = "conflict" },
                    new RuleAction { Id = "history", WorkspaceId = "default", OriginalName = "c.pdf", Status = "applied" }
                ];

                var window = new MainWindow();
                window.LoadStoreForTests(store);
                var queue = Assert.IsType<ListView>(window.FindName("QueueList"));
                var selectAll = Assert.IsType<CheckBox>(window.FindName("QueueSelectAllCheck"));

                Assert.Equal(2, queue.Items.Count);
                Assert.False(selectAll.IsChecked);

                selectAll.IsChecked = true;
                Assert.Equal(2, queue.SelectedItems.Count);
                Assert.True(selectAll.IsChecked);

                queue.SelectedItems.RemoveAt(0);
                Assert.Null(selectAll.IsChecked);

                selectAll.IsChecked = false;
                Assert.Empty(queue.SelectedItems);
                Assert.False(selectAll.IsChecked);

                window.AllowQuit = true;
                window.Close();
            }
            catch (Exception error)
            {
                failure = error;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }
    }

    [Fact]
    public void Selected_queue_actions_apply_and_undo_multiple_rows()
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                using var temp = new TempDir();
                var first = Path.Combine(temp.Path, "invoice.pdf");
                var second = Path.Combine(temp.Path, "report.pdf");
                var firstTarget = Path.Combine(temp.Path, "Documents", "invoice.pdf");
                var secondTarget = Path.Combine(temp.Path, "Documents", "report.pdf");
                File.WriteAllText(first, "one");
                File.WriteAllText(second, "two");
                var firstSnapshot = QueueEngine.Snapshot(new FileInfo(first));
                var secondSnapshot = QueueEngine.Snapshot(new FileInfo(second));
                var store = new Store();
                store.RuleActions["default"] =
                [
                    new RuleAction { Id = "one", WorkspaceId = "default", FolderPath = temp.Path, FilePath = first, OriginalName = "invoice.pdf", TargetPath = firstTarget, TargetName = "invoice.pdf", Status = "pending", FileSize = firstSnapshot.Size, FileMtimeMs = firstSnapshot.MtimeMs },
                    new RuleAction { Id = "two", WorkspaceId = "default", FolderPath = temp.Path, FilePath = second, OriginalName = "report.pdf", TargetPath = secondTarget, TargetName = "report.pdf", Status = "pending", FileSize = secondSnapshot.Size, FileMtimeMs = secondSnapshot.MtimeMs }
                ];

                var window = new MainWindow();
                window.LoadStoreForTests(store);
                var queue = Assert.IsType<ListView>(window.FindName("QueueList"));
                queue.SelectAll();

                Assert.True(window.ApplySelectedInUi());
                Assert.Equal(["applied", "applied"], store.RuleActions["default"].Select(action => action.Status));
                Assert.Equal("one", File.ReadAllText(firstTarget));
                Assert.Equal("two", File.ReadAllText(secondTarget));

                Assert.True(window.UndoSelectedInUi());
                Assert.Equal(["undone", "undone"], store.RuleActions["default"].Select(action => action.Status));
                Assert.Equal("one", File.ReadAllText(first));
                Assert.Equal("two", File.ReadAllText(second));

                Assert.False(window.SkipSelectedInUi());
                Assert.Equal("Cannot skip undone.", Assert.IsType<TextBlock>(window.FindName("QueueStatusText")).Text);

                window.AllowQuit = true;
                window.Close();
            }
            catch (Exception error)
            {
                failure = error;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (failure is not null)
        {
            throw failure;
        }
    }
}

sealed class TempDir : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"keepdir-app-tests-{Environment.ProcessId}-{Guid.NewGuid():N}");

    public TempDir() => Directory.CreateDirectory(Path);

    public void Dispose()
    {
        if (Directory.Exists(Path))
        {
            Directory.Delete(Path, recursive: true);
        }
    }
}
