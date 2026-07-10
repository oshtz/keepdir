using System.Drawing;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Threading;
using WinForms = System.Windows.Forms;

namespace KeepDir.App;

public partial class App : System.Windows.Application
{
    internal const string PipeName = "com.oshtz.keepdir.show";
    const string MutexName = "com.oshtz.keepdir";
    Mutex? _mutex;
    CancellationTokenSource? _pipeStop;
    Task? _pipeTask;
    WinForms.NotifyIcon? _tray;
    Icon? _baseIcon;
    Icon? _pendingIcon;
    MainWindow? _window;
    int? _lastPendingCount;

    protected override void OnStartup(StartupEventArgs e)
    {
        _mutex = new Mutex(true, InstanceName(MutexName), out var created);
        if (!created)
        {
            PingExistingInstance(InstanceName(PipeName));
            Shutdown();
            return;
        }

        base.OnStartup(e);
        _window = new MainWindow();
        CreateTray();
        _window.Show();
        StartPipeServer();
        ScheduleSmokeExit();
    }

    public void RefreshTray(int pendingCount)
    {
        if (_tray is null || _window is null)
        {
            return;
        }

        _tray.ContextMenuStrip = BuildTrayMenu(
            pendingCount,
            _window.IsStartupEnabled(),
            () => _window.Dispatcher.Invoke(async () => await _window.ApplyPendingAsync()),
            () => _window.Dispatcher.Invoke(_window.ToggleStartup),
            () => _window.Dispatcher.Invoke(async () =>
            {
                ShowMainWindow();
                await _window.CheckUpdatesAsync();
            }),
            () => _window.Dispatcher.Invoke(ShowMainWindow),
            () => _window.Dispatcher.Invoke(Quit));
        _tray.Text = TrayTooltip(pendingCount);
        _tray.Icon = pendingCount > 0 ? _pendingIcon ?? _baseIcon : _baseIcon;
        if (ShouldNotifyPending(_lastPendingCount, pendingCount))
        {
            _tray.ShowBalloonTip(5000, "KeepDir", $"{pendingCount} file(s) are ready to organize.", WinForms.ToolTipIcon.Info);
        }
        _lastPendingCount = pendingCount;
    }

    internal static WinForms.ContextMenuStrip BuildTrayMenu(
        int pendingCount,
        bool startupEnabled,
        Action applyPending,
        Action toggleStartup,
        Action checkUpdates,
        Action showMainWindow,
        Action quit)
    {
        var menu = new WinForms.ContextMenuStrip();
        menu.Items.Add(new WinForms.ToolStripMenuItem($"Pending renames: {pendingCount}") { Enabled = false });
        menu.Items.Add(new WinForms.ToolStripMenuItem(
            pendingCount == 1 ? "Rename 1 pending file" : $"Rename {pendingCount} pending files",
            null,
            (_, _) => applyPending())
        { Enabled = pendingCount > 0 });

        var startup = new WinForms.ToolStripMenuItem("Open on startup")
        {
            Checked = startupEnabled,
            CheckOnClick = false
        };
        startup.Click += (_, _) => toggleStartup();
        menu.Items.Add(startup);

        menu.Items.Add(new WinForms.ToolStripMenuItem("Check for updates", null, (_, _) => checkUpdates()));
        menu.Items.Add(new WinForms.ToolStripSeparator());
        menu.Items.Add(new WinForms.ToolStripMenuItem("Show KeepDir", null, (_, _) => showMainWindow()));
        menu.Items.Add(new WinForms.ToolStripMenuItem("Quit", null, (_, _) => quit()));
        return menu;
    }

    internal static string TrayTooltip(int pendingCount) => $"KeepDir - {pendingCount} pending renames";

    internal static bool ShouldNotifyPending(int? previousPendingCount, int pendingCount) =>
        previousPendingCount == 0 && pendingCount > 0;

    protected override void OnExit(ExitEventArgs e)
    {
        _pipeStop?.Cancel();
        _tray?.Dispose();
        _pendingIcon?.Dispose();
        _baseIcon?.Dispose();
        _mutex?.Dispose();
        base.OnExit(e);
    }

    void CreateTray()
    {
        var iconResource = System.Windows.Application.GetResourceStream(new Uri("pack://application:,,,/KeepDir.App;component/icon.ico"))
            ?? throw new FileNotFoundException("Missing icon.ico resource.");
        using var iconStream = iconResource.Stream;
        _baseIcon = new Icon(iconStream);
        _pendingIcon = CreatePendingIcon(_baseIcon);
        _tray = new WinForms.NotifyIcon
        {
            Icon = _baseIcon,
            Text = "KeepDir",
            Visible = true
        };
        _tray.MouseClick += (_, e) =>
        {
            if (e.Button == WinForms.MouseButtons.Left)
            {
                Dispatcher.Invoke(ShowMainWindow);
            }
        };
        _lastPendingCount = 0;
        RefreshTray(0);
    }

    static Icon CreatePendingIcon(Icon baseIcon)
    {
        using var bitmap = new Bitmap(32, 32);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.Clear(Color.Transparent);
            graphics.DrawIcon(baseIcon, new Rectangle(0, 0, 32, 32));
            using var brush = new SolidBrush(Color.FromArgb(235, 255, 92, 92));
            graphics.FillEllipse(brush, 20, 2, 10, 10);
            graphics.DrawEllipse(Pens.White, 20, 2, 10, 10);
        }

        var handle = bitmap.GetHicon();
        try
        {
            return (Icon)Icon.FromHandle(handle).Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }

    void ShowMainWindow()
    {
        if (_window is null)
        {
            return;
        }
        _window.Show();
        _window.WindowState = WindowState.Normal;
        _window.Activate();
    }

    void Quit()
    {
        if (_window is not null)
        {
            _window.AllowQuit = true;
        }
        Shutdown();
    }

    void ScheduleSmokeExit()
    {
        if (!int.TryParse(Environment.GetEnvironmentVariable("KEEPDIR_SMOKE_EXIT_AFTER_MS"), out var delayMs) || delayMs <= 0)
        {
            return;
        }

        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(delayMs) };
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            Quit();
        };
        timer.Start();
    }

    internal static void PingExistingInstance(string pipeName = PipeName)
    {
        try
        {
            using var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.Out);
            pipe.Connect(750);
            using var writer = new StreamWriter(pipe) { AutoFlush = true };
            writer.WriteLine("show");
        }
        catch
        {
            // Existing instance may be starting up or shutting down.
        }
    }

    void StartPipeServer()
    {
        _pipeStop = new CancellationTokenSource();
        var token = _pipeStop.Token;
        _pipeTask = Task.Run(async () =>
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    using var pipe = new NamedPipeServerStream(InstanceName(PipeName), PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                    await pipe.WaitForConnectionAsync(token);
                    Dispatcher.Invoke(ShowMainWindow);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch
                {
                    await Task.Delay(250, token);
                }
            }
        }, token);
    }

    static string InstanceName(string baseName)
    {
        var suffix = Environment.GetEnvironmentVariable("KEEPDIR_SMOKE_INSTANCE_SUFFIX");
        return string.IsNullOrWhiteSpace(suffix) ? baseName : $"{baseName}.{suffix.Trim()}";
    }

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool DestroyIcon(IntPtr hIcon);
}
