import Foundation
#if os(macOS)
import Darwin
import Security
#endif

public let keepDirDebounceIntervalNanoseconds: UInt64 = 250_000_000
public let keepDirStableScanIntervalNanoseconds: UInt64 = 500_000_000
public let keepDirPollingIntervalNanoseconds: UInt64 = 2 * 1_000_000_000
public let keepDirWatcherRebuildIntervalNanoseconds: UInt64 = 5 * 1_000_000_000
public let keepDirSafetyScanIntervalNanoseconds: UInt64 = 60 * 1_000_000_000
public let keepDirReleasesURLString = "https://github.com/oshtz/keepdir/releases"

public struct RuleMatch: Codable, Equatable, Sendable {
    public var nameContains: String?
    public var extensionIn: [String]
    public var sourceUrlContains: String?
    public var downloadedFromContains: String?

    public init(nameContains: String? = nil, extensionIn: [String] = [], sourceUrlContains: String? = nil, downloadedFromContains: String? = nil) {
        self.nameContains = nameContains
        self.extensionIn = extensionIn
        self.sourceUrlContains = sourceUrlContains
        self.downloadedFromContains = downloadedFromContains
    }

    enum CodingKeys: String, CodingKey {
        case nameContains
        case extensionIn
        case sourceUrlContains
        case downloadedFromContains
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        nameContains = try container.decodeIfPresent(String.self, forKey: .nameContains)
        extensionIn = try container.decodeIfPresent([String].self, forKey: .extensionIn) ?? []
        sourceUrlContains = try container.decodeIfPresent(String.self, forKey: .sourceUrlContains)
        downloadedFromContains = try container.decodeIfPresent(String.self, forKey: .downloadedFromContains)
    }
}

public struct RuleActionConfig: Codable, Equatable, Sendable {
    public var targetFolder: String?
    public var targetNameTemplate: String?
    public var ask: Bool?

    public init(targetFolder: String? = nil, targetNameTemplate: String? = nil, ask: Bool? = nil) {
        self.targetFolder = targetFolder
        self.targetNameTemplate = targetNameTemplate
        self.ask = ask
    }
}

public struct FileRule: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var enabled: Bool
    public var order: Int
    public var match: RuleMatch
    public var action: RuleActionConfig
    public var stopOnMatch: Bool?

    public init(id: String, name: String, enabled: Bool = true, order: Int = 0, match: RuleMatch = RuleMatch(), action: RuleActionConfig = RuleActionConfig(), stopOnMatch: Bool? = true) {
        self.id = id
        self.name = name
        self.enabled = enabled
        self.order = order
        self.match = match
        self.action = action
        self.stopOnMatch = stopOnMatch
    }
}

public struct DownloadMetadata: Codable, Equatable, Sendable {
    public var sourceUrl: String?
    public var downloadedFrom: String?

    public init(sourceUrl: String? = nil, downloadedFrom: String? = nil) {
        self.sourceUrl = sourceUrl
        self.downloadedFrom = downloadedFrom
    }
}

public struct FileSnapshot: Equatable, Sendable {
    public var size: UInt64
    public var mtimeMs: UInt64

    public init(size: UInt64 = 0, mtimeMs: UInt64 = 0) {
        self.size = size
        self.mtimeMs = mtimeMs
    }
}

public struct RuleTraceItem: Codable, Equatable, Sendable {
    public var ruleId: String
    public var ruleName: String
    public var matched: Bool
    public var uncertain: Bool
    public var reasons: [String]
}

public struct RuleAction: Codable, Equatable, Sendable {
    public var id: String
    public var workspaceId: String
    public var folderPath: String
    public var filePath: String
    public var originalName: String
    public var targetPath: String?
    public var targetName: String?
    public var ruleId: String?
    public var ruleName: String?
    public var ruleTrace: [RuleTraceItem]
    public var status: String
    public var fileSize: UInt64
    public var fileMtimeMs: UInt64
    public var errorMessage: String?
    public var appliedSourcePath: String?
    public var appliedTargetPath: String?
    public var createdAt: String
    public var updatedAt: String
}

public struct WatchFolder: Codable, Equatable, Sendable {
    public var id: String
    public var path: String
    public var enabled: Bool
    public var createdAt: String?
    public var recursive: Bool

    public init(id: String, path: String, enabled: Bool, createdAt: String? = nil, recursive: Bool = false) {
        self.id = id
        self.path = path
        self.enabled = enabled
        self.createdAt = createdAt
        self.recursive = recursive
    }

    enum CodingKeys: String, CodingKey {
        case id
        case path
        case enabled
        case createdAt
        case recursive
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        path = try container.decode(String.self, forKey: .path)
        enabled = try container.decode(Bool.self, forKey: .enabled)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        recursive = try container.decodeIfPresent(Bool.self, forKey: .recursive) ?? false
    }
}

public enum JSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null:
            try container.encodeNil()
        case .bool(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        }
    }
}

public func keepDirTodayUtc() -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date())
}

public func shouldCheckUpdatesToday(_ settings: JSONValue) -> Bool {
    guard case .object(let object) = settings,
          case .string(let lastCheck)? = object["lastUpdateCheckDate"] else {
        return true
    }
    return lastCheck != keepDirTodayUtc()
}

public func shouldNotifyPending(previousPendingCount: Int?, pendingCount: Int) -> Bool {
    previousPendingCount == 0 && pendingCount > 0
}

public func pendingRenamesMenuLabel(_ pendingCount: Int) -> String {
    "Pending renames: \(pendingCount)"
}

public func renamePendingFilesMenuLabel(_ pendingCount: Int) -> String {
    pendingCount == 1 ? "Rename 1 pending file" : "Rename \(pendingCount) pending files"
}

public func nextTheme(_ theme: String) -> String {
    theme == "dark" ? "light" : "dark"
}

public func themeToggleLabel(_ theme: String) -> String {
    theme == "dark" ? "Light theme" : "Dark theme"
}

public func ruleSummaryText(_ rule: FileRule) -> String {
    var conditions: [String] = []
    if let value = rule.match.nameContains?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
        conditions.append("name contains \(value)")
    }
    if !rule.match.extensionIn.isEmpty {
        conditions.append("extension \(rule.match.extensionIn.joined(separator: ", "))")
    }
    if let value = rule.match.sourceUrlContains?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
        conditions.append("source URL contains \(value)")
    }
    if let value = rule.match.downloadedFromContains?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
        conditions.append("downloaded from contains \(value)")
    }

    var actions: [String] = []
    if let value = rule.action.targetFolder?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
        actions.append("folder \(value)")
    }
    if let value = rule.action.targetNameTemplate?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
        actions.append("name \(value)")
    }
    if rule.action.ask == true {
        actions.append("ask")
    }

    return "\(conditions.isEmpty ? "matches all files" : conditions.joined(separator: ", ")) -> \(actions.isEmpty ? "keep" : actions.joined(separator: ", "))"
}

public func rulesWithEnabled(_ rules: [FileRule], id: String, enabled: Bool) -> [FileRule] {
    rulesUpdating(rules, id: id) { rule in
        rule.enabled = enabled
    }
}

