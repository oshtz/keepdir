#if os(macOS)
import AppKit
import CoreServices
import CoreText
import KeepDirCore
import ServiceManagement
import SwiftUI
import UserNotifications

let workspaceId = "default"
let keepDirMenuBarImage = loadKeepDirMenuBarImage()

func loadKeepDirMenuBarImage() -> NSImage {
    for ext in ["png", "svg"] {
        if let url = Bundle.main.url(forResource: "icon", withExtension: ext),
           let image = NSImage(contentsOf: url) {
            image.size = NSSize(width: 18, height: 18)
            return image
        }
    }
    return NSImage(systemSymbolName: "tray", accessibilityDescription: "KeepDir") ?? NSImage()
}

@main
struct KeepDirMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var model = AppModel()
    @AppStorage("theme") private var theme = "light"

    var body: some Scene {
        WindowGroup("KeepDir", id: "main") {
            ContentView(model: model, theme: $theme)
                .preferredColorScheme(theme == "dark" ? .dark : .light)
                .frame(minWidth: 880, minHeight: 560)
                .task {
                    await model.load()
                }
                .task {
                    await model.startWatcherLoop()
                }
                .task {
                    await model.startPollingScanLoop()
                }
                .task {
                    await model.startSafetyScanLoop()
                }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1280, height: 900)

        MenuBarExtra {
            Text(pendingRenamesMenuLabel(model.pendingCount))
            Button(renamePendingFilesMenuLabel(model.pendingCount)) {
                Task { await model.applyPending() }
            }
            .disabled(model.pendingCount == 0)
            Toggle("Open on startup", isOn: Binding(
                get: { model.openOnStartup },
                set: { enabled in Task { await model.setOpenOnStartup(enabled) } }
            ))
            Button("Check for updates") {
                Task { await model.checkUpdates(force: true) }
            }
            Divider()
            Button("Show KeepDir") {
                appDelegate.showMainWindow()
            }
            Button("Quit") {
                NSApp.terminate(nil)
            }
        } label: {
            Image(nsImage: keepDirMenuBarImage)
                .resizable()
                .scaledToFit()
                .frame(width: 18, height: 18)
                .help("KeepDir")
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        DispatchQueue.main.async {
            self.showMainWindow()
        }
    }

    func applicationDidUpdate(_ notification: Notification) {
        installWindowDelegates()
        configureWindows()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            showMainWindow()
        }
        return true
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }

    func showMainWindow() {
        installWindowDelegates()
        configureWindows()
        (NSApp.windows.first { $0.title == "KeepDir" } ?? NSApp.windows.first)?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func installWindowDelegates() {
        NSApp.windows.forEach { $0.delegate = self }
    }

    private func configureWindows() {
        NSApp.windows.forEach { window in
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
            window.styleMask.insert(.fullSizeContentView)
            window.backgroundColor = .clear
            window.isMovableByWindowBackground = false
            window.collectionBehavior.insert(.fullScreenPrimary)
            window.standardWindowButton(.closeButton)?.isHidden = true
            window.standardWindowButton(.miniaturizeButton)?.isHidden = true
            window.standardWindowButton(.zoomButton)?.isHidden = true
        }
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var store = Store()
    @Published var message = ""
    @Published var openOnStartup = false
    @Published var latestReleaseURL: URL?
    @Published var queueFilter = "all"
    @Published var showHistory = false
    @Published var selectedActionId: String?
    @Published var selectedActionIds: Set<String> = []
    @Published var retargetName = ""
    @Published var assistantDescription = ""
    @Published var assistantProvider = "openai"
    @Published var assistantEndpoint = RuleAssistant.defaultEndpoint("openai")
    @Published var assistantModel = RuleAssistant.defaultModel("openai")
    @Published var assistantApiKey = ""
    @Published var assistantModels: [String] = []
    @Published var assistantStatus = ""
    @Published var ruleTestFilePath = ""
    @Published var ruleTestStatus = ""

    let manager = StoreManager(directory: appDataDirectory())
    private var seen: [String: SeenFile] = [:]
    private var lastPendingCount = 0
    private var watcherLoopStarted = false
    private var watcherSignature = ""
    private var watcherStreams: [FSEventStreamRef] = []
    private var watcherDebounceTask: Task<Void, Never>?
    private var pollingScanStarted = false
    private var safetyScanStarted = false

    var pendingCount: Int {
        store.ruleActions.values.flatMap { $0 }.filter { $0.status == "pending" }.count
    }

    var activeActions: [RuleAction] {
        store.ruleActions[workspaceId, default: []]
            .filter { !QueueEngine.terminalStatus($0.status) }
            .sorted { $0.createdAt < $1.createdAt }
    }

    var visibleActions: [RuleAction] {
        store.ruleActions[workspaceId, default: []]
            .filter { action in
                showHistory || !QueueEngine.terminalStatus(action.status)
            }
            .filter { action in
                switch queueFilter {
                case "ready":
                    return action.status == "pending"
                case "check":
                    return action.status == "needs_review"
                case "blocked":
                    return ["conflict", "error", "stale"].contains(action.status)
                default:
                    return true
                }
            }
            .sorted {
                let leftRule = ruleActionGroupName($0)
                let rightRule = ruleActionGroupName($1)
                if leftRule != rightRule {
                    return leftRule.localizedCaseInsensitiveCompare(rightRule) == .orderedAscending
                }
                return $0.createdAt < $1.createdAt
            }
    }

    var groupedVisibleActions: [(name: String, actions: [RuleAction])] {
        var groups: [(String, [RuleAction])] = []
        for action in visibleActions {
            let name = ruleActionGroupName(action)
            if let index = groups.firstIndex(where: { $0.0 == name }) {
                groups[index].1.append(action)
            } else {
                groups.append((name, [action]))
            }
        }
        return groups.map { (name: $0.0, actions: $0.1) }
    }

    var selectedAction: RuleAction? {
        let id: String?
        if selectedActionIds.count == 1 {
            id = selectedActionIds.first
        } else {
            id = selectedActionId
        }
        guard let id else {
            return nil
        }
        return store.ruleActions[workspaceId, default: []].first { $0.id == id }
    }

    var canSkipVisible: Bool {
        let actions = visibleActions
        return !actions.isEmpty && actions.allSatisfy { ruleActionCanSkip($0) }
    }

    var watchFolders: [WatchFolder] {
        store.watchFolders[workspaceId, default: []]
    }

    var rules: [FileRule] {
        guard let value = store.workspaceSettings[workspaceId]?["automationRules"],
              let data = try? JSONEncoder().encode(value) else {
            return []
        }
        return (try? JSONDecoder().decode([FileRule].self, from: data)) ?? []
    }

    var queueUnmatchedFiles: Bool {
        if case .bool(let value) = store.workspaceSettings[workspaceId]?["queueUnmatchedFiles"] {
            return value
        }
        return false
    }

    func load() async {
        do {
            store = try await manager.load()
            loadAssistantSettings()
            rebuildWatchersIfNeeded()
            await scan()
            await checkUpdates(force: false)
            notifyIfNeeded()
        } catch {
            message = String(describing: error)
        }
    }

    func addFolder() async {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else {
            return
        }

        store.watchFolders[workspaceId, default: []].append(WatchFolder(
            id: "watch-\(Int64(Date().timeIntervalSince1970 * 1000))",
            path: url.path,
            enabled: true,
            createdAt: "\(Int64(Date().timeIntervalSince1970 * 1000))"
        ))
        seen.removeAll()
        await save()
    }

    func setFolder(_ id: String, enabled: Bool? = nil, recursive: Bool? = nil) async {
        guard var folders = store.watchFolders[workspaceId],
              let index = folders.firstIndex(where: { $0.id == id }) else {
            return
        }
        if let enabled {
            folders[index].enabled = enabled
        }
        if let recursive {
            folders[index].recursive = recursive
        }
        store.watchFolders[workspaceId] = folders
        seen.removeAll()
        await save()
    }

    func setQueueUnmatchedFiles(_ enabled: Bool) async {
        store.workspaceSettings[workspaceId, default: [:]]["queueUnmatchedFiles"] = .bool(enabled)
        await save()
    }

    func scan() async {
        var next = store
        let changed = Scanner.scanStore(&next, seen: &seen)
        store = next
        if !changed.isEmpty {
            await save()
            notifyIfNeeded()
        }
    }

    func startSafetyScanLoop() async {
        guard !safetyScanStarted else { return }
        safetyScanStarted = true
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: keepDirSafetyScanIntervalNanoseconds)
            if !Task.isCancelled {
                await scan()
            }
        }
        safetyScanStarted = false
    }

    func startWatcherLoop() async {
        guard !watcherLoopStarted else { return }
        watcherLoopStarted = true
        rebuildWatchersIfNeeded()
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: keepDirWatcherRebuildIntervalNanoseconds)
            if !Task.isCancelled {
                rebuildWatchersIfNeeded()
            }
        }
        stopWatchers()
        watcherLoopStarted = false
    }

    func startPollingScanLoop() async {
        guard !pollingScanStarted else { return }
        pollingScanStarted = true
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: keepDirPollingIntervalNanoseconds)
            if Task.isCancelled {
                break
            }
            await scan()
            try? await Task.sleep(nanoseconds: keepDirStableScanIntervalNanoseconds)
            if !Task.isCancelled {
                await scan()
            }
        }
        pollingScanStarted = false
    }

    private func rebuildWatchersIfNeeded() {
        let folders = watchFolders.filter(\.enabled).sorted { $0.id < $1.id }
        let signature = folders.map { "\($0.id)|\($0.path)|\($0.recursive)" }.joined(separator: "\n")
        guard signature != watcherSignature else {
            return
        }
        stopWatchers()
        var nextStreams: [FSEventStreamRef] = []
        for folder in folders {
            var context = FSEventStreamContext(
                version: 0,
                info: Unmanaged.passUnretained(self).toOpaque(),
                retain: nil,
                release: nil,
                copyDescription: nil
            )
            let callback: FSEventStreamCallback = { _, info, _, _, _, _ in
                guard let info else { return }
                let model = Unmanaged<AppModel>.fromOpaque(info).takeUnretainedValue()
                Task { @MainActor in model.scheduleScanAfterEvent() }
            }
            let paths = [folder.path] as CFArray
            let flags = FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer)
            guard let stream = FSEventStreamCreate(
                kCFAllocatorDefault,
                callback,
                &context,
                paths,
                FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
                TimeInterval(keepDirDebounceIntervalNanoseconds) / 1_000_000_000,
                flags
            ) else {
                continue
            }
            FSEventStreamSetDispatchQueue(stream, DispatchQueue.main)
            FSEventStreamStart(stream)
            nextStreams.append(stream)
        }
        watcherStreams = nextStreams
        watcherSignature = watcherStreams.count == folders.count ? signature : ""
    }

    private func scheduleScanAfterEvent() {
        watcherDebounceTask?.cancel()
        watcherDebounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: keepDirDebounceIntervalNanoseconds)
            if Task.isCancelled { return }
            await self?.scan()
            try? await Task.sleep(nanoseconds: keepDirStableScanIntervalNanoseconds)
            if !Task.isCancelled {
                await self?.scan()
            }
        }
    }

    private func stopWatchers() {
        watcherDebounceTask?.cancel()
        watcherDebounceTask = nil
        for stream in watcherStreams {
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
        }
        watcherStreams.removeAll()
        watcherSignature = ""
    }

    func refreshActiveActions() async {
        var next = store
        _ = QueueEngine.refreshMatchingRuleActions(&next, workspaceId: workspaceId) { !QueueEngine.terminalStatus($0.status) }
        let changed = Scanner.scanStore(&next, seen: &seen)
        store = next
        if !changed.isEmpty {
            notifyIfNeeded()
        }
        await save()
    }

    func applyPending() async {
        var updated = store
        for workspace in updated.ruleActions.keys {
            var actions = updated.ruleActions[workspace, default: []]
            for index in actions.indices where actions[index].status == "pending" {
                try? QueueEngine.applyOne(&actions[index])
            }
            updated.ruleActions[workspace] = actions
        }
        store = updated
        await save()
    }

    func selectAction(_ action: RuleAction) {
        selectedActionId = action.id
        selectedActionIds = [action.id]
        retargetName = QueueEngine.suggestedRetargetName(action)
        message = action.errorMessage ?? ""
    }

    func retargetSelected() async {
        await mutateSelectedActions(singleOnly: true) { action in
            try QueueEngine.retargetOne(&action, targetName: retargetName)
        } message: { count in
            count == 1 ? "Updated target name." : "Updated \(count) target names."
        }
    }

    func applySelected() async {
        await mutateSelectedActions { action in
            try QueueEngine.applyOne(&action)
        } message: { count in
            count == 1 ? "Applied selected action." : "Applied \(count) selected actions."
        }
    }

    func undoSelected() async {
        await mutateSelectedActions { action in
            try QueueEngine.undoOne(&action)
        } message: { count in
            count == 1 ? "Undone selected action." : "Undone \(count) selected actions."
        }
    }

    func skipSelected() async {
        await mutateSelectedActions { action in
            try QueueEngine.skipOne(&action)
        } message: { count in
            count == 1 ? "Skipped selected action." : "Skipped \(count) selected actions."
        }
    }

    func skipVisible() async {
        let actions = visibleActions
        guard !actions.isEmpty else {
            message = "No visible actions to skip."
            return
        }
        guard actions.allSatisfy({ ruleActionCanSkip($0) }) else {
            message = "Cannot skip terminal history rows."
            return
        }
        let ids = Set(actions.map { $0.id })
        var stored = store.ruleActions[workspaceId, default: []]
        do {
            for index in stored.indices where ids.contains(stored[index].id) {
                try QueueEngine.skipOne(&stored[index])
            }
            store.ruleActions[workspaceId] = stored
            message = actions.count == 1 ? "Skipped 1 visible action." : "Skipped \(actions.count) visible actions."
            await save()
        } catch {
            message = errorText(error)
        }
    }

    func refreshSelected() async {
        let ids = selectedSelectionIds()
        guard !ids.isEmpty else {
            message = "Select a queue row first."
            return
        }
        var next = store
        _ = QueueEngine.refreshMatchingRuleActions(&next, workspaceId: workspaceId) { ids.contains($0.id) }
        store = next
        message = ids.count == 1 ? "Refreshed selected action." : "Refreshed \(ids.count) selected actions."
        await save()
    }

    func selectedSelectionIds() -> Set<String> {
        if !selectedActionIds.isEmpty {
            return selectedActionIds
        }
        if let selectedActionId {
            return [selectedActionId]
        }
        return []
    }

    private func mutateSelectedActions(singleOnly: Bool = false, _ body: (inout RuleAction) throws -> Void, message successMessage: (Int) -> String) async {
        let ids = selectedSelectionIds()
        guard !ids.isEmpty else {
            message = "Select a queue row first."
            return
        }
        guard !singleOnly || ids.count == 1 else {
            message = "Select one queue row first."
            return
        }
        var actions = store.ruleActions[workspaceId, default: []]
        var changed = 0
        do {
            for index in actions.indices where ids.contains(actions[index].id) {
                try body(&actions[index])
                changed += 1
            }
            if changed == 0 {
                selectedActionId = nil
                selectedActionIds.removeAll()
                message = "Selected action is no longer available."
                return
            }
            message = successMessage(changed)
        } catch {
            message = changed > 0 ? "\(successMessage(changed)); \(errorText(error))" : errorText(error)
        }
        store.ruleActions[workspaceId] = actions
        await save()
        syncSelectionState()
    }

    func errorText(_ error: Error) -> String {
        if case KeepDirError.message(let message) = error {
            return message
        }
        return error.localizedDescription
    }

    func loadAssistantSettings() {
        let settings = store.workspaceSettings[workspaceId]?["ruleAssistantSettings"]?.objectValue
        let provider = settings?["provider"]?.stringValue ?? "openai"
        if (try? RuleAssistant.ensureProvider(provider)) == nil {
            assistantProvider = "openai"
        } else {
            assistantProvider = provider
        }
        assistantEndpoint = settings?["endpoint"]?.stringValue ?? RuleAssistant.defaultEndpoint(assistantProvider)
        assistantModel = settings?["model"]?.stringValue ?? RuleAssistant.defaultModel(assistantProvider)
        assistantApiKey = (try? RuleAssistantKeychain.getApiKey(provider: assistantProvider)) ?? ""
        assistantStatus = assistantApiKey.isEmpty ? "No saved key." : "Key saved."
    }

    func assistantProviderChanged(_ provider: String) async {
        do {
            try RuleAssistant.ensureProvider(provider)
        } catch {
            assistantStatus = errorText(error)
            return
        }
        assistantProvider = provider
        assistantEndpoint = RuleAssistant.defaultEndpoint(provider)
        assistantModel = RuleAssistant.defaultModel(provider)
        assistantModels = []
        assistantApiKey = (try? RuleAssistantKeychain.getApiKey(provider: provider)) ?? ""
        await saveAssistantSettings()
    }

    func saveAssistantSettings() async {
        store.workspaceSettings[workspaceId, default: [:]]["ruleAssistantSettings"] = .object([
            "provider": .string(assistantProvider),
            "endpoint": .string(assistantEndpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? RuleAssistant.defaultEndpoint(assistantProvider) : assistantEndpoint.trimmingCharacters(in: .whitespacesAndNewlines)),
            "model": .string(assistantModel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? RuleAssistant.defaultModel(assistantProvider) : assistantModel.trimmingCharacters(in: .whitespacesAndNewlines))
        ])
        await save()
    }

    func saveAssistantKey() {
        do {
            try RuleAssistantKeychain.saveApiKey(provider: assistantProvider, apiKey: assistantApiKey)
            assistantStatus = assistantApiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Key cleared." : "Key saved."
        } catch {
            assistantStatus = errorText(error)
        }
    }

    func forgetAssistantKey() {
        do {
            try RuleAssistantKeychain.deleteApiKey(provider: assistantProvider)
            assistantApiKey = ""
            assistantStatus = "Key forgotten."
        } catch {
            assistantStatus = errorText(error)
        }
    }

    func loadAssistantModels() async {
        do {
            saveAssistantKey()
            await saveAssistantSettings()
            assistantStatus = "Loading models..."
            let apiKey = try RuleAssistantKeychain.resolveApiKey(provider: assistantProvider, apiKey: assistantApiKey)
            let request = try RuleAssistant.buildModelsRequest(provider: assistantProvider, endpoint: assistantEndpoint, apiKey: apiKey)
            let data = try await sendAssistantRequest(request)
            assistantModels = RuleAssistant.extractModelNames(provider: assistantProvider, data: data)
            if assistantModel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let first = assistantModels.first {
                assistantModel = first
                await saveAssistantSettings()
            }
            assistantStatus = assistantModels.isEmpty ? "No models returned." : "Loaded \(assistantModels.count) model(s)."
        } catch {
            assistantStatus = errorText(error)
        }
    }

    func draftAssistantRule() async {
        do {
            saveAssistantKey()
            await saveAssistantSettings()
            assistantStatus = "Drafting..."
            let apiKey = try RuleAssistantKeychain.resolveApiKey(provider: assistantProvider, apiKey: assistantApiKey)
            let request = try RuleAssistant.buildDraftRequest(provider: assistantProvider, endpoint: assistantEndpoint, model: assistantModel, description: assistantDescription, apiKey: apiKey)
            let data = try await sendAssistantRequest(request)
            guard let content = RuleAssistant.extractAssistantContent(provider: assistantProvider, data: data) else {
                throw KeepDirError.message("Rule assistant returned no content")
            }
            let drafted = try RuleAssistant.parseDraftedRules(content, startingOrder: rules.count)
            if drafted.isEmpty {
                throw KeepDirError.message("Rule assistant returned no rules")
            }
            var nextRules = rules
            nextRules.append(contentsOf: drafted)
            try await saveRules(nextRules)
            assistantStatus = drafted.count == 1 ? "Drafted 1 disabled rule." : "Drafted \(drafted.count) disabled rules."
        } catch {
            assistantStatus = errorText(error)
        }
    }

    func setRuleEnabled(_ id: String, enabled: Bool) async {
        await updateRule(id) { $0.enabled = enabled }
    }

    func updateRule(_ id: String, _ update: (inout FileRule) -> Void) async {
        do {
            try await saveRules(rulesUpdating(rules, id: id, update: update))
        } catch {
            message = errorText(error)
        }
    }

    func duplicateRule(_ id: String) async {
        do {
            try await saveRules(rulesDuplicating(rules, id: id, copyId: "rule-\(UUID().uuidString)"))
            message = "Copied rule as a disabled draft."
        } catch {
            message = errorText(error)
        }
    }

    func deleteRule(_ id: String) async {
        do {
            try await saveRules(rulesDeleting(rules, id: id))
            message = "Deleted rule."
        } catch {
            message = errorText(error)
        }
    }

    func moveRule(_ id: String, offset: Int) async {
        do {
            try await saveRules(rulesMoving(rules, id: id, offset: offset))
            message = "Reordered rule."
        } catch {
            message = errorText(error)
        }
    }

    func browseRuleTestFile() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url {
            ruleTestFilePath = url.path
        }
    }

    func testRulesForFile() {
        do {
            let filePath = ruleTestFilePath.trimmingCharacters(in: .whitespacesAndNewlines)
            var isDirectory = ObjCBool(false)
            guard FileManager.default.fileExists(atPath: filePath, isDirectory: &isDirectory), !isDirectory.boolValue else {
                ruleTestStatus = "Choose an existing file."
                return
            }
            let root = ruleTestRoot(filePath)
            let action = RuleEngine.evaluateRuleAction(
                id: "rule-test",
                workspaceId: workspaceId,
                folderPath: root,
                filePath: filePath,
                snapshot: try QueueEngine.snapshot(filePath),
                rules: rules,
                metadata: MetadataReader.readDownloadMetadata(filePath)
            )
            ruleTestStatus = ruleTestSummaryText(action, rootPath: root)
        } catch {
            ruleTestStatus = errorText(error)
        }
    }

    private func ruleTestRoot(_ filePath: String) -> String {
        let file = URL(fileURLWithPath: filePath).standardizedFileURL.path
        if let root = watchFolders.map(\.path).first(where: { root in
            let path = URL(fileURLWithPath: root).standardizedFileURL.path
            let prefix = path.hasSuffix("/") ? path : path + "/"
            return file == path || file.hasPrefix(prefix)
        }) {
            return root
        }
        return URL(fileURLWithPath: filePath).deletingLastPathComponent().path
    }

    func saveRules(_ nextRules: [FileRule]) async throws {
        let encodedRules = try JSONEncoder().encode(orderedRules(nextRules))
        store.workspaceSettings[workspaceId, default: [:]]["automationRules"] = try JSONDecoder().decode(JSONValue.self, from: encodedRules)
        _ = QueueEngine.refreshMatchingRuleActions(&store, workspaceId: workspaceId) { !QueueEngine.terminalStatus($0.status) }
        await save()
    }

    private func sendAssistantRequest(_ request: AssistantRequest) async throws -> Data {
        guard let url = URL(string: request.url) else {
            throw KeepDirError.message("Rule assistant URL is invalid")
        }
        var urlRequest = URLRequest(url: url, timeoutInterval: 30)
        urlRequest.httpMethod = request.method
        for (key, value) in request.headers {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }
        if let body = request.body {
            urlRequest.httpBody = body.data(using: .utf8)
        }
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw KeepDirError.message("Rule assistant request failed: \(http.statusCode)")
        }
        return data
    }

    func checkUpdates(force: Bool) async {
        if !force, !shouldCheckUpdatesToday(store.settings) {
            return
        }
        latestReleaseURL = URL(string: keepDirReleasesURLString)
        message = "Releases: open GitHub Releases to check for updates."
        store.settings.setObjectValue(["lastUpdateCheckDate": .string(keepDirTodayUtc())])
        await save()
    }

    func openLatestRelease() {
        NSWorkspace.shared.open(latestReleaseURL ?? URL(string: keepDirReleasesURLString)!)
    }

    func setOpenOnStartup(_ enabled: Bool) async {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try await SMAppService.mainApp.unregister()
            }
            openOnStartup = enabled
        } catch {
            message = error.localizedDescription
        }
    }

    func save() async {
        do {
            try await manager.save(store)
            store = try await manager.load()
            rebuildWatchersIfNeeded()
        } catch {
            message = String(describing: error)
        }
    }

    private func notifyIfNeeded() {
        let count = pendingCount
        let shouldNotify = shouldNotifyPending(previousPendingCount: lastPendingCount, pendingCount: count)
        lastPendingCount = count
        guard shouldNotify else {
            return
        }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = "KeepDir"
            content.body = "\(count) file(s) are ready to organize."
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "keepdir-pending", content: content, trigger: nil))
        }
    }
}


