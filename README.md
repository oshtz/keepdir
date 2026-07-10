# <img src="native/windows/KeepDir.App/icon.png" alt="KeepDir icon" width="36" height="36"> KeepDir

KeepDir is a native desktop app for rules-first file sorting. It watches folders, evaluates ordered rules, builds a review queue, and moves files only after approval.

## Install

Download the latest build from [GitHub Releases](https://github.com/oshtz/keepdir/releases):

- **macOS 13+**: open `KeepDir-macOS.dmg`, then move KeepDir to Applications.
- **Windows**: run `KeepDir-windows-x64.exe`. The [.NET 9 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/9.0) is required.

## Usage

1. Add one or more watched folders.
2. Create ordered rules that match filenames, extensions, or download metadata.
3. Review the proposed moves in the queue.
4. Apply, rename, skip, or undo actions from the queue.

The optional rule assistant can draft disabled rules using OpenAI, Google, Anthropic, OpenRouter, LM Studio, or Ollama. Hosted API keys are stored in the platform credential store; local providers do not require keys.

User data stays local at `com.oshtz.keepdir/keepdir.json`, with atomic writes and backup recovery.

## Build from source

Windows:

```powershell
dotnet test native/windows/KeepDir.sln
dotnet run --project native/windows/KeepDir.App
```

macOS:

```bash
cd native/macos
swift test
swift run KeepDirMacApp
```

The macOS app is built with SwiftUI and Swift Package Manager. The Windows app is built with WPF and .NET 9.

## Development

Shared behavior and fixtures live in [`spec/`](spec/). See the [behavioral contract](spec/keepdir-spec.md) and [design tokens](spec/design-tokens.md) for the cross-platform rules.

Run the release and visual checks on Windows with:

```powershell
.\scripts\release-gate-smoke.ps1 -ExpectedVersion 0.1.0 -ExpectedMacBuild 1
$env:KEEPDIR_SCREENSHOT_DIR = "$PWD/artifacts/native-screenshots"
dotnet test native/windows/KeepDir.sln
python scripts/compare-png.py artifacts/native-screenshots/windows-light-populated.png spec/reference-screenshots/light-populated.png --max-difference 0.15
```

## License

[MIT](LICENSE) © 2026 Omer Shatzberg