public func rulesUpdating(_ rules: [FileRule], id: String, update: (inout FileRule) -> Void) -> [FileRule] {
    orderedRules(rules.map { rule in
        var copy = rule
        if copy.id == id {
            update(&copy)
        }
        return copy
    })
}

public func rulesDeleting(_ rules: [FileRule], id: String) -> [FileRule] {
    orderedRules(rules.filter { $0.id != id })
}

public func rulesDuplicating(_ rules: [FileRule], id: String, copyId: String) -> [FileRule] {
    guard let index = rules.firstIndex(where: { $0.id == id }) else {
        return orderedRules(rules)
    }
    var copy = rules[index]
    copy.id = copyId
    copy.name = "\(copy.name) copy"
    copy.enabled = false
    var next = rules
    next.insert(copy, at: index + 1)
    return orderedRules(next)
}

public func rulesMoving(_ rules: [FileRule], id: String, offset: Int) -> [FileRule] {
    guard let index = rules.firstIndex(where: { $0.id == id }) else {
        return orderedRules(rules)
    }
    let nextIndex = index + offset
    guard rules.indices.contains(nextIndex) else {
        return orderedRules(rules)
    }
    var next = rules
    next.swapAt(index, nextIndex)
    return orderedRules(next)
}

public func orderedRules(_ rules: [FileRule]) -> [FileRule] {
    rules.enumerated().map { index, rule in
        var copy = rule
        copy.order = index
        return copy
    }
}

public func ruleEditorExtensions(_ value: String) -> [String] {
    let separators = CharacterSet(charactersIn: ",; \n\t")
    return value
        .components(separatedBy: separators)
        .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: ".").union(.whitespacesAndNewlines)).lowercased() }
        .filter { !$0.isEmpty }
}

public func queueEmptyStateText(filter: String, showHistory: Bool) -> String {
    switch filter {
    case "ready":
        "No ready files."
    case "check":
        "No files need review."
    case "blocked":
        "No blocked files."
    default:
        showHistory ? "No queue history yet." : "No active queue items."
    }
}

public func ruleActionGroupName(_ action: RuleAction) -> String {
    let name = action.ruleName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return name.isEmpty ? "Unmatched" : name
}

public func ruleActionStatusLabel(_ status: String) -> String {
    switch status {
    case "pending":
        "ready"
    case "needs_review":
        "check"
    case "conflict":
        "blocked"
    case "stale":
        "warning"
    case "error":
        "danger"
    case "applied", "skipped", "undone":
        "history"
    default:
        status
    }
}

public func ruleActionTooltipText(_ action: RuleAction) -> String? {
    var lines: [String] = []
    if let message = action.errorMessage?.trimmingCharacters(in: .whitespacesAndNewlines), !message.isEmpty {
        lines.append(message)
    }
    for item in action.ruleTrace {
        let state = item.uncertain ? "uncertain" : item.matched ? "matched" : "not matched"
        let reasons = item.reasons.isEmpty ? "" : ": \(item.reasons.joined(separator: "; "))"
        lines.append("\(item.ruleName) - \(state)\(reasons)")
    }
    return lines.isEmpty ? nil : lines.joined(separator: "\n")
}

public func ruleTestSummaryText(_ action: RuleAction, rootPath: String) -> String {
    let target = ruleTestTargetText(action, rootPath: rootPath)
    let rule = action.ruleName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let error = action.errorMessage?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return "\(action.status): \(target)"
        + (rule.isEmpty ? "" : " via \(rule)")
        + (error.isEmpty ? "" : " - \(error)")
}

private func ruleTestTargetText(_ action: RuleAction, rootPath: String) -> String {
    guard let targetPath = action.targetPath else {
        return action.originalName
    }
    let root = URL(fileURLWithPath: rootPath).standardizedFileURL.path
    let target = URL(fileURLWithPath: targetPath).standardizedFileURL.path
    let prefix = root.hasSuffix("/") ? root : root + "/"
    return target.hasPrefix(prefix) ? String(target.dropFirst(prefix.count)) : (action.targetName ?? action.originalName)
}

public func ruleActionCanRetarget(_ action: RuleAction?) -> Bool {
    guard let action else { return false }
    return !["applied", "undone", "skipped"].contains(action.status)
}

public func ruleActionCanApply(_ action: RuleAction?) -> Bool {
    action?.status == "pending"
}

public func ruleActionCanUndo(_ action: RuleAction?) -> Bool {
    action?.status == "applied"
}

public func ruleActionCanSkip(_ action: RuleAction?) -> Bool {
    guard let action else { return false }
    return !QueueEngine.terminalStatus(action.status)
}

public struct Store: Codable, Equatable, Sendable {
    public var settings: JSONValue
    public var workspaceSettings: [String: [String: JSONValue]]
    public var watchFolders: [String: [WatchFolder]]
    public var ruleActions: [String: [RuleAction]]

    public init(
        settings: JSONValue = .object([:]),
        workspaceSettings: [String: [String: JSONValue]] = [:],
        watchFolders: [String: [WatchFolder]] = [:],
        ruleActions: [String: [RuleAction]] = [:]
    ) {
        self.settings = settings
        self.workspaceSettings = workspaceSettings
        self.watchFolders = watchFolders
        self.ruleActions = ruleActions
    }
}

public enum KeepDirError: Error, Equatable {
    case message(String)
}

public enum RuleEngine {
    public static func evaluateRuleAction(
        id: String,
        workspaceId: String,
        folderPath: String,
        filePath: String,
        snapshot: FileSnapshot,
        rules: [FileRule],
        metadata: DownloadMetadata = DownloadMetadata()
    ) -> RuleAction {
        let originalName = lastPathComponent(filePath)
        let ext = fileExtension(originalName)
        var trace: [RuleTraceItem] = []
        var action = RuleActionConfig()
        var matchedRule: FileRule?
        var uncertainReason: String?

        for rule in rules.filter(\.enabled).sorted(by: { $0.order < $1.order }) {
            let result = ruleMatches(rule, originalName: originalName, extension: ext, metadata: metadata)
            trace.append(RuleTraceItem(ruleId: rule.id, ruleName: rule.name, matched: result.matched, uncertain: result.uncertain, reasons: result.reasons))
            if !result.matched {
                continue
            }

            matchedRule = rule
            if result.uncertain {
                uncertainReason = result.reasons.joined(separator: "; ")
                break
            }
            if rule.action.targetFolder != nil {
                action.targetFolder = rule.action.targetFolder
            }
            if rule.action.targetNameTemplate != nil {
                action.targetNameTemplate = rule.action.targetNameTemplate
            }
            if rule.action.ask != nil {
                action.ask = rule.action.ask
            }
            if rule.stopOnMatch ?? true {
                break
            }
        }

        var row = RuleAction(
            id: id,
            workspaceId: workspaceId,
            folderPath: folderPath,
            filePath: filePath,
            originalName: originalName,
            targetPath: nil,
            targetName: nil,
            ruleId: matchedRule?.id,
            ruleName: matchedRule?.name,
            ruleTrace: trace,
            status: "pending",
            fileSize: snapshot.size,
            fileMtimeMs: snapshot.mtimeMs,
            errorMessage: nil,
            appliedSourcePath: nil,
            appliedTargetPath: nil,
            createdAt: nowString(),
            updatedAt: nowString()
        )

        if matchedRule == nil {
            row.status = "needs_review"
            row.errorMessage = "No rule matched"
            return row
        }
        if let uncertainReason {
            row.status = "needs_review"
            row.errorMessage = uncertainReason
            return row
        }
        if action.ask == true {
            row.status = "needs_review"
            row.errorMessage = "Rule is set to ask before acting"
            return row
        }

        do {
            let target = try buildTargetPath(folderPath: folderPath, originalName: originalName, action: action)
            if samePath(filePath, target.path) {
                row.status = "needs_review"
                row.errorMessage = "Rule does not change this file"
            } else if FileManager.default.fileExists(atPath: target.path) {
                row.status = "conflict"
                row.errorMessage = "Target already exists"
            }
            row.targetPath = target.path
            row.targetName = target.name
        } catch KeepDirError.message(let message) {
            row.status = "error"
            row.errorMessage = message
        } catch {
            row.status = "error"
            row.errorMessage = String(describing: error)
        }

        return row
    }