struct ContentView: View {
    @ObservedObject var model: AppModel
    @Binding var theme: String
    @State private var selectedWatchFolderId: String?
    @State private var selectedRuleId: String?
    @State private var leftPanelWidth: CGFloat = defaultLeftPanelWidth
    @State private var rightPanelWidth: CGFloat = defaultRightPanelWidth
    @State private var appliedStoredPanelWidths = false

    var tokens: KdTokens { KdTokens(theme: theme) }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                tokens.bg.ignoresSafeArea()
                VStack(spacing: 16) {
                    TopChromeView(model: model, theme: $theme, tokens: tokens)
                    HStack(spacing: 8) {
                        LeftRailView(model: model, tokens: tokens, selectedWatchFolderId: $selectedWatchFolderId)
                            .frame(width: clampedLeftWidth(available: contentAvailableWidth(proxy.size.width)))
                        KdSplitter(tokens: tokens, onChanged: { delta in
                            resizeLeftPanel(delta: delta, available: contentAvailableWidth(proxy.size.width))
                        }, onEnded: {
                            persistPanelWidths()
                        })
                        QueuePanelView(model: model, tokens: tokens)
                            .frame(minWidth: centerMinimumWidth(available: contentAvailableWidth(proxy.size.width)), maxWidth: .infinity)
                        KdSplitter(tokens: tokens, onChanged: { delta in
                            resizeRightPanel(delta: delta, available: contentAvailableWidth(proxy.size.width))
                        }, onEnded: {
                            persistPanelWidths()
                        })
                        RightRailView(model: model, tokens: tokens, selectedRuleId: $selectedRuleId)
                            .frame(width: clampedRightWidth(available: contentAvailableWidth(proxy.size.width)))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 16)
                .ignoresSafeArea(.container, edges: .top)
            }
            .foregroundStyle(tokens.text)
            .font(KdFont.body(12))
            .onAppear { applyStoredPanelWidthsIfNeeded() }
            .onChange(of: model.store.settings) { _ in applyStoredPanelWidthsIfNeeded() }
        }
    }

    func applyStoredPanelWidthsIfNeeded() {
        guard !appliedStoredPanelWidths, let widths = model.storedPanelWidths else {
            return
        }
        leftPanelWidth = widths.left
        rightPanelWidth = widths.right
        appliedStoredPanelWidths = true
    }

    func centerMinimumWidth(available: CGFloat) -> CGFloat {
        min(360, max(240, available - layoutReservedWidth - minLeftPanelWidth - minRightPanelWidth))
    }

    func contentAvailableWidth(_ windowWidth: CGFloat) -> CGFloat {
        max(0, windowWidth - horizontalShellPadding)
    }

    func clampedLeftWidth(available: CGFloat) -> CGFloat {
        let maxLeft = max(minLeftPanelWidth, available - layoutReservedWidth - centerMinimumWidth(available: available) - rightPanelWidth)
        return min(max(leftPanelWidth, minLeftPanelWidth), maxLeft)
    }

    func clampedRightWidth(available: CGFloat) -> CGFloat {
        let maxRight = max(minRightPanelWidth, available - layoutReservedWidth - centerMinimumWidth(available: available) - leftPanelWidth)
        return min(max(rightPanelWidth, minRightPanelWidth), maxRight)
    }

    func resizeLeftPanel(delta: CGFloat, available: CGFloat) {
        leftPanelWidth = min(max(leftPanelWidth + delta, minLeftPanelWidth), max(minLeftPanelWidth, available - layoutReservedWidth - centerMinimumWidth(available: available) - rightPanelWidth))
    }

    func resizeRightPanel(delta: CGFloat, available: CGFloat) {
        rightPanelWidth = min(max(rightPanelWidth - delta, minRightPanelWidth), max(minRightPanelWidth, available - layoutReservedWidth - centerMinimumWidth(available: available) - leftPanelWidth))
    }

    func persistPanelWidths() {
        let left = leftPanelWidth
        let right = rightPanelWidth
        Task { await model.savePanelWidths(left: left, right: right) }
    }
}