    public static func safeFilename(_ raw: String) throws -> String {
        let invalid = Set("<>:\"/\\|?*")
        var name = String(raw.map { ch in
            if ch.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) || invalid.contains(ch) {
                return "_"
            }
            return ch
        }).trimmingCharacters(in: .whitespacesAndNewlines)
        name = name.trimmingCharacters(in: CharacterSet(charactersIn: "."))
        if name.isEmpty {
            throw KeepDirError.message("Target filename is empty after sanitizing")
        }
        if windowsReservedFilename(name) {
            if let dot = name.firstIndex(of: ".") {
                name.insert("_", at: dot)
            } else {
                name.append("_")
            }
        }
        return name
    }

    public static func buildTargetPath(folderPath: String, originalName: String, action: RuleActionConfig) throws -> (path: String, name: String) {
        let targetDir = try safeTargetDir(root: folderPath, targetFolder: action.targetFolder)
        let targetName = if let template = action.targetNameTemplate, !template.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            try expandTemplate(template, originalName: originalName)
        } else {
            originalName
        }
        return (join(targetDir, targetName), targetName)
    }

    static func ruleMatches(_ rule: FileRule, originalName: String, extension ext: String, metadata: DownloadMetadata) -> (matched: Bool, uncertain: Bool, reasons: [String]) {
        var reasons: [String] = []
        if let needle = rule.match.nameContains, !needle.isEmpty {
            if !originalName.localizedCaseInsensitiveContains(needle) {
                return (false, false, ["name does not contain \"\(needle)\""])
            }
            reasons.append("name contains \"\(needle)\"")
        }
        if !rule.match.extensionIn.isEmpty {
            let allowed = rule.match.extensionIn.map { $0.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased() }
            if !allowed.contains(ext) {
                return (false, false, ["extension is not \(allowed.joined(separator: ", "))"])
            }
            reasons.append("extension is \(ext.isEmpty ? "(none)" : ext)")
        }
        if let needle = rule.match.sourceUrlContains, !needle.isEmpty {
            if let source = metadata.sourceUrl, source.localizedCaseInsensitiveContains(needle) {
                reasons.append("source URL contains \"\(needle)\"")
            } else if metadata.sourceUrl != nil {
                return (false, false, ["source URL does not contain \"\(needle)\""])
            } else {
                return (true, true, ["source URL metadata unavailable"])
            }
        }
        if let needle = rule.match.downloadedFromContains, !needle.isEmpty {
            if let source = metadata.downloadedFrom, source.localizedCaseInsensitiveContains(needle) {
                reasons.append("downloaded-from contains \"\(needle)\"")
            } else if metadata.downloadedFrom != nil {
                return (false, false, ["downloaded-from does not contain \"\(needle)\""])
            } else {
                return (true, true, ["downloaded-from metadata unavailable"])
            }
        }
        if reasons.isEmpty {
            reasons.append("matched all files")
        }
        return (true, false, reasons)
    }

    static func expandTemplate(_ template: String, originalName: String) throws -> String {
        let ext = fileExtension(originalName)
        let base = fileStem(originalName)
        let date = todayUtc()
        return try safeFilename(template
            .replacingOccurrences(of: "{name}", with: originalName)
            .replacingOccurrences(of: "{originalName}", with: originalName)
            .replacingOccurrences(of: "{basename}", with: base)
            .replacingOccurrences(of: "{ext}", with: ext)
            .replacingOccurrences(of: "{date}", with: date))
    }

    static func safeTargetDir(root: String, targetFolder: String?) throws -> String {
        guard let targetFolder, !targetFolder.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return root
        }
        if targetFolder.hasPrefix("/") || targetFolder.hasPrefix("\\") || targetFolder.range(of: #"^[A-Za-z]:"#, options: .regularExpression) != nil {
            throw KeepDirError.message("Target folder must stay inside the watched folder")
        }
        var target = root
        for part in targetFolder.split(whereSeparator: { $0 == "/" || $0 == "\\" }).map(String.init) {
            if part == "." {
                continue
            }
            if part == ".." {
                throw KeepDirError.message("Target folder must stay inside the watched folder")
            }
            target = join(target, try expandTargetFolderSegment(part))
        }
        return target
    }

    static func expandTargetFolderSegment(_ raw: String) throws -> String {
        let date = todayUtc()
        return try safeFilename(raw
            .replacingOccurrences(of: "{date}", with: date)
            .replacingOccurrences(of: "{yyyy}", with: String(date.prefix(4)))
            .replacingOccurrences(of: "{mm}", with: String(date.dropFirst(5).prefix(2))))
    }

    static func windowsReservedFilename(_ name: String) -> Bool {
        let stem = name.split(separator: ".").first.map(String.init) ?? ""
        let upper = stem.trimmingCharacters(in: CharacterSet(charactersIn: " ")).uppercased()
        if ["CON", "PRN", "AUX", "NUL"].contains(upper) {
            return true
        }
        guard upper.count == 4 else { return false }
        let prefix = String(upper.prefix(3))
        let suffix = String(upper.suffix(1))
        return (prefix == "COM" || prefix == "LPT") && "123456789".contains(suffix)
    }

    static func fileExtension(_ name: String) -> String {
        let component = lastPathComponent(name)
        guard let dot = component.lastIndex(of: "."), dot != component.startIndex else {
            return ""
        }
        return String(component[component.index(after: dot)...]).lowercased()
    }

    static func fileStem(_ name: String) -> String {
        let component = lastPathComponent(name)
        guard let dot = component.lastIndex(of: "."), dot != component.startIndex else {
            return component
        }
        return String(component[..<dot])
    }

    static func lastPathComponent(_ path: String) -> String {
        path.replacingOccurrences(of: "\\", with: "/").split(separator: "/").last.map(String.init) ?? path
    }

    static func join(_ first: String, _ second: String) -> String {
        let prefix = first.hasPrefix("/") ? "/" : ""
        let base = first.trimmingCharacters(in: CharacterSet(charactersIn: "/\\"))
        return base.isEmpty ? prefix + second : prefix + base + "/" + second
    }

    static func samePath(_ first: String, _ second: String) -> Bool {
        first == second
    }

    static func todayUtc() -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    static func nowString() -> String {
        String(Int64(Date().timeIntervalSince1970 * 1000))
    }
}

public actor StoreManager {
    let directory: URL
    var cache: Store?

    public init(directory: URL) {
        self.directory = directory
    }

    public var storeURL: URL {
        directory.appendingPathComponent("keepdir.json")
    }

    public func load() throws -> Store {
        if let cache {
            return cache
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = storeURL
        guard FileManager.default.fileExists(atPath: url.path) else {
            cache = Store()
            return cache!
        }

        do {
            let store = try JSONDecoder().decode(Store.self, from: Data(contentsOf: url))
            cache = store
            return store
        } catch {
            let backupURL = url.deletingPathExtension().appendingPathExtension("json.bak")
            guard FileManager.default.fileExists(atPath: backupURL.path) else {
                throw error
            }
            let store = try JSONDecoder().decode(Store.self, from: Data(contentsOf: backupURL))
            cache = store
            return store
        }
    }

    public func save(_ store: Store) throws {
        var store = store
        _ = QueueEngine.pruneRuleActions(&store)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(store)
        let url = storeURL
        let tmpURL = url.deletingPathExtension().appendingPathExtension("json.tmp")
        let backupURL = url.deletingPathExtension().appendingPathExtension("json.bak")

        try data.write(to: tmpURL, options: .atomic)
        if FileManager.default.fileExists(atPath: url.path) {
            if FileManager.default.fileExists(atPath: backupURL.path) {
                try FileManager.default.removeItem(at: backupURL)
            }
            try FileManager.default.copyItem(at: url, to: backupURL)
            try FileManager.default.removeItem(at: url)
        }
        try FileManager.default.moveItem(at: tmpURL, to: url)
        cache = store
    }
}

public enum QueueEngine {
    public static let terminalHistoryRetentionMs: UInt64 = 30 * 24 * 60 * 60 * 1000
    public static let maxRuleActionsPerWorkspace = 1_000

    public static func terminalStatus(_ status: String) -> Bool {
        ["applied", "skipped", "stale", "undone"].contains(status)
    }

    public static func canUpdateRuleActionStatus(current: String, next: String) -> Bool {
        next == "skipped" && !terminalStatus(current)
    }

    public static func skipOne(_ action: inout RuleAction) throws {
        guard canUpdateRuleActionStatus(current: action.status, next: "skipped") else {
            throw KeepDirError.message("Cannot skip \(action.status).")
        }
        action.status = "skipped"
        action.errorMessage = nil
        action.updatedAt = nowString()
    }

    public static func suggestedRetargetName(_ action: RuleAction) -> String {
        let targetName = action.targetName ?? action.originalName
        guard action.status == "conflict", let targetPath = action.targetPath else {
            return targetName
        }

        let parent = URL(fileURLWithPath: targetPath).deletingLastPathComponent()
        let stem = (targetName as NSString).deletingPathExtension
        let ext = (targetName as NSString).pathExtension
        var index = 2
        while true {
            let candidate = ext.isEmpty ? "\(stem)-\(index)" : "\(stem)-\(index).\(ext)"
            if !FileManager.default.fileExists(atPath: parent.appendingPathComponent(candidate).path) {
                return candidate
            }
            index += 1
        }
    }

    public static func snapshot(_ path: String) throws -> FileSnapshot {
        let attributes = try FileManager.default.attributesOfItem(atPath: path)
        let size = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
        let modified = attributes[.modificationDate] as? Date ?? Date(timeIntervalSince1970: 0)
        return FileSnapshot(size: size, mtimeMs: UInt64(modified.timeIntervalSince1970 * 1000))
    }

    public static func actionDedupeKey(_ filePath: String, _ snapshot: FileSnapshot) -> String {
        "\(canonicalPath(filePath)):\(snapshot.size):\(snapshot.mtimeMs)"
    }

    public static func actionId(_ filePath: String, _ snapshot: FileSnapshot) -> String {
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in actionDedupeKey(filePath, snapshot).utf8 {
            hash ^= UInt64(byte)
            hash &*= 0x100000001b3
        }
        return "rule-action-\(nowMs())-\(String(hash, radix: 16))"
    }

    public static func queueFile(_ store: inout Store, workspaceId: String, folderPath: String, filePath: String, snapshot: FileSnapshot) -> Bool {
        let exists = store.ruleActions[workspaceId, default: []].contains {
            $0.filePath == filePath && $0.fileSize == snapshot.size && $0.fileMtimeMs == snapshot.mtimeMs
        }
        return exists ? false : pushRuleAction(&store, workspaceId: workspaceId, folderPath: folderPath, filePath: filePath, snapshot: snapshot)
    }

    public static func pushRuleAction(_ store: inout Store, workspaceId: String, folderPath: String, filePath: String, snapshot: FileSnapshot) -> Bool {
        let row = RuleEngine.evaluateRuleAction(
            id: actionId(filePath, snapshot),
            workspaceId: workspaceId,
            folderPath: folderPath,
            filePath: filePath,
            snapshot: snapshot,
            rules: normalizedRules(store.workspaceSettings[workspaceId]?["automationRules"]),
            metadata: MetadataReader.readDownloadMetadata(filePath)
        )
        if row.ruleId == nil,
           row.errorMessage == "No rule matched",
           workspaceBool(store, workspaceId: workspaceId, key: "queueUnmatchedFiles") == false {
            return false
        }
        store.ruleActions[workspaceId, default: []].append(row)
        return true
    }

    public static func normalizedRules(_ value: JSONValue?) -> [FileRule] {
        guard let value,
              let data = try? JSONEncoder().encode(value),
              let rules = try? JSONDecoder().decode([FileRule].self, from: data) else {
            return []
        }
        return rules.sorted { $0.order < $1.order }
    }

    public static func applyOne(_ action: inout RuleAction) throws {
        guard let targetPath = action.targetPath else {
            action.status = "needs_review"
            action.errorMessage = "Action has no target path"
            action.updatedAt = nowString()
            throw KeepDirError.message("Action has no target path")
        }
        guard action.status == "pending" else {
            throw KeepDirError.message("Action is not ready to apply")
        }
        guard try sourceMatches(action, path: action.filePath) else {
            markStale(&action)
            throw KeepDirError.message("File changed since action was generated")
        }

        if containsParentDir(targetPath) || !pathInside(root: action.folderPath, target: targetPath) {
            try markApplyError(&action, "Target path must stay inside the watched folder")
        }
        if samePath(action.filePath, targetPath) {
            action.status = "needs_review"
            action.errorMessage = "Rule does not change this file"
            action.updatedAt = nowString()
            throw KeepDirError.message("Rule does not change this file")
        }
        if FileManager.default.fileExists(atPath: targetPath) {
            action.status = "conflict"
            action.errorMessage = "Target already exists"
            action.updatedAt = nowString()
            throw KeepDirError.message("Target already exists")
        }

        let parent = parentPath(targetPath)
        do {
            try rejectSymlinkAncestors(root: action.folderPath, targetParent: parent)
        } catch KeepDirError.message(let message) {
            try markApplyError(&action, message)
        } catch {
            try markApplyError(&action, String(describing: error))
        }
        try FileManager.default.createDirectory(atPath: parent, withIntermediateDirectories: true)
        try moveNoReplace(from: action.filePath, to: targetPath)

        action.status = "applied"
        action.errorMessage = nil
        action.appliedSourcePath = action.filePath
        action.appliedTargetPath = targetPath
        action.updatedAt = nowString()
    }

    public static func undoOne(_ action: inout RuleAction) throws {
        guard action.status == "applied" else {
            throw KeepDirError.message("Only applied actions can be undone")
        }
        let sourcePath = action.appliedSourcePath ?? action.filePath
        guard let targetPath = action.appliedTargetPath ?? action.targetPath else {
            throw KeepDirError.message("Action has no applied target path")
        }

        guard pathInside(root: action.folderPath, target: sourcePath), pathInside(root: action.folderPath, target: targetPath) else {
            action.errorMessage = "Undo path must stay inside the watched folder"
            action.updatedAt = nowString()
            throw KeepDirError.message("Undo path must stay inside the watched folder")
        }
        if FileManager.default.fileExists(atPath: sourcePath) {
            action.errorMessage = "Original path already exists"
            action.updatedAt = nowString()
            throw KeepDirError.message("Original path already exists")
        }
        guard try sourceMatches(action, path: targetPath) else {
            action.errorMessage = FileManager.default.fileExists(atPath: targetPath) ? "Moved file changed since apply" : "Moved file is missing"
            action.updatedAt = nowString()
            throw KeepDirError.message(action.errorMessage!)
        }

        let parent = parentPath(sourcePath)
        try rejectSymlinkAncestors(root: action.folderPath, targetParent: parent)
        try FileManager.default.createDirectory(atPath: parent, withIntermediateDirectories: true)
        try moveNoReplace(from: targetPath, to: sourcePath)

        action.status = "undone"
        action.errorMessage = nil
        action.updatedAt = nowString()
    }

    public static func retargetOne(_ action: inout RuleAction, targetName: String) throws {
        if ["applied", "undone", "skipped"].contains(action.status) {
            throw KeepDirError.message("Action target can only be changed before apply")
        }
        guard let currentTarget = action.targetPath else {
            throw KeepDirError.message("Action has no target path")
        }
        guard try sourceMatches(action, path: action.filePath) else {
            markStale(&action)
            throw KeepDirError.message("File changed since action was generated")
        }

        let safeName = try RuleEngine.safeFilename(targetName)
        let parent = parentPath(currentTarget)
        let targetPath = join(parent, safeName)
        guard pathInside(root: action.folderPath, target: targetPath) else {
            throw KeepDirError.message("Target path must stay inside the watched folder")
        }
        try rejectSymlinkAncestors(root: action.folderPath, targetParent: parent)

        action.targetPath = targetPath
        action.targetName = safeName
        if samePath(action.filePath, targetPath) {
            action.status = "needs_review"
            action.errorMessage = "Rule does not change this file"
        } else if FileManager.default.fileExists(atPath: targetPath) {
            action.status = "conflict"
            action.errorMessage = "Target already exists"
        } else {
            action.status = "pending"
            action.errorMessage = nil
        }
        action.updatedAt = nowString()
    }

    public static func refreshMatchingRuleActions(_ store: inout Store, workspaceId: String, shouldRefresh: (RuleAction) -> Bool) -> Bool {
        let selected = store.ruleActions[workspaceId, default: []].filter(shouldRefresh)
        if selected.isEmpty {
            return false
        }

        let selectedIds = Set(selected.map(\.id))
        store.ruleActions[workspaceId, default: []].removeAll { selectedIds.contains($0.id) }
        for var action in selected {
            if isRegularFile(action.filePath), let snapshot = try? snapshot(action.filePath) {
                _ = pushRuleAction(&store, workspaceId: workspaceId, folderPath: action.folderPath, filePath: action.filePath, snapshot: snapshot)
            } else {
                action.status = "stale"
                action.errorMessage = "File changed since action was generated"
                action.updatedAt = nowString()
                store.ruleActions[workspaceId, default: []].append(action)
            }
        }
        return true
    }

    public static func pruneRuleActions(_ store: inout Store) -> Set<String> {
        let cutoff = nowMs().saturatingSubtracting(terminalHistoryRetentionMs)
        var changed = Set<String>()
        for workspaceId in store.ruleActions.keys {
            let before = store.ruleActions[workspaceId]?.count ?? 0
            store.ruleActions[workspaceId]?.removeAll { action in
                terminalStatus(action.status) && (UInt64(action.updatedAt) ?? UInt64.max) < cutoff
            }
            let overflow = (store.ruleActions[workspaceId]?.count ?? 0) - maxRuleActionsPerWorkspace
            if overflow > 0, var actions = store.ruleActions[workspaceId] {
                let removeIds = actions
                    .filter { terminalStatus($0.status) }
                    .sorted { (UInt64($0.updatedAt) ?? UInt64.max) < (UInt64($1.updatedAt) ?? UInt64.max) }
                    .prefix(overflow)
                    .map(\.id)
                let remove = Set(removeIds)
                actions.removeAll { remove.contains($0.id) }
                store.ruleActions[workspaceId] = actions
            }
            if store.ruleActions[workspaceId]?.count != before {
                changed.insert(workspaceId)
            }
        }
        return changed
    }

    static func sourceMatches(_ action: RuleAction, path: String) throws -> Bool {
        guard isRegularFile(path) else {
            return false
        }
        let current = try snapshot(path)
        return current.size == action.fileSize && current.mtimeMs == action.fileMtimeMs
    }

    static func isRegularFile(_ path: String) -> Bool {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: path) else {
            return false
        }
        return (attributes[.type] as? FileAttributeType) == .typeRegular
    }

    static func workspaceBool(_ store: Store, workspaceId: String, key: String) -> Bool {
        if case .bool(let value) = store.workspaceSettings[workspaceId]?[key] {
            return value
        }
        return false
    }

    static func moveNoReplace(from: String, to: String) throws {
        if FileManager.default.fileExists(atPath: to) {
            throw KeepDirError.message("Target already exists")
        }
        #if os(Windows)
        // ponytail: Windows-only SwiftPM test fallback; macOS product keeps hard-link + unlink.
        try FileManager.default.moveItem(atPath: from, toPath: to)
        #else
        try FileManager.default.linkItem(atPath: from, toPath: to)
        do {
            try FileManager.default.removeItem(atPath: from)
        } catch {
            try? FileManager.default.removeItem(atPath: to)
            throw error
        }
        #endif
    }

    static func rejectSymlinkAncestors(root: String, targetParent: String) throws {
        let rootURL = URL(fileURLWithPath: root).standardizedFileURL
        let parentURL = URL(fileURLWithPath: targetParent).standardizedFileURL
        let rootParts = rootURL.pathComponents
        let parentParts = parentURL.pathComponents
        guard parentParts.starts(with: rootParts) else {
            throw KeepDirError.message("Target parent must stay inside the watched folder")
        }

        var current = URL(fileURLWithPath: rootURL.path)
        for part in parentParts.dropFirst(rootParts.count) {
            current.appendPathComponent(part)
            if let values = try? current.resourceValues(forKeys: [.isSymbolicLinkKey]), values.isSymbolicLink == true {
                throw KeepDirError.message("Target directory resolves through a symlink")
            }
        }
    }

    static func pathInside(root: String, target: String) -> Bool {
        let rootPath = URL(fileURLWithPath: root).standardizedFileURL.path.trimmingCharacters(in: CharacterSet(charactersIn: "/\\"))
        let targetPath = URL(fileURLWithPath: target).standardizedFileURL.path.trimmingCharacters(in: CharacterSet(charactersIn: "/\\"))
        return targetPath == rootPath || targetPath.hasPrefix(rootPath + "/")
    }

    static func containsParentDir(_ path: String) -> Bool {
        path.split(whereSeparator: { $0 == "/" || $0 == "\\" }).contains("..")
    }

    static func samePath(_ first: String, _ second: String) -> Bool {
        canonicalPath(first) == canonicalPath(second)
    }

    static func canonicalPath(_ path: String) -> String {
        URL(fileURLWithPath: path).standardizedFileURL.path
    }

    static func parentPath(_ path: String) -> String {
        URL(fileURLWithPath: path).deletingLastPathComponent().path
    }

    static func join(_ first: String, _ second: String) -> String {
        URL(fileURLWithPath: first).appendingPathComponent(second).path
    }

    static func markStale(_ action: inout RuleAction) {
        action.status = "stale"
        action.errorMessage = "File changed since action was generated"
        action.updatedAt = nowString()
    }

    static func markApplyError(_ action: inout RuleAction, _ message: String) throws -> Never {
        action.status = "error"
        action.errorMessage = message
        action.updatedAt = nowString()
        throw KeepDirError.message(message)
    }

    static func nowMs() -> UInt64 {
        UInt64(Date().timeIntervalSince1970 * 1000)
    }

    static func nowString() -> String {
        String(nowMs())
    }
}