private let defaultLeftPanelWidth: CGFloat = 260
private let defaultRightPanelWidth: CGFloat = 340
private let minLeftPanelWidth: CGFloat = 210
private let minRightPanelWidth: CGFloat = 270
private let horizontalShellPadding: CGFloat = 32
private let layoutReservedWidth: CGFloat = 48

struct KdTokens {
    let theme: String
    var dark: Bool { theme == "dark" }

    var bg: Color { dark ? Color(hex: "#0c0c0d") : Color(hex: "#f4f4f1") }
    var surface: Color { dark ? Color(hex: "#141416") : Color(hex: "#fbfbf6") }
    var elevated: Color { dark ? Color(hex: "#1e1e22") : Color(hex: "#ecece4") }
    var card: Color { dark ? Color(hex: "#1a1a1d") : Color(hex: "#e9e9e1") }
    var hover: Color { dark ? Color(hex: "#242428") : Color(hex: "#dfdfd5") }
    var accentWash: Color { dark ? Color(hex: "#253018") : Color(hex: "#eaf0d3") }
    var text: Color { dark ? Color(hex: "#f4f4f2") : Color(hex: "#121211") }
    var secondary: Color { dark ? Color(hex: "#9c9c97") : Color(hex: "#6a6a64") }
    var selectedChipBg: Color { dark ? Color(hex: "#f4f4f2") : Color(hex: "#121211") }
    var selectedChipText: Color { dark ? Color(hex: "#101109") : Color(hex: "#f4f4f1") }
    var accent: Color { dark ? Color(hex: "#d4ff4f") : Color(hex: "#7c941f") }
    var accentBorder: Color { dark ? Color(hex: "#d4ff4f").opacity(0.30) : Color(hex: "#7c941f").opacity(0.20) }
    var accentInk: Color { Color(hex: "#101109") }
    var readyRow: Color { dark ? Color(hex: "#1d2317") : Color(hex: "#edf2de") }
    var danger: Color { Color(hex: "#ff5c5c") }
    var warning: Color { Color(hex: "#f5a623") }
    var info: Color { Color(hex: "#60a5fa") }
    var border: Color { dark ? Color.white.opacity(0.09) : Color.black.opacity(0.10) }
}

enum KdFont {
    static let bodyName = "Plus Jakarta Sans"
    static let monoName = "JetBrains Mono"