extension UInt64 {
    fileprivate func saturatingSubtracting(_ other: UInt64) -> UInt64 {
        self > other ? self - other : 0
    }
}

public enum MetadataReader {
    public static func parseWindowsZoneIdentifier(_ content: String) -> DownloadMetadata {
        var values: [String: String] = [:]
        for line in content.split(whereSeparator: { $0 == "\n" || $0 == "\r" }) {
            guard let index = line.firstIndex(of: "=") else {
                continue
            }
            let key = line[..<index].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let value = line[line.index(after: index)...].trimmingCharacters(in: .whitespacesAndNewlines)
            values[key] = value
        }
        return DownloadMetadata(
            sourceUrl: values["hosturl"] ?? values["referrerurl"],
            downloadedFrom: values["appname"]
        )
    }

    public static func downloadMetadataFromWhereFroms(_ values: [String]) -> DownloadMetadata {
        let cleaned = values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return DownloadMetadata(
            sourceUrl: cleaned.first,
            downloadedFrom: cleaned.isEmpty ? nil : cleaned.joined(separator: " ")
        )
    }

    public static func parseMacOSWhereFroms(_ data: Data) -> DownloadMetadata {
        guard let value = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) else {
            return DownloadMetadata()
        }
        if let values = value as? [String] {
            return downloadMetadataFromWhereFroms(values)
        }
        if let value = value as? String {
            return downloadMetadataFromWhereFroms([value])
        }
        return DownloadMetadata()
    }

    public static func readDownloadMetadata(_ path: String) -> DownloadMetadata {
        #if os(macOS)
        let name = "com.apple.metadata:kMDItemWhereFroms"
        let size = getxattr(path, name, nil, 0, 0, 0)
        guard size > 0 else {
            return DownloadMetadata()
        }
        var data = Data(count: size)
        let read = data.withUnsafeMutableBytes { buffer in
            getxattr(path, name, buffer.baseAddress, size, 0, 0)
        }
        return read > 0 ? parseMacOSWhereFroms(data) : DownloadMetadata()
        #else
        return DownloadMetadata()
        #endif
    }
}

public struct SeenFile: Equatable, Sendable {
    public var snapshot: FileSnapshot
    public var queued: Bool

    public init(snapshot: FileSnapshot, queued: Bool = false) {
        self.snapshot = snapshot
        self.queued = queued
    }
}

public enum Scanner {
    public static func scanStore(_ store: inout Store, seen: inout [String: SeenFile]) -> Set<String> {
        let result = scanPaths(store.watchFolders, seen: &seen)
        return applyScanResult(&store, result: result, markStaleActions: true)
    }

    static func scanPaths(_ watchFolders: [String: [WatchFolder]], seen: inout [String: SeenFile]) -> ScanResult {
        var result = ScanResult()
        var currentKeys = Set<String>()
        for (workspaceId, folders) in watchFolders {
            for folder in folders where folder.enabled {
                scanFolder(seen: &seen, currentKeys: &currentKeys, result: &result, workspaceId: workspaceId, folderPath: folder.path, currentPath: folder.path, recursive: folder.recursive)
            }
        }
        for key in Set(seen.keys).subtracting(currentKeys) {
            seen.removeValue(forKey: key)
        }
        return result
    }

    static func scanFolder(seen: inout [String: SeenFile], currentKeys: inout Set<String>, result: inout ScanResult, workspaceId: String, folderPath: String, currentPath: String, recursive: Bool) {
        guard let entries = try? FileManager.default.contentsOfDirectory(at: URL(fileURLWithPath: currentPath), includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey]) else {
            return
        }
        for entry in entries {
            let path = entry.path
            let key = "\(workspaceId):\(QueueEngine.canonicalPath(path))"
            currentKeys.insert(key)
            result.activeKeys[workspaceId, default: []].insert(key)

            let values = try? entry.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            if values?.isSymbolicLink == true {
                continue
            }
            if values?.isDirectory == true {
                if recursive {
                    scanFolder(seen: &seen, currentKeys: &currentKeys, result: &result, workspaceId: workspaceId, folderPath: folderPath, currentPath: path, recursive: recursive)
                }
                continue
            }
            guard let snapshot = try? QueueEngine.snapshot(path) else {
                continue
            }
            let previous = seen[key]
            let stable = previous?.snapshot == snapshot
            if stable && previous?.queued != true {
                result.candidates.append(QueueCandidate(workspaceId: workspaceId, folderPath: folderPath, filePath: path, snapshot: snapshot))
            }
            seen[key] = SeenFile(snapshot: snapshot, queued: stable)
        }
    }

    static func applyScanResult(_ store: inout Store, result: ScanResult, markStaleActions: Bool) -> Set<String> {
        var changed = Set<String>()
        var actionKeys = store.ruleActions.mapValues { actions in
            Set(actions.map { QueueEngine.actionDedupeKey($0.filePath, FileSnapshot(size: $0.fileSize, mtimeMs: $0.fileMtimeMs)) })
        }
        for candidate in result.candidates {
            guard watchFolderEnabled(store, workspaceId: candidate.workspaceId, folderPath: candidate.folderPath) else {
                continue
            }
            let key = QueueEngine.actionDedupeKey(candidate.filePath, candidate.snapshot)
            if actionKeys[candidate.workspaceId, default: []].contains(key) {
                continue
            }
            if QueueEngine.pushRuleAction(&store, workspaceId: candidate.workspaceId, folderPath: candidate.folderPath, filePath: candidate.filePath, snapshot: candidate.snapshot) {
                actionKeys[candidate.workspaceId, default: []].insert(key)
                changed.insert(candidate.workspaceId)
            }
        }
        if markStaleActions {
            markOutOfScopeActionsStale(&store, activeKeys: result.activeKeys, changed: &changed)
        }
        return changed
    }

    static func watchFolderEnabled(_ store: Store, workspaceId: String, folderPath: String) -> Bool {
        store.watchFolders[workspaceId, default: []].contains { $0.enabled && QueueEngine.samePath($0.path, folderPath) }
    }

    static func markOutOfScopeActionsStale(_ store: inout Store, activeKeys: [String: Set<String>], changed: inout Set<String>) {
        for workspaceId in store.ruleActions.keys {
            var actions = store.ruleActions[workspaceId, default: []]
            for index in actions.indices {
                if QueueEngine.terminalStatus(actions[index].status) || actions[index].status == "stale" {
                    continue
                }
                let key = "\(workspaceId):\(QueueEngine.canonicalPath(actions[index].filePath))"
                if activeKeys[workspaceId, default: []].contains(key) {
                    continue
                }
                actions[index].status = "stale"
                actions[index].errorMessage = "File is no longer in the watched scope"
                actions[index].updatedAt = QueueEngine.nowString()
                changed.insert(workspaceId)
            }
            store.ruleActions[workspaceId] = actions
        }
    }
}