    static func registerBundledFonts() {
        for name in ["PlusJakartaSans", "JetBrainsMono"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }

    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        registerBundledFonts()
        return .custom(bodyName, size: size).weight(weight)
    }

    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        registerBundledFonts()
        return .custom(monoName, size: size).weight(weight)
    }
}

struct TopChromeView: View {
    @ObservedObject var model: AppModel
    @Binding var theme: String
    let tokens: KdTokens

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: 0) {
                HStack(spacing: 12) {
                    AppIconMark(tokens: tokens)
                        .frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("KeepDir")
                            .font(KdFont.body(16, weight: .semibold))
                            .foregroundStyle(tokens.text)
                            .accessibilityIdentifier("watch-folders-heading")
                        Text("FOLDER CLEANUP")
                            .font(KdFont.mono(10))
                            .foregroundStyle(tokens.secondary)
                    }
                }
                Spacer(minLength: 18)
                HStack(spacing: 18) {
                    HeaderMetric(value: "\(model.enabledFolderCount)", label: "FOLDERS", color: tokens.text, tokens: tokens)
                    HeaderMetric(value: "\(model.enabledRuleCount)", label: "RULES", color: tokens.text, tokens: tokens)
                    HeaderMetric(value: "\(model.pendingCount)", label: "READY", color: tokens.accent, tokens: tokens)
                    HeaderMetric(value: "\(model.attentionCount)", label: "CHECK", color: tokens.warning, tokens: tokens)
                }
                Spacer(minLength: 18)
            }
            .frame(maxWidth: .infinity)
            .overlay(NativeWindowDragArea())
            Button { theme = nextTheme(theme) } label: {
                Image(systemName: theme == "dark" ? "sun.max" : "moon")
                    .font(.system(size: 15, weight: .medium))
                    .frame(width: 36, height: 32)
                    .foregroundStyle(tokens.secondary)
            }
            .buttonStyle(.plain)
            .background(Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 9))
            .help(theme == "dark" ? "Light mode" : "Dark mode")
            HStack(spacing: 0) {
                WindowChromeButton(kind: .minimize, tokens: tokens)
                WindowChromeButton(kind: .maximize, tokens: tokens)
                WindowChromeButton(kind: .close, tokens: tokens)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .frame(height: 56)
        .background(tokens.surface)
        .overlay(KdRoundedBorder(tokens: tokens, radius: 12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

enum WindowChromeAction {
    case minimize
    case maximize
    case close
}

struct WindowChromeButton: View {
    let kind: WindowChromeAction
    let tokens: KdTokens

    var body: some View {
        Button(action: perform) {
            WindowChromeIcon(kind: kind)
                .stroke(tokens.secondary, style: StrokeStyle(lineWidth: 1.2, lineCap: .round, lineJoin: .round))
                .frame(width: 10, height: 10)
                .frame(width: 42, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 9))
        .help(help)
    }

    var help: String {
        switch kind {
        case .minimize: return "Minimize"
        case .maximize: return "Maximize"
        case .close: return "Close"
        }
    }

    @MainActor
    func perform() {
        guard let window = NSApp.keyWindow
            ?? NSApp.windows.first(where: { $0.title == "KeepDir" })
            ?? NSApp.windows.first(where: { $0.isVisible }) else {
            return
        }
        switch kind {
        case .minimize:
            window.miniaturize(nil)
        case .maximize:
            window.zoom(nil)
        case .close:
            window.orderOut(nil)
        }
    }
}

struct WindowChromeIcon: Shape {
    let kind: WindowChromeAction

    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch kind {
        case .minimize:
            path.move(to: CGPoint(x: rect.minX + 1, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX - 1, y: rect.midY))
        case .maximize:
            path.addRect(rect.insetBy(dx: 1.5, dy: 1.5))
        case .close:
            path.move(to: CGPoint(x: rect.minX + 2, y: rect.minY + 2))
            path.addLine(to: CGPoint(x: rect.maxX - 2, y: rect.maxY - 2))
            path.move(to: CGPoint(x: rect.maxX - 2, y: rect.minY + 2))
            path.addLine(to: CGPoint(x: rect.minX + 2, y: rect.maxY - 2))
        }
        return path
    }
}

struct HeaderMetric: View {
    let value: String
    let label: String
    let color: Color
    let tokens: KdTokens

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(value)
                .font(KdFont.body(18, weight: .semibold))
                .foregroundStyle(color)
            Text(" \(label)")
                .font(KdFont.mono(13))
                .foregroundStyle(tokens.secondary)
        }
    }
}

struct LeftRailView: View {
    @ObservedObject var model: AppModel
    let tokens: KdTokens
    @Binding var selectedWatchFolderId: String?

    var selectedFolder: WatchFolder? {
        let folders = model.watchFolders
        if let selectedWatchFolderId, let folder = folders.first(where: { $0.id == selectedWatchFolderId }) {
            return folder
        }
        return folders.first
    }