public struct QueueCandidate: Equatable, Sendable {
    public var workspaceId: String
    public var folderPath: String
    public var filePath: String
    public var snapshot: FileSnapshot
}

struct ScanResult {
    var activeKeys: [String: Set<String>] = [:]
    var candidates: [QueueCandidate] = []
}

public struct AssistantRequest: Equatable, Sendable {
    public var method: String
    public var url: String
    public var headers: [String: String]
    public var body: String?
}

public enum RuleAssistant {
    public static let prompt = "Draft one or more KeepDir FileRule objects as JSON only. Return either one object or an array. Allowed keys: name, match.nameContains, match.extensionIn, match.sourceUrlContains, match.downloadedFromContains, action.targetFolder, action.targetNameTemplate, action.ask, stopOnMatch. Do not invent other keys. Use relative target folders. If the user asks to move or sort files, set action.targetFolder. Set action.ask true when the request is ambiguous."

    public static let providerNames = ["openai", "google", "anthropic", "openrouter", "lmstudio", "ollama"]
    static let providerDefaults: [String: (endpoint: String, model: String)] = [
        "openai": ("https://api.openai.com/v1", "gpt-5.4-mini"),
        "google": ("https://generativelanguage.googleapis.com/v1beta", "gemini-3-flash-preview"),
        "anthropic": ("https://api.anthropic.com/v1", "claude-opus-4-8"),
        "openrouter": ("https://openrouter.ai/api/v1", "openai/gpt-5.4-mini"),
        "lmstudio": ("http://localhost:1234/v1", "openai/gpt-oss-20b"),
        "ollama": ("http://localhost:11434/v1", "gemma3")
    ]

    public static func ensureProvider(_ provider: String) throws {
        if !providerDefaults.keys.contains(provider) {
            throw KeepDirError.message("Unknown rule assistant provider")
        }
    }

    public static func defaultEndpoint(_ provider: String) -> String {
        providerDefaults[provider]?.endpoint ?? providerDefaults["openai"]!.endpoint
    }

    public static func defaultModel(_ provider: String) -> String {
        providerDefaults[provider]?.model ?? providerDefaults["openai"]!.model
    }

    public static func endpointBase(_ endpoint: String) throws -> String {
        let value = endpoint.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if value.isEmpty {
            throw KeepDirError.message("Rule assistant base URL is empty")
        }
        return value
    }

    public static func buildModelsRequest(provider: String, endpoint: String, apiKey: String) throws -> AssistantRequest {
        try ensureProvider(provider)
        var request = AssistantRequest(method: "GET", url: "\(try endpointBase(endpoint))/models", headers: [:], body: nil)
        applyAuth(&request, provider: provider, apiKey: apiKey)
        return request
    }

    public static func buildDraftRequest(provider: String, endpoint: String, model: String, description: String, apiKey: String) throws -> AssistantRequest {
        try ensureProvider(provider)
        let endpoint = try endpointBase(endpoint)
        let model = model.trimmingCharacters(in: .whitespacesAndNewlines)
        if model.isEmpty {
            throw KeepDirError.message("Rule assistant model is empty")
        }
        if description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw KeepDirError.message("Rule description is empty")
        }

        let url: String
        let body: [String: Any]
        if provider == "anthropic" {
            url = "\(endpoint)/messages"
            body = [
                "model": model,
                "max_tokens": 800,
                "temperature": 0,
                "system": prompt,
                "messages": [["role": "user", "content": description]]
            ]
        } else if provider == "google" {
            let modelName = model.hasPrefix("models/") ? String(model.dropFirst("models/".count)) : model
            url = "\(endpoint)/models/\(modelName):generateContent"
            body = [
                "contents": [[
                    "role": "user",
                    "parts": [["text": "\(prompt)\n\nUser request:\n\(description)"]]
                ]],
                "generationConfig": ["temperature": 0, "responseMimeType": "application/json"]
            ]
        } else {
            url = "\(endpoint)/chat/completions"
            body = [
                "model": model,
                "temperature": 0,
                "messages": [
                    ["role": "system", "content": prompt],
                    ["role": "user", "content": description]
                ]
            ]
        }

        var request = AssistantRequest(method: "POST", url: url, headers: ["Content-Type": "application/json"], body: try jsonString(body))
        applyAuth(&request, provider: provider, apiKey: apiKey)
        return request
    }

    public static func extractModelNames(provider: String, data: Data) -> [String] {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return []
        }
        let items = (provider == "google" ? object["models"] : (object["data"] ?? object["models"])) as? [[String: Any]] ?? []
        var names: Set<String> = []
        for item in items {
            if provider == "google" {
                let methods = item["supportedGenerationMethods"] as? [String] ?? []
                if !methods.contains("generateContent") {
                    continue
                }
            }
            guard var name = (item["id"] as? String) ?? (item["name"] as? String), !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                continue
            }
            if name.hasPrefix("models/") {
                name = String(name.dropFirst("models/".count))
            }
            names.insert(name)
        }
        return names.sorted()
    }

    public static func extractAssistantContent(provider: String, data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        if provider == "anthropic" {
            return (object["content"] as? [[String: Any]])?.compactMap { $0["text"] as? String }.first
        }
        if provider == "google" {
            let candidates = object["candidates"] as? [[String: Any]]
            let content = candidates?.first?["content"] as? [String: Any]
            return (content?["parts"] as? [[String: Any]])?.compactMap { $0["text"] as? String }.first
        }
        let choices = object["choices"] as? [[String: Any]]
        let message = choices?.first?["message"] as? [String: Any]
        return message?["content"] as? String
    }

    public static func parseDraftedRules(_ text: String, startingOrder: Int) throws -> [FileRule] {
        let value = try parseJsonValue(text)
        let items: [[String: Any]]
        if let array = value as? [[String: Any]] {
            items = array
        } else if let object = value as? [String: Any], let rules = object["rules"] as? [[String: Any]] {
            items = rules
        } else if let object = value as? [String: Any] {
            items = [object]
        } else {
            items = []
        }
        return items.enumerated().map { index, item in
            normalizeAssistantRule(item, order: startingOrder + index, index: index)
        }
    }

    static func applyAuth(_ request: inout AssistantRequest, provider: String, apiKey: String) {
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        if provider == "anthropic" {
            request.headers["anthropic-version"] = "2023-06-01"
            if !key.isEmpty {
                request.headers["x-api-key"] = key
            }
        } else if provider == "google" {
            if !key.isEmpty {
                request.headers["x-goog-api-key"] = key
            }
        } else if !key.isEmpty {
            request.headers["Authorization"] = "Bearer \(key)"
        }
    }

    static func jsonString(_ object: Any) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    static func parseJsonValue(_ text: String) throws -> Any {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let data = trimmed.data(using: .utf8),
           let value = try? JSONSerialization.jsonObject(with: data) {
            return value
        }

        let objectStart = trimmed.firstIndex(of: "{")
        let arrayStart = trimmed.firstIndex(of: "[")
        let useArray = arrayStart != nil && (objectStart == nil || arrayStart! < objectStart!)
        let start = useArray ? arrayStart : objectStart
        let end = useArray ? trimmed.lastIndex(of: "]") : trimmed.lastIndex(of: "}")
        guard let start, let end, start < end,
              let data = String(trimmed[start...end]).data(using: .utf8) else {
            throw KeepDirError.message("Rule assistant did not return JSON")
        }
        return try JSONSerialization.jsonObject(with: data)
    }

    static func normalizeAssistantRule(_ raw: [String: Any], order: Int, index: Int) -> FileRule {
        let extensionValue = nestedValue(raw, section: "match", key: "extensionIn")
        let extensionIn: [String]
        if let extensions = extensionValue as? [Any] {
            extensionIn = normalizeExtensions(extensions.compactMap(cleanString))
        } else {
            extensionIn = parseExtensions(cleanString(extensionValue) ?? "")
        }

        return FileRule(
            id: "rule-\(QueueEngine.nowMs())-\(index)",
            name: cleanString(findValueByLooseKey(raw, "name")) ?? "Drafted rule",
            enabled: false,
            order: order,
            match: RuleMatch(
                nameContains: cleanString(nestedValue(raw, section: "match", key: "nameContains")),
                extensionIn: extensionIn,
                sourceUrlContains: cleanString(nestedValue(raw, section: "match", key: "sourceUrlContains")),
                downloadedFromContains: cleanString(nestedValue(raw, section: "match", key: "downloadedFromContains"))
            ),
            action: RuleActionConfig(
                targetFolder: cleanString(nestedValue(raw, section: "action", key: "targetFolder")),
                targetNameTemplate: cleanString(nestedValue(raw, section: "action", key: "targetNameTemplate")),
                ask: (nestedValue(raw, section: "action", key: "ask") as? Bool) == true
            ),
            stopOnMatch: (findValueByLooseKey(raw, "stopOnMatch") as? Bool) != false
        )
    }

    static func parseExtensions(_ value: String) -> [String] {
        let separators = CharacterSet(charactersIn: ",; ")
        return normalizeExtensions(value.components(separatedBy: separators))
    }

    static func normalizeExtensions(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in values {
            let item = value.trimmingCharacters(in: .whitespacesAndNewlines).trimmedDotPrefix().lowercased()
            if item.isEmpty || seen.contains(item) {
                continue
            }
            seen.insert(item)
            result.append(item)
        }
        return result
    }

    static func cleanString(_ value: Any?) -> String? {
        guard let text = value as? String else {
            return nil
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    static func nestedValue(_ raw: [String: Any], section: String, key: String) -> Any? {
        if let sectionObject = findValueByLooseKey(raw, section) as? [String: Any],
           let direct = findValueByLooseKey(sectionObject, key) {
            return direct
        }
        return findValueByLooseKey(raw, "\(section).\(key)")
    }

    static func findValueByLooseKey(_ raw: [String: Any], _ key: String) -> Any? {
        if let direct = raw[key] {
            return direct
        }
        let normalized = normalizeLookupKey(key)
        return raw.first { normalizeLookupKey($0.key) == normalized }?.value
    }

    static func normalizeLookupKey(_ value: String) -> String {
        String(value.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }.map(Character.init))
    }
}

public enum RuleAssistantKeychain {
    public static let service = "KeepDir Rule Assistant"

    public static func getApiKey(provider: String) throws -> String? {
        try RuleAssistant.ensureProvider(provider)
        #if os(macOS)
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query(provider, returningData: true) as CFDictionary, &result)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = result as? Data else {
            throw KeepDirError.message("Keychain read failed: \(status)")
        }
        return String(data: data, encoding: .utf8)
        #else
        return nil
        #endif
    }

    public static func resolveApiKey(provider: String, apiKey: String) throws -> String {
        let trimmed = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? try getApiKey(provider: provider) ?? "" : trimmed
    }

    public static func saveApiKey(provider: String, apiKey: String) throws {
        try RuleAssistant.ensureProvider(provider)
        let trimmed = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            try deleteApiKey(provider: provider)
            return
        }
        #if os(macOS)
        let data = Data(trimmed.utf8)
        let status = SecItemUpdate(query(provider) as CFDictionary, [kSecValueData: data] as CFDictionary)
        if status == errSecItemNotFound {
            var item = query(provider)
            item[kSecValueData] = data
            let addStatus = SecItemAdd(item as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw KeepDirError.message("Keychain write failed: \(addStatus)")
            }
        } else if status != errSecSuccess {
            throw KeepDirError.message("Keychain write failed: \(status)")
        }
        #endif
    }

    public static func deleteApiKey(provider: String) throws {
        try RuleAssistant.ensureProvider(provider)
        #if os(macOS)
        let status = SecItemDelete(query(provider) as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw KeepDirError.message("Keychain delete failed: \(status)")
        }
        #endif
    }

    #if os(macOS)
    static func query(_ provider: String, returningData: Bool = false) -> [CFString: Any] {
        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: provider
        ]
        if returningData {
            query[kSecReturnData] = true
            query[kSecMatchLimit] = kSecMatchLimitOne
        }
        return query
    }
    #endif
}

extension String {
    fileprivate func trimmedDotPrefix() -> String {
        var value = self
        while value.first == "." {
            value.removeFirst()
        }
        return value
    }
}