    var body: some View {
        ScrollView(showsIndicators: true) {
            VStack(spacing: 16) {
                engineCard
                sourcesCard
            }
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .scrollContentBackground(.hidden)
    }

    var engineCard: some View {
        KdPanel(tokens: tokens, padding: 16) {
            VStack(alignment: .leading, spacing: 0) {
                KdEyebrow("ENGINE", tokens: tokens)
                HStack(spacing: 8) {
                    Circle()
                        .fill(tokens.accent)
                        .frame(width: 12, height: 12)
                    Text("Active")
                        .font(KdFont.body(28, weight: .semibold))
                        .foregroundStyle(tokens.text)
                }
                .padding(.top, 8)
                Text("running")
                    .font(KdFont.body(13))
                    .foregroundStyle(tokens.secondary)
                    .padding(.top, 2)
                    .padding(.bottom, 18)
                DividerLine(tokens: tokens)
                    .padding(.bottom, 16)
                EngineStat(dot: tokens.secondary.opacity(0.7), eyebrow: "WATCHING", summary: model.enabledFolderCount == 1 ? "1 active" : "\(model.enabledFolderCount) active", value: "\(model.watchFolders.count)", valueColor: tokens.text, tokens: tokens)
                    .padding(.bottom, 10)
                EngineStat(dot: tokens.secondary.opacity(0.7), eyebrow: "RULES", summary: model.enabledRuleCount == 1 ? "1 enabled" : "\(model.enabledRuleCount) enabled", value: "\(model.rules.count)", valueColor: tokens.text, tokens: tokens)
                    .padding(.bottom, 10)
                EngineStat(dot: tokens.accent, eyebrow: "QUEUE", summary: "\(model.pendingCount) ready - \(model.attentionCount) flagged", value: "\(model.pendingCount)", valueColor: tokens.accent, tokens: tokens)
            }
        }
    }

    var sourcesCard: some View {
        KdPanel(tokens: tokens, padding: 16) {
            VStack(alignment: .leading, spacing: 0) {
                KdEyebrow("SOURCES", tokens: tokens)
                KdButton("+  Add watched folder", tokens: tokens, kind: .standard, height: 40) {
                    Task { await model.addFolder() }
                }
                .padding(.top, 14)
                .padding(.bottom, 10)
                KdButton("Open data folder", tokens: tokens, kind: .ghost, height: 34) {
                    model.openDataFolder()
                }
                Text(model.storePath)
                    .font(KdFont.mono(11))
                    .foregroundStyle(tokens.secondary)
                    .lineLimit(3)
                    .padding(.top, 12)
                    .padding(.bottom, 14)
                VStack(spacing: 8) {
                    ForEach(model.watchFolders, id: \.id) { folder in
                        Button {
                            selectedWatchFolderId = folder.id
                        } label: {
                            WatchFolderRow(folder: folder, selected: selectedFolder?.id == folder.id, tokens: tokens)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.bottom, 4)
                DividerLine(tokens: tokens)
                    .padding(.top, 2)
                    .padding(.bottom, 14)
                HStack {
                    KdEyebrow("Selected folder", tokens: tokens)
                    Spacer()
                    KdButton("Remove", tokens: tokens, kind: .ghost, width: 78, height: 30) {
                        guard let folder = selectedFolder else {
                            model.message = "Select a watched folder first."
                            return
                        }
                        Task { await model.removeFolder(folder.id) }
                    }
                }
                Text(selectedFolder?.path ?? "")
                    .font(KdFont.mono(11))
                    .foregroundStyle(tokens.secondary)
                    .lineLimit(3)
                    .padding(.top, 6)
                    .padding(.bottom, 8)
                HStack(spacing: 10) {
                    KdToggle(title: "On", isOn: Binding(
                        get: { selectedFolder?.enabled == true },
                        set: { enabled in if let folder = selectedFolder { Task { await model.setFolder(folder.id, enabled: enabled) } } }
                    ), tokens: tokens, switchStyle: true)
                    KdToggle(title: "Subfolders", isOn: Binding(
                        get: { selectedFolder?.recursive == true },
                        set: { recursive in if let folder = selectedFolder { Task { await model.setFolder(folder.id, recursive: recursive) } } }
                    ), tokens: tokens, switchStyle: true)
                }
                if !model.message.isEmpty {
                    Text(model.message)
                        .font(KdFont.body(12))
                        .foregroundStyle(tokens.secondary)
                        .lineLimit(3)
                        .padding(.top, 8)
                }
            }
        }
    }
}

struct EngineStat: View {
    let dot: Color
    let eyebrow: String
    let summary: String
    let value: String
    let valueColor: Color
    let tokens: KdTokens

    var body: some View {
        HStack(spacing: 0) {
            Circle()
                .fill(dot)
                .frame(width: 6, height: 6)
                .frame(width: 22, alignment: .leading)
            VStack(alignment: .leading, spacing: 1) {
                Text(eyebrow)
                    .font(KdFont.mono(10))
                    .foregroundStyle(tokens.secondary)
                Text(summary)
                    .font(KdFont.body(13))
                    .foregroundStyle(tokens.secondary)
            }
            Spacer()
            Text(value)
                .font(KdFont.body(18, weight: .semibold))
                .foregroundStyle(valueColor)
        }
    }
}

struct WatchFolderRow: View {
    let folder: WatchFolder
    let selected: Bool
    let tokens: KdTokens

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(URL(fileURLWithPath: folder.path).lastPathComponent.isEmpty ? folder.path : URL(fileURLWithPath: folder.path).lastPathComponent)
                    .font(KdFont.body(13, weight: .semibold))
                    .foregroundStyle(tokens.text)
                    .lineLimit(1)
                Spacer()
                Text("x")
                    .font(KdFont.body(12))
                    .foregroundStyle(tokens.secondary)
            }
            Text(folder.path)
                .font(KdFont.mono(10))
                .foregroundStyle(tokens.secondary)
                .lineLimit(1)
                .padding(.top, 2)
            HStack(spacing: 8) {
                Text(folder.enabled ? "On" : "Paused")
                    .font(KdFont.body(12))
                    .foregroundStyle(folder.enabled ? tokens.accent : tokens.secondary)
                Text(folder.recursive ? "Subfolders" : "Top folder")
                    .font(KdFont.body(12))
                    .foregroundStyle(folder.recursive ? tokens.accent : tokens.secondary)
            }
            .padding(.top, 8)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(selected ? tokens.accentWash : tokens.card)
        .overlay(RoundedRectangle(cornerRadius: 9).stroke(selected ? tokens.accent : .clear, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}

struct QueuePanelView: View {
    @ObservedObject var model: AppModel
    let tokens: KdTokens

    var allVisibleSelected: Bool {
        !model.visibleActions.isEmpty && Set(model.visibleActions.map(\.id)).isSubset(of: model.selectedActionIds)
    }

    var body: some View {
        KdPanel(tokens: tokens, padding: 16, border: tokens.accent) {
            VStack(spacing: 0) {
                queueHeader
                    .padding(.bottom, 12)
                queueList
                queueFooter
                    .padding(.top, 12)
            }
        }
    }

    var queueHeader: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    KdEyebrow("REVIEW", tokens: tokens)
                    Text("Queue")
                        .font(KdFont.body(22, weight: .semibold))
                        .foregroundStyle(tokens.text)
                        .accessibilityIdentifier("queue-heading")
                }
                Spacer()
                KdToggle(title: "History", isOn: $model.showHistory, tokens: tokens)
                    .accessibilityIdentifier("queue-history-toggle")
                Text("\(model.activeQueueCount)")
                    .font(KdFont.mono(11, weight: .semibold))
                    .foregroundStyle(tokens.accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(tokens.accentWash)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            HStack(spacing: 6) {
                QueueFilterChip(title: "ALL \(model.queueCount(filter: "all"))", tag: "all", model: model, tokens: tokens)
                QueueFilterChip(title: "READY \(model.queueCount(filter: "ready"))", tag: "ready", model: model, tokens: tokens)
                QueueFilterChip(title: "CHECK \(model.queueCount(filter: "check"))", tag: "check", model: model, tokens: tokens)
                QueueFilterChip(title: "BLOCKED \(model.queueCount(filter: "blocked"))", tag: "blocked", model: model, tokens: tokens)
                Spacer()
            }
            .padding(.top, 14)
        }
    }

    var queueList: some View {
        ZStack {
            if model.visibleActions.isEmpty {
                Text(queueEmptyStateText(filter: model.queueFilter, showHistory: model.showHistory))
                    .font(KdFont.body(13))
                    .foregroundStyle(tokens.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView(showsIndicators: true) {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(model.groupedVisibleActions, id: \.name) { group in
                            Text(group.name)
                                .font(KdFont.mono(11, weight: .semibold))
                                .foregroundStyle(tokens.secondary)
                                .padding(.top, 8)
                                .padding(.bottom, 5)
                            ForEach(group.actions, id: \.id) { action in
                                QueueRowView(action: action, selected: model.selectedActionIds.contains(action.id), tokens: tokens) {
                                    model.toggleActionSelection(action)
                                }
                                .padding(.bottom, 8)
                            }
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    var queueFooter: some View {
        VStack(spacing: 8) {
            if model.canRetargetSelection {
                HStack(spacing: 8) {
                    KdTextField(placeholder: "Target name", text: $model.retargetName, tokens: tokens, height: 30, accessibilityId: "queue-retarget-name")
                    KdButton("Rename", tokens: tokens, kind: .standard, width: 82, height: 30, accessibilityId: "queue-retarget-button") {
                        Task { await model.retargetSelected() }
                    }
                    .disabled(!model.canRetargetSelection)
                }
            } else {
                KdTextField(placeholder: "Target name", text: $model.retargetName, tokens: tokens, height: 30, accessibilityId: "queue-retarget-name")
                    .frame(width: 1, height: 1)
                    .opacity(0.01)
                    .allowsHitTesting(false)
                KdButton("Rename", tokens: tokens, kind: .standard, width: 82, height: 30, accessibilityId: "queue-retarget-button") {
                    Task { await model.retargetSelected() }
                }
                .frame(width: 1, height: 1)
                .opacity(0.01)
                .allowsHitTesting(false)
            }
            HStack(alignment: .center) {
                KdToggle(title: "Select all", state: model.selectAllState, tokens: tokens) {
                    model.setAllVisibleSelection($0)
                }
                Spacer(minLength: 10)
                HStack(spacing: 6) {
                    KdButton("Skip", tokens: tokens, kind: .ghost, width: 56, height: 30) { Task { await model.skipSelected() } }
                        .disabled(!model.canSkipSelected)
                    KdButton("Skip visible", tokens: tokens, kind: .ghost, width: 86, height: 30) { Task { await model.skipVisible() } }
                        .disabled(!model.canSkipVisible)
                    KdButton("Refresh", tokens: tokens, kind: .ghost, width: 74, height: 30) { Task { await model.refreshSelected() } }
                        .disabled(model.selectedActionIds.isEmpty)
                    KdButton("Undo", tokens: tokens, kind: .ghost, width: 62, height: 30, accessibilityId: "queue-undo-selected-button") { Task { await model.undoSelected() } }
                        .disabled(!model.canUndoSelected)
                    KdButton("Apply", tokens: tokens, kind: .primary, width: 70, height: 30, accessibilityId: "queue-apply-selected-button") { Task { await model.applySelected() } }
                        .disabled(!model.canApplySelected)
                    KdButton("Apply all ready", tokens: tokens, kind: .primary, width: 112, height: 30) { Task { await model.applyPending() } }
                        .disabled(model.pendingCount == 0)
                }
            }
            if !model.message.isEmpty {
                Text(model.message)
                    .font(KdFont.body(12))
                    .foregroundStyle(tokens.secondary)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 1)
            }
        }
    }
}

struct QueueFilterChip: View {
    let title: String
    let tag: String
    @ObservedObject var model: AppModel
    let tokens: KdTokens

    var selected: Bool { model.queueFilter == tag }

    var body: some View {
        Button { model.queueFilter = tag } label: {
            Text(title)
                .font(KdFont.mono(11, weight: .semibold))
                .foregroundStyle(selected ? tokens.selectedChipText : tokens.secondary)
                .padding(.horizontal, 9)
                .padding(.vertical, 3)
                .frame(minHeight: 24)
                .background(selected ? tokens.selectedChipBg : tokens.card)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

struct QueueRowView: View {
    let action: RuleAction
    let selected: Bool
    let tokens: KdTokens
    let actionHandler: () -> Void

    var rowBg: Color { action.status == "pending" ? tokens.readyRow : tokens.card }
    var rowBorder: Color { action.status == "pending" ? tokens.accentBorder : .clear }

    var body: some View {
        Button(action: actionHandler) {
            HStack(alignment: .top, spacing: 0) {
                KdCheckGlyph(state: selected ? .on : .off, tokens: tokens)
                    .frame(width: 16, height: 16)
                    .padding(.top, 2)
                    .padding(.trailing, 10)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 5) {
                        Text(action.originalName)
                            .font(KdFont.body(14, weight: .semibold))
                            .foregroundStyle(tokens.text)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(" -> ")
                            .font(KdFont.body(13))
                            .foregroundStyle(tokens.secondary)
                        Text(action.targetName ?? action.originalName)
                            .font(KdFont.body(13))
                            .foregroundStyle(tokens.secondary)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Text("from \(action.filePath)  rule: \(action.ruleName ?? "")")
                        .font(KdFont.mono(10))
                        .foregroundStyle(tokens.secondary)
                        .lineLimit(1)
                        .padding(.top, 3)
                    if let message = action.errorMessage, !message.isEmpty {
                        Text(message)
                            .font(KdFont.mono(10))
                            .foregroundStyle(tokens.danger)
                            .lineLimit(2)
                            .padding(.top, 4)
                    }
                }
                .frame(minWidth: 0, maxWidth: .infinity)
                StatusPill(status: action.status, tokens: tokens)
                    .padding(.leading, 10)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected ? tokens.accentWash : rowBg)
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(selected ? tokens.accent : rowBorder, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 9))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(ruleActionTooltipText(action) ?? "")
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(action.originalName), \(ruleActionStatusLabel(action.status))")
        .accessibilityIdentifier("queue-row-\(action.id)")
    }
}

struct StatusPill: View {
    let status: String
    let tokens: KdTokens

    var border: Color {
        switch status {
        case "pending": return tokens.accent
        case "needs_review", "stale": return tokens.warning
        case "conflict", "error": return tokens.danger
        default: return tokens.border
        }
    }

    var bg: Color { status == "pending" ? tokens.accentWash : tokens.elevated }

    var body: some View {
        Text(ruleActionStatusLabel(status))
            .font(KdFont.mono(11))
            .foregroundStyle(tokens.text)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(bg)
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}

struct RightRailView: View {
    @ObservedObject var model: AppModel
    let tokens: KdTokens
    @Binding var selectedRuleId: String?

    var selectedRule: FileRule? {
        let rules = model.rules
        if let selectedRuleId, let rule = rules.first(where: { $0.id == selectedRuleId }) {
            return rule
        }
        return rules.first
    }

    var body: some View {
        KdPanel(tokens: tokens, padding: 16) {
            ScrollView(showsIndicators: true) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Rules")
                        .font(KdFont.body(22, weight: .semibold))
                        .foregroundStyle(tokens.text)
                        .accessibilityIdentifier("rules-heading")
                    SettingsSection(model: model, tokens: tokens)
                        .padding(.top, 8)
                    AssistantSection(model: model, tokens: tokens)
                        .padding(.top, 14)
                    TryFileSection(model: model, tokens: tokens)
                        .padding(.top, 12)
                    RulesListSection(model: model, tokens: tokens, selectedRuleId: $selectedRuleId)
                        .padding(.top, 16)
                    RuleEditorSection(model: model, rule: selectedRule, tokens: tokens)
                        .padding(.top, 12)
                }
            }
            .scrollContentBackground(.hidden)
        }
    }
}

struct SettingsSection: View {
    @ObservedObject var model: AppModel
    let tokens: KdTokens

    var body: some View {
        KdDisclosure("Settings", tokens: tokens, expanded: true) {
            VStack(alignment: .leading, spacing: 0) {
                KdToggle(title: "Open on startup", isOn: Binding(
                    get: { model.openOnStartup },
                    set: { enabled in Task { await model.setOpenOnStartup(enabled) } }
                ), tokens: tokens, switchStyle: true)
                HStack(spacing: 8) {
                    KdButton("Check for updates", tokens: tokens, kind: .standard, width: 132, height: 34) { Task { await model.checkUpdates(force: true) } }
                    KdButton("Open release", tokens: tokens, kind: .ghost, width: 104, height: 34) { model.openLatestRelease() }
                        .disabled(model.latestReleaseURL == nil)
                }
                .padding(.top, 10)
                if !model.message.isEmpty {
                    Text(model.message)
                        .font(KdFont.body(12))
                        .foregroundStyle(tokens.secondary)
                        .lineLimit(2)
                        .padding(.top, 8)
                }
            }
            .padding(.top, 8)
        }
    }
}

struct AssistantSection: View {
    @ObservedObject var model: AppModel
    let tokens: KdTokens

    var body: some View {
        KdDisclosure("Assistant", tokens: tokens, expanded: true) {
            KdCard(tokens: tokens, padding: 14) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Tell KeepDir what to move")
                        .font(KdFont.body(12))
                        .foregroundStyle(tokens.secondary)
                        .padding(.top, 6)
                        .padding(.bottom, 6)
                    KdTextEditor(text: $model.assistantDescription, tokens: tokens, height: 72)
                    HStack(spacing: 12) {
                        KdButton("Draft", tokens: tokens, kind: .standard, height: 32) { Task { await model.draftAssistantRule() } }
                            .frame(maxWidth: .infinity)
                        KdButton("Load models", tokens: tokens, kind: .ghost, height: 32) { Task { await model.loadAssistantModels() } }
                            .frame(maxWidth: .infinity)
                    }
                    .padding(.vertical, 10)
                    KdDisclosure("Settings", tokens: tokens, expanded: false) {
                        VStack(alignment: .leading, spacing: 6) {
                            KdEyebrow("ASSISTANT SETTINGS", tokens: tokens)
                            KdPicker(selection: $model.assistantProvider, values: RuleAssistant.providerNames, tokens: tokens)
                                .onChange(of: model.assistantProvider) { provider in Task { await model.assistantProviderChanged(provider) } }
                            KdTextField(placeholder: "Base URL", text: $model.assistantEndpoint, tokens: tokens, height: 30)
                                .onSubmit { Task { await model.saveAssistantSettings() } }
                            if model.assistantModels.isEmpty {
                                KdTextField(placeholder: "Model", text: $model.assistantModel, tokens: tokens, height: 30)
                                    .onSubmit { Task { await model.saveAssistantSettings() } }
                            } else {
                                KdPicker(selection: $model.assistantModel, values: model.assistantModels, tokens: tokens)
                                    .onChange(of: model.assistantModel) { _ in Task { await model.saveAssistantSettings() } }
                            }
                            KdTextField(placeholder: "API key", text: $model.assistantApiKey, tokens: tokens, height: 30, secure: true)
                                .onSubmit { model.saveAssistantKey() }
                            KdButton("Forget key", tokens: tokens, kind: .ghost, width: 92, height: 30) { model.forgetAssistantKey() }
                        }
                        .padding(.top, 8)
                    }
                    if !model.assistantStatus.isEmpty {
                        Text(model.assistantStatus)
                            .font(KdFont.body(12))
                            .foregroundStyle(tokens.secondary)
                            .lineLimit(3)
                            .padding(.top, 8)
                    }
                }
            }
            .padding(.top, 8)
        }
    }
}

struct TryFileSection: View {
    @ObservedObject var model: AppModel
    let tokens: KdTokens

    var body: some View {
        KdDisclosure("Try a file", tokens: tokens, expanded: true) {
            KdCard(tokens: tokens, padding: 14) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("File name")
                        .font(KdFont.body(12))
                        .foregroundStyle(tokens.secondary)
                        .padding(.top, 8)
                        .padding(.bottom, 6)
                    KdTextField(placeholder: "File path", text: $model.ruleTestFilePath, tokens: tokens, height: 30)
                    HStack(spacing: 12) {
                        KdButton("Browse", tokens: tokens, kind: .ghost, height: 30) { model.browseRuleTestFile() }
                            .frame(maxWidth: .infinity)
                        KdButton("Test", tokens: tokens, kind: .standard, height: 30) { model.testRulesForFile() }
                            .frame(maxWidth: .infinity)
                    }
                    .padding(.top, 8)
                    if !model.ruleTestStatus.isEmpty {
                        Text(model.ruleTestStatus)
                            .font(KdFont.body(12))
                            .foregroundStyle(tokens.secondary)
                            .lineLimit(3)
                            .padding(.top, 8)
                    }
                }
            }
            .padding(.top, 8)
        }
    }
}

struct RulesListSection: View {
    @ObservedObject var model: AppModel
    let tokens: KdTokens
    @Binding var selectedRuleId: String?

    var body: some View {
        KdDisclosure("Rules", tokens: tokens, expanded: true) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("First match wins.")
                        .font(KdFont.body(12))
                        .foregroundStyle(tokens.secondary)
                    Spacer()
                    KdButton("+  Add", tokens: tokens, kind: .standard, width: 84, height: 34) {
                        Task {
                            let id = await model.createRule()
                            selectedRuleId = id
                        }
                    }
                }
                .padding(.bottom, 8)
                KdToggle(title: "Queue unmatched files", isOn: Binding(
                    get: { model.queueUnmatchedFiles },
                    set: { enabled in Task { await model.setQueueUnmatchedFiles(enabled) } }
                ), tokens: tokens)
                .padding(.bottom, 10)
                ScrollView(showsIndicators: true) {
                    VStack(spacing: 8) {
                        ForEach(model.rules, id: \.id) { rule in
                            Button { selectedRuleId = rule.id } label: {
                                RuleRowView(rule: rule, selected: selectedRuleId == rule.id || (selectedRuleId == nil && model.rules.first?.id == rule.id), tokens: tokens)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 260)
            }
            .padding(.top, 8)
        }
    }
}

struct RuleRowView: View {
    let rule: FileRule
    let selected: Bool
    let tokens: KdTokens

    var summaryLeft: String { rule.match.nameContains ?? "" }
    var summaryRight: String { rule.action.targetFolder ?? "" }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center) {
                Text(rule.name)
                    .font(KdFont.body(14, weight: .semibold))
                    .foregroundStyle(tokens.text)
                    .lineLimit(1)
                Spacer()
                Text(rule.enabled ? "ON" : "PAUSED")
                    .font(KdFont.mono(10))
                    .foregroundStyle(rule.enabled ? tokens.accent : tokens.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(tokens.accentWash)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            Text("\(summaryLeft)  ->  \(summaryRight)")
                .font(KdFont.mono(11))
                .foregroundStyle(tokens.secondary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 5)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(selected ? tokens.accentWash : tokens.card)
        .overlay(RoundedRectangle(cornerRadius: 9).stroke(selected ? tokens.accent : .clear, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}

struct RuleEditorSection: View {
    @ObservedObject var model: AppModel
    let rule: FileRule?
    let tokens: KdTokens

    var body: some View {
        KdDisclosure("Edit rule", tokens: tokens, expanded: true) {
            KdCard(tokens: tokens, padding: 12) {
                if let rule {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack {
                            Spacer()
                            KdToggle(title: "On", isOn: Binding(
                                get: { (model.rules.first { $0.id == rule.id } ?? rule).enabled },
                                set: { enabled in Task { await model.setRuleEnabled(rule.id, enabled: enabled) } }
                            ), tokens: tokens, switchStyle: true)
                        }
                        LabeledRuleField("Rule name", text: model.ruleText(rule, get: { $0.name }, set: { $0.name = $1 }), tokens: tokens)
                            .padding(.top, 10)
                        DividerLine(tokens: tokens)
                            .padding(.vertical, 11)
                        Text("Match")
                            .font(KdFont.body(12, weight: .semibold))
                            .foregroundStyle(tokens.text)
                        LabeledRuleField("Name contains", text: model.ruleText(rule, get: { $0.match.nameContains ?? "" }, set: { $0.match.nameContains = emptyNilGlobal($1) }), tokens: tokens)
                            .padding(.top, 8)
                        LabeledRuleField("Extensions", text: model.ruleText(rule, get: { $0.match.extensionIn.joined(separator: ", ") }, set: { $0.match.extensionIn = ruleEditorExtensions($1) }), tokens: tokens)
                            .padding(.top, 8)
                        LabeledRuleField("Source URL", text: model.ruleText(rule, get: { $0.match.sourceUrlContains ?? "" }, set: { $0.match.sourceUrlContains = emptyNilGlobal($1) }), tokens: tokens)
                            .padding(.top, 8)
                        LabeledRuleField("Downloaded from", text: model.ruleText(rule, get: { $0.match.downloadedFromContains ?? "" }, set: { $0.match.downloadedFromContains = emptyNilGlobal($1) }), tokens: tokens)
                            .padding(.top, 8)
                        DividerLine(tokens: tokens)
                            .padding(.vertical, 11)
                        Text("Action")
                            .font(KdFont.body(12, weight: .semibold))
                            .foregroundStyle(tokens.text)
                        LabeledRuleField("Target folder", text: model.ruleText(rule, get: { $0.action.targetFolder ?? "" }, set: { $0.action.targetFolder = emptyNilGlobal($1) }), tokens: tokens)
                            .padding(.top, 8)
                        LabeledRuleField("Target name", text: model.ruleText(rule, get: { $0.action.targetNameTemplate ?? "" }, set: { $0.action.targetNameTemplate = emptyNilGlobal($1) }), tokens: tokens)
                            .padding(.top, 8)
                        HStack(spacing: 8) {
                            KdToggle(title: "Ask first", isOn: model.ruleBool(rule, get: { $0.action.ask == true }, set: { $0.action.ask = $1 }), tokens: tokens)
                            KdToggle(title: "Stop after match", isOn: model.ruleBool(rule, get: { $0.stopOnMatch != false }, set: { $0.stopOnMatch = $1 }), tokens: tokens)
                        }
                        .padding(.vertical, 11)
                        HStack(spacing: 6) {
                            KdButton("Save", tokens: tokens, kind: .primary, height: 30) { Task { await model.flushRule(rule.id) } }
                            KdButton("Copy", tokens: tokens, kind: .ghost, height: 30) { Task { await model.duplicateRule(rule.id) } }
                            KdButton("Delete", tokens: tokens, kind: .ghost, height: 30) { Task { await model.deleteRule(rule.id) } }
                            KdButton("Up", tokens: tokens, kind: .ghost, height: 30) { Task { await model.moveRule(rule.id, offset: -1) } }
                            KdButton("Down", tokens: tokens, kind: .ghost, height: 30) { Task { await model.moveRule(rule.id, offset: 1) } }
                        }
                    }
                } else {
                    Text("Select or create a rule first.")
                        .font(KdFont.body(12))
                        .foregroundStyle(tokens.secondary)
                }
            }
            .padding(.top, 8)
        }
    }
}

struct LabeledRuleField: View {
    let label: String
    @Binding var text: String
    let tokens: KdTokens

    init(_ label: String, text: Binding<String>, tokens: KdTokens) {
        self.label = label
        self._text = text
        self.tokens = tokens
    }

    var body: some View {
        HStack(spacing: 0) {
            Text(label)
                .font(KdFont.body(11))
                .foregroundStyle(tokens.secondary)
                .frame(width: 92, alignment: .leading)
            KdTextField(placeholder: label, text: $text, tokens: tokens, height: 30)
        }
    }
}

struct KdPanel<Content: View>: View {
    let tokens: KdTokens
    let padding: CGFloat
    let border: Color?
    @ViewBuilder let content: Content

    init(tokens: KdTokens, padding: CGFloat = 16, border: Color? = nil, @ViewBuilder content: () -> Content) {
        self.tokens = tokens
        self.padding = padding
        self.border = border
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(tokens.surface)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(border ?? tokens.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct KdCard<Content: View>: View {
    let tokens: KdTokens
    let padding: CGFloat
    @ViewBuilder let content: Content

    init(tokens: KdTokens, padding: CGFloat, @ViewBuilder content: () -> Content) {
        self.tokens = tokens
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tokens.card)
            .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}

struct KdRoundedBorder: View {
    let tokens: KdTokens
    let radius: CGFloat
    var body: some View { RoundedRectangle(cornerRadius: radius).stroke(tokens.border, lineWidth: 1) }
}

struct KdEyebrow: View {
    let text: String
    let tokens: KdTokens
    init(_ text: String, tokens: KdTokens) { self.text = text; self.tokens = tokens }
    var body: some View {
        Text(text)
            .font(KdFont.mono(11))
            .foregroundStyle(tokens.secondary)
    }
}

struct DividerLine: View {
    let tokens: KdTokens
    var body: some View { Rectangle().fill(tokens.border).frame(height: 1) }
}

struct KdSplitter: View {
    let tokens: KdTokens
    let onChanged: (CGFloat) -> Void
    let onEnded: () -> Void
    @State private var isActive = false

    init(tokens: KdTokens, onChanged: @escaping (CGFloat) -> Void = { _ in }, onEnded: @escaping () -> Void = {}) {
        self.tokens = tokens
        self.onChanged = onChanged
        self.onEnded = onEnded
    }

    var body: some View {
        ZStack {
            Rectangle()
                .fill(Color.clear)
            Rectangle()
                .fill(isActive ? tokens.accent : tokens.border.opacity(0.55))
                .frame(width: isActive ? 2 : 1)
        }
            .frame(width: 8)
            .frame(maxHeight: .infinity)
            .overlay(
                NativeSplitterDragArea(
                    onDelta: onChanged,
                    onEnded: onEnded,
                    onActiveChanged: { isActive = $0 }
                )
            )
            .help("Drag to resize panels")
    }
}

struct NativeWindowDragArea: NSViewRepresentable {
    func makeNSView(context: Context) -> WindowDragNSView {
        WindowDragNSView()
    }

    func updateNSView(_ nsView: WindowDragNSView, context: Context) {}
}

final class WindowDragNSView: NSView {
    override func mouseDown(with event: NSEvent) {
        window?.performDrag(with: event)
    }
}

struct NativeSplitterDragArea: NSViewRepresentable {
    let onDelta: (CGFloat) -> Void
    let onEnded: () -> Void
    let onActiveChanged: (Bool) -> Void

    func makeNSView(context: Context) -> SplitterDragNSView {
        let view = SplitterDragNSView()
        view.onDelta = onDelta
        view.onEnded = onEnded
        view.onActiveChanged = onActiveChanged
        return view
    }

    func updateNSView(_ nsView: SplitterDragNSView, context: Context) {
        nsView.onDelta = onDelta
        nsView.onEnded = onEnded
        nsView.onActiveChanged = onActiveChanged
    }
}

final class SplitterDragNSView: NSView {
    var onDelta: (CGFloat) -> Void = { _ in }
    var onEnded: () -> Void = {}
    var onActiveChanged: (Bool) -> Void = { _ in }
    private var trackingAreaRef: NSTrackingArea?
    private var dragging = false
    private var lastDragX: CGFloat?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingAreaRef {
            removeTrackingArea(trackingAreaRef)
        }
        let options: NSTrackingArea.Options = [.activeInKeyWindow, .mouseEnteredAndExited, .inVisibleRect]
        let area = NSTrackingArea(rect: .zero, options: options, owner: self)
        trackingAreaRef = area
        addTrackingArea(area)
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .resizeLeftRight)
    }

    override func mouseEntered(with event: NSEvent) {
        onActiveChanged(true)
    }

    override func mouseExited(with event: NSEvent) {
        if !dragging {
            onActiveChanged(false)
        }
    }

    override func mouseDown(with event: NSEvent) {
        dragging = true
        lastDragX = event.locationInWindow.x
        onActiveChanged(true)
    }

    override func mouseDragged(with event: NSEvent) {
        let x = event.locationInWindow.x
        if let lastDragX {
            onDelta(x - lastDragX)
        }
        lastDragX = x
    }

    override func mouseUp(with event: NSEvent) {
        dragging = false
        lastDragX = nil
        onEnded()
        let point = convert(event.locationInWindow, from: nil)
        onActiveChanged(bounds.contains(point))
    }
}

enum KdButtonKind { case standard, ghost, primary }

struct KdButton: View {
    let title: String
    let tokens: KdTokens
    let kind: KdButtonKind
    let width: CGFloat?
    let height: CGFloat
    let accessibilityId: String?
    let action: () -> Void
    @Environment(\.isEnabled) private var isEnabled

    init(_ title: String, tokens: KdTokens, kind: KdButtonKind, width: CGFloat? = nil, height: CGFloat = 30, accessibilityId: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.tokens = tokens
        self.kind = kind
        self.width = width
        self.height = height
        self.accessibilityId = accessibilityId
        self.action = action
    }

    var bg: Color {
        switch kind {
        case .standard: return tokens.elevated
        case .ghost: return .clear
        case .primary: return tokens.accent
        }
    }

    var fg: Color {
        switch kind {
        case .primary: return tokens.accentInk
        case .ghost: return tokens.secondary
        case .standard: return tokens.text
        }
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(KdFont.body(12, weight: .semibold))
                .foregroundStyle(fg)
                .lineLimit(1)
                .frame(maxWidth: width == nil ? .infinity : nil)
                .frame(width: width, height: height)
                .padding(.horizontal, width == nil ? 13 : 0)
                .background(bg)
                .clipShape(RoundedRectangle(cornerRadius: 9))
        }
        .accessibilityIdentifier(accessibilityId ?? "")
        .buttonStyle(.plain)
        .opacity(isEnabled ? 1 : 0.42)
    }
}

enum KdCheckState { case off, on, mixed }

struct KdCheckGlyph: View {
    let state: KdCheckState
    let tokens: KdTokens

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4)
                .fill(state == .off ? tokens.elevated : tokens.accent)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(state == .off ? tokens.border : tokens.accent, lineWidth: 1))
            if state == .on {
                Path { path in
                    path.move(to: CGPoint(x: 3, y: 8))
                    path.addLine(to: CGPoint(x: 6.2, y: 11))
                    path.addLine(to: CGPoint(x: 12, y: 4.5))
                }
                .stroke(tokens.accentInk, style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
            } else if state == .mixed {
                RoundedRectangle(cornerRadius: 1)
                    .fill(tokens.accentInk)
                    .frame(width: 8, height: 2)
            }
        }
        .frame(width: 16, height: 16)
    }
}

struct KdToggle: View {
    let title: String
    let isOn: Binding<Bool>?
    let state: KdCheckState?
    let tokens: KdTokens
    let switchStyle: Bool
    let stateAction: ((Bool) -> Void)?

    init(title: String, isOn: Binding<Bool>, tokens: KdTokens, switchStyle: Bool = false) {
        self.title = title
        self.isOn = isOn
        self.state = nil
        self.tokens = tokens
        self.switchStyle = switchStyle
        self.stateAction = nil
    }

    init(title: String, state: KdCheckState, tokens: KdTokens, action: @escaping (Bool) -> Void) {
        self.title = title
        self.isOn = nil
        self.state = state
        self.tokens = tokens
        self.switchStyle = false
        self.stateAction = action
    }

    var checked: Bool { isOn?.wrappedValue ?? (state == .on) }

    var body: some View {
        Button {
            if let isOn { isOn.wrappedValue.toggle() }
            else { stateAction?(state != .on) }
        } label: {
            HStack(spacing: switchStyle ? 8 : 7) {
                if switchStyle {
                    ZStack(alignment: checked ? .trailing : .leading) {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(checked ? tokens.accent : tokens.elevated)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(checked ? tokens.accent : tokens.border, lineWidth: 1))
                            .frame(width: 36, height: 20)
                        Circle()
                            .fill(checked ? tokens.accentInk : tokens.surface)
                            .frame(width: 16, height: 16)
                            .padding(.horizontal, 2)
                    }
                } else {
                    KdCheckGlyph(state: state ?? (checked ? .on : .off), tokens: tokens)
                }
                Text(title)
                    .font(KdFont.body(12))
                    .foregroundStyle(tokens.secondary)
            }
        }
        .buttonStyle(.plain)
    }
}

struct KdTextField: View {
    let placeholder: String
    @Binding var text: String
    let tokens: KdTokens
    let height: CGFloat
    let secure: Bool
    let accessibilityId: String?

    init(placeholder: String, text: Binding<String>, tokens: KdTokens, height: CGFloat, secure: Bool = false, accessibilityId: String? = nil) {
        self.placeholder = placeholder
        self._text = text
        self.tokens = tokens
        self.height = height
        self.secure = secure
        self.accessibilityId = accessibilityId
    }

    var body: some View {
        Group {
            if secure {
                SecureField(placeholder, text: $text)
                    .textFieldStyle(.plain)
                    .accessibilityIdentifier(accessibilityId ?? "")
            } else {
                TextField(placeholder, text: $text)
                    .textFieldStyle(.plain)
                    .accessibilityIdentifier(accessibilityId ?? "")
            }
        }
        .font(KdFont.body(12))
        .foregroundStyle(tokens.text)
        .padding(.horizontal, 10)
        .frame(height: height)
        .background(tokens.elevated)
        .overlay(RoundedRectangle(cornerRadius: 9).stroke(.clear, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}

struct KdTextEditor: View {
    @Binding var text: String
    let tokens: KdTokens
    let height: CGFloat

    var body: some View {
        TextEditor(text: $text)
            .font(KdFont.body(12))
            .foregroundStyle(tokens.text)
            .scrollContentBackground(.hidden)
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .frame(height: height)
            .background(tokens.elevated)
            .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}

struct KdPicker: View {
    @Binding var selection: String
    let values: [String]
    let tokens: KdTokens

    var body: some View {
        Menu {
            ForEach(values, id: \.self) { value in
                Button {
                    selection = value
                } label: {
                    HStack {
                        Text(value)
                        if value == selection {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 0) {
                Text(selection.isEmpty ? (values.first ?? "") : selection)
                    .font(KdFont.body(12, weight: .semibold))
                    .foregroundStyle(tokens.text)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(tokens.secondary)
                    .frame(width: 18)
            }
            .padding(.leading, 10)
            .padding(.trailing, 10)
            .frame(height: 30)
            .frame(maxWidth: .infinity)
            .background(tokens.elevated)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .menuStyle(.borderlessButton)
        .buttonStyle(.plain)
        .frame(height: 30)
        .frame(maxWidth: .infinity)
    }
}

struct KdDisclosure<Content: View>: View {
    let title: String
    let tokens: KdTokens
    @State private var expanded: Bool
    @ViewBuilder let content: Content

    init(_ title: String, tokens: KdTokens, expanded: Bool, @ViewBuilder content: () -> Content) {
        self.title = title
        self.tokens = tokens
        self._expanded = State(initialValue: expanded)
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { expanded.toggle() } label: {
                HStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .fill(tokens.elevated)
                            .overlay(Circle().stroke(expanded ? tokens.accent : tokens.border, lineWidth: 1))
                            .frame(width: 18, height: 18)
                        Image(systemName: expanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(tokens.text)
                    }
                    Text(title)
                        .font(KdFont.body(12))
                        .foregroundStyle(tokens.secondary)
                }
                .padding(.vertical, 2)
            }
            .buttonStyle(.plain)
            if expanded {
                content
            }
        }
    }
}

struct AppIconMark: View {
    let tokens: KdTokens
    var image: NSImage? {
        guard let url = Bundle.main.url(forResource: "icon", withExtension: "png") else {
            return nil
        }
        return NSImage(contentsOf: url)
    }

    var body: some View {
        if let image {
            Image(nsImage: image)
                .resizable()
                .scaledToFit()
        } else {
            RoundedRectangle(cornerRadius: 8)
                .fill(tokens.accent)
                .overlay(
                    Image(systemName: "folder.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(tokens.accentInk)
                )
        }
    }
}

extension AppModel {
    var storePath: String { appDataDirectory().appendingPathComponent("keepdir.json").path }

    var storedPanelWidths: (left: CGFloat, right: CGFloat)? {
        guard let layout = store.settings.objectValue?["uiLayout"]?.objectValue else {
            return nil
        }

        let left = layout["leftPanelWidth"]?.doubleValue.map { CGFloat($0) }
        let right = layout["rightPanelWidth"]?.doubleValue.map { CGFloat($0) }
        guard left != nil || right != nil else {
            return nil
        }

        return (
            max(minLeftPanelWidth, left ?? defaultLeftPanelWidth),
            max(minRightPanelWidth, right ?? defaultRightPanelWidth)
        )
    }

    var enabledFolderCount: Int { watchFolders.filter(\.enabled).count }
    var enabledRuleCount: Int { rules.filter(\.enabled).count }
    var attentionCount: Int {
        store.ruleActions.values.flatMap { $0 }.filter { action in
            !QueueEngine.terminalStatus(action.status) && ["needs_review", "conflict", "error", "stale"].contains(action.status)
        }.count
    }
    var activeQueueCount: Int {
        store.ruleActions[workspaceId, default: []].filter { showHistory || !QueueEngine.terminalStatus($0.status) }.count
    }

    var selectedActions: [RuleAction] {
        let ids = selectedSelectionIds()
        return store.ruleActions[workspaceId, default: []].filter { ids.contains($0.id) }
    }

    var canRetargetSelection: Bool {
        selectedActions.count == 1 && ruleActionCanRetarget(selectedActions.first)
    }
    var canApplySelected: Bool {
        !selectedActions.isEmpty && selectedActions.allSatisfy { ruleActionCanApply($0) }
    }
    var canUndoSelected: Bool {
        !selectedActions.isEmpty && selectedActions.allSatisfy { ruleActionCanUndo($0) }
    }
    var canSkipSelected: Bool {
        !selectedActions.isEmpty && selectedActions.allSatisfy { ruleActionCanSkip($0) }
    }

    var selectAllState: KdCheckState {
        let visible = visibleActions.map(\.id)
        guard !visible.isEmpty else { return .off }
        let selectedVisible = visible.filter { selectedActionIds.contains($0) }.count
        if selectedVisible == 0 { return .off }
        if selectedVisible == visible.count { return .on }
        return .mixed
    }

    func queueCount(filter: String) -> Int {
        let active = store.ruleActions[workspaceId, default: []].filter { showHistory || !QueueEngine.terminalStatus($0.status) }
        switch filter {
        case "ready": return active.filter { $0.status == "pending" }.count
        case "check": return active.filter { $0.status == "needs_review" }.count
        case "blocked": return active.filter { ["conflict", "error", "stale"].contains($0.status) }.count
        default: return active.count
        }
    }

    func toggleActionSelection(_ action: RuleAction) {
        if selectedActionIds.contains(action.id) {
            selectedActionIds.remove(action.id)
        } else {
            selectedActionIds.insert(action.id)
        }
        syncSelectionState()
    }

    func setAllVisibleSelection(_ selected: Bool) {
        let ids = Set(visibleActions.map(\.id))
        if selected {
            selectedActionIds.formUnion(ids)
        } else {
            selectedActionIds.subtract(ids)
        }
        syncSelectionState()
    }

    func syncSelectionState() {
        if selectedActionIds.count == 1, let id = selectedActionIds.first,
           let action = store.ruleActions[workspaceId, default: []].first(where: { $0.id == id }) {
            selectedActionId = id
            retargetName = QueueEngine.suggestedRetargetName(action)
            message = action.errorMessage ?? ""
        } else {
            selectedActionId = nil
            if selectedActionIds.isEmpty {
                retargetName = ""
            }
        }
    }

    func openDataFolder() {
        NSWorkspace.shared.open(appDataDirectory())
    }

    func savePanelWidths(left: CGFloat, right: CGFloat) async {
        var settings = store.settings.objectValue ?? [:]
        var layout = settings["uiLayout"]?.objectValue ?? [:]
        layout["leftPanelWidth"] = .number(Double(left.rounded()))
        layout["rightPanelWidth"] = .number(Double(right.rounded()))
        settings["uiLayout"] = .object(layout)
        store.settings = .object(settings)
        await save()
    }

    func removeFolder(_ id: String) async {
        store.watchFolders[workspaceId, default: []].removeAll { $0.id == id }
        seen.removeAll()
        message = "Removed watched folder."
        await save()
    }

    func createRule() async -> String {
        let id = "rule-\(Int64(Date().timeIntervalSince1970 * 1000))"
        var next = rules
        next.append(FileRule(id: id, name: "New rule", enabled: false, order: next.count, match: RuleMatch(), action: RuleActionConfig(), stopOnMatch: true))
        do {
            try await saveRules(next)
            message = "Created draft rule. Save to persist."
        } catch {
            message = errorText(error)
        }
        return id
    }

    func flushRule(_ id: String) async {
        message = "Saved rule."
        await save()
    }

    func ruleText(_ rule: FileRule, get: @escaping (FileRule) -> String, set: @escaping (inout FileRule, String) -> Void) -> Binding<String> {
        Binding(
            get: { get(self.rules.first { $0.id == rule.id } ?? rule) },
            set: { value in Task { await self.updateRule(rule.id) { set(&$0, value) } } }
        )
    }

    func ruleBool(_ rule: FileRule, get: @escaping (FileRule) -> Bool, set: @escaping (inout FileRule, Bool) -> Void) -> Binding<Bool> {
        Binding(
            get: { get(self.rules.first { $0.id == rule.id } ?? rule) },
            set: { value in Task { await self.updateRule(rule.id) { set(&$0, value) } } }
        )
    }
}

func emptyNilGlobal(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}

extension Color {
    init(hex: String) {
        let value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var number: UInt64 = 0
        Scanner(string: value).scanHexInt64(&number)
        let r = Double((number >> 16) & 0xff) / 255.0
        let g = Double((number >> 8) & 0xff) / 255.0
        let b = Double(number & 0xff) / 255.0
        self.init(red: r, green: g, blue: b)
    }
}

func appDataDirectory() -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
    return base.appendingPathComponent("com.oshtz.keepdir")
}

extension JSONValue {
    var objectValue: [String: JSONValue]? {
        if case .object(let value) = self { return value }
        return nil
    }

    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var doubleValue: Double? {
        if case .number(let value) = self { return value }
        return nil
    }

    mutating func setObjectValue(_ values: [String: JSONValue]) {
        var object = objectValue ?? [:]
        for (key, value) in values {
            object[key] = value
        }
        self = .object(object)
    }
}
#else
@main
enum KeepDirMacApp {
    static func main() {
        print("KeepDirMacApp requires macOS.")
    }
}
#endif
