import XCTest
@testable import KeepDirCore

final class KeepDirCoreTests: XCTestCase {
    func testSharedRuleEvalFixtures() throws {
        let fixtureDir = fixtureRoot().appendingPathComponent("rule-eval")
        let files = try FileManager.default.contentsOfDirectory(at: fixtureDir, includingPropertiesForKeys: nil).filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
        XCTAssertFalse(files.isEmpty)

        for file in files {
            let fixture = try JSONDecoder().decode(RuleEvalFixture.self, from: Data(contentsOf: file))
            let temp = try TempDir()
            let source = temp.url.appendingPathComponent(fixture.fileName)
            try FileManager.default.createDirectory(at: source.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data("a".utf8).write(to: source)
            for existing in fixture.existingTargets {
                let target = temp.url.appendingPathComponent(existing.replacingOccurrences(of: "\\", with: "/"))
                try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                try Data("existing".utf8).write(to: target)
            }

            let action = RuleEngine.evaluateRuleAction(
                id: "id",
                workspaceId: "default",
                folderPath: temp.url.path,
                filePath: source.path,
                snapshot: try QueueEngine.snapshot(source.path),
                rules: fixture.rules,
                metadata: fixture.metadata ?? DownloadMetadata()
            )

            XCTAssertEqual(action.status, fixture.expected.status, file.lastPathComponent)
            XCTAssertEqual(action.ruleId, fixture.expected.ruleId, file.lastPathComponent)
            XCTAssertEqual(action.ruleName, fixture.expected.ruleName, file.lastPathComponent)
            XCTAssertEqual(action.targetName, expandExpected(fixture.expected.targetName), file.lastPathComponent)
            XCTAssertEqual(action.errorMessage, expandExpected(fixture.expected.errorMessage), file.lastPathComponent)
            if let suffix = expandExpected(fixture.expected.targetPathSuffix)?.replacingOccurrences(of: "\\", with: "/") {
                XCTAssertTrue(action.targetPath?.replacingOccurrences(of: "\\", with: "/").hasSuffix(suffix) == true, file.lastPathComponent)
            }
            for expectedTrace in fixture.expected.trace {
                let trace = try XCTUnwrap(action.ruleTrace.first { $0.ruleId == expectedTrace.ruleId }, file.lastPathComponent)
                XCTAssertEqual(trace.matched, expectedTrace.matched, file.lastPathComponent)
                XCTAssertEqual(trace.uncertain, expectedTrace.uncertain, file.lastPathComponent)
                for reason in expectedTrace.reasons {
                    XCTAssertTrue(trace.reasons.contains(reason), "\(file.lastPathComponent): missing \(reason)")
                }
            }
        }
    }

    func testSharedFilenameSanitizeFixtures() throws {
        let fixture = try JSONDecoder().decode(SanitizeFixture.self, from: Data(contentsOf: fixtureRoot().appendingPathComponent("filename-sanitize/cases.json")))
        for item in fixture.cases {
            if let error = item.error {
                XCTAssertThrowsError(try RuleEngine.safeFilename(item.input)) { actual in
                    XCTAssertEqual(String(describing: actual), "message(\"\(error)\")")
                }
            } else {
                XCTAssertEqual(try RuleEngine.safeFilename(item.input), item.output)
            }
        }
    }

    func testSafeFilenameMatchesSharedRules() throws {
        XCTAssertEqual(try RuleEngine.safeFilename("CON.txt"), "CON_.txt")
        XCTAssertEqual(try RuleEngine.safeFilename("lpt9"), "lpt9_")
        XCTAssertEqual(try RuleEngine.safeFilename("  report?.pdf. "), "report_.pdf")
        XCTAssertThrowsError(try RuleEngine.safeFilename("..."))
    }

    func testShouldCheckUpdatesTodayUsesUtcDateSetting() {
        XCTAssertTrue(shouldCheckUpdatesToday(.object([:])))
        XCTAssertTrue(shouldCheckUpdatesToday(.object(["lastUpdateCheckDate": .string("2000-01-01")])))
        XCTAssertFalse(shouldCheckUpdatesToday(.object(["lastUpdateCheckDate": .string(keepDirTodayUtc())])))
    }

    func testReleaseUrlPointsToPublicReleasesPage() {
        XCTAssertEqual(keepDirReleasesURLString, "https://github.com/oshtz/keepdir/releases")
    }

    func testPendingNotificationOnlyFiresOnZeroToPositiveEdge() {
        XCTAssertFalse(shouldNotifyPending(previousPendingCount: nil, pendingCount: 2))
        XCTAssertTrue(shouldNotifyPending(previousPendingCount: 0, pendingCount: 2))
        XCTAssertFalse(shouldNotifyPending(previousPendingCount: 2, pendingCount: 3))
        XCTAssertFalse(shouldNotifyPending(previousPendingCount: 2, pendingCount: 0))
    }

    func testPendingMenuLabelsMatchMacMenuContract() {
        XCTAssertEqual(pendingRenamesMenuLabel(0), "Pending renames: 0")
        XCTAssertEqual(renamePendingFilesMenuLabel(0), "Rename 0 pending files")
        XCTAssertEqual(renamePendingFilesMenuLabel(1), "Rename 1 pending file")
        XCTAssertEqual(renamePendingFilesMenuLabel(2), "Rename 2 pending files")
    }

    func testScanIntervalsMatchWatcherContract() {
        XCTAssertEqual(keepDirDebounceIntervalNanoseconds, 250_000_000)
        XCTAssertEqual(keepDirStableScanIntervalNanoseconds, 500_000_000)
        XCTAssertEqual(keepDirPollingIntervalNanoseconds, 2 * 1_000_000_000)
        XCTAssertEqual(keepDirWatcherRebuildIntervalNanoseconds, 5 * 1_000_000_000)
        XCTAssertEqual(keepDirSafetyScanIntervalNanoseconds, 60 * 1_000_000_000)
    }

    func testThemeToggleLabelsMatchMacThemeContract() {
        XCTAssertEqual(themeToggleLabel("light"), "Dark theme")
        XCTAssertEqual(nextTheme("light"), "dark")
        XCTAssertEqual(themeToggleLabel("dark"), "Light theme")
        XCTAssertEqual(nextTheme("dark"), "light")
    }

    func testRuleSummaryTextMatchesMacRuleListContract() {
        let rule = FileRule(
            id: "rule",
            name: "Docs",
            match: RuleMatch(nameContains: "invoice", extensionIn: ["pdf"], sourceUrlContains: "example.com"),
            action: RuleActionConfig(targetFolder: "Docs", targetNameTemplate: "{name}-{date}", ask: true)
        )
        XCTAssertEqual(ruleSummaryText(rule), "name contains invoice, extension pdf, source URL contains example.com -> folder Docs, name {name}-{date}, ask")
        XCTAssertEqual(ruleSummaryText(FileRule(id: "all", name: "All")), "matches all files -> keep")
    }

    func testRulesWithEnabledTogglesOnlyMatchingRule() {
        let rules = [
            FileRule(id: "one", name: "One", enabled: true),
            FileRule(id: "two", name: "Two", enabled: true)
        ]
        let updated = rulesWithEnabled(rules, id: "two", enabled: false)
        XCTAssertTrue(updated[0].enabled)
        XCTAssertFalse(updated[1].enabled)
        XCTAssertEqual(updated.map(\.order), [0, 1])
    }

    func testRulesUpdatingAndEditorExtensionsMatchMacRuleEditorContract() {
        let rules = [FileRule(id: "one", name: "One")]
        let updated = rulesUpdating(rules, id: "one") { rule in
            rule.match.extensionIn = ruleEditorExtensions("PDF, .JPG; png")
            rule.action.targetFolder = "Docs"
        }
        XCTAssertEqual(updated[0].match.extensionIn, ["pdf", "jpg", "png"])
        XCTAssertEqual(updated[0].action.targetFolder, "Docs")
    }

    func testRulesDuplicateAndDeleteMatchMacRuleListContract() {
        let rules = [
            FileRule(id: "one", name: "One", enabled: true, order: 4),
            FileRule(id: "two", name: "Two", enabled: true, order: 9)
        ]

        let duplicated = rulesDuplicating(rules, id: "one", copyId: "copy")
        XCTAssertEqual(duplicated.map(\.id), ["one", "copy", "two"])
        XCTAssertEqual(duplicated.map(\.order), [0, 1, 2])
        XCTAssertEqual(duplicated[1].name, "One copy")
        XCTAssertFalse(duplicated[1].enabled)

        let deleted = rulesDeleting(duplicated, id: "copy")
        XCTAssertEqual(deleted.map(\.id), ["one", "two"])
        XCTAssertEqual(deleted.map(\.order), [0, 1])
    }

    func testRulesMovingMatchesMacRuleListContract() {
        let rules = [
            FileRule(id: "one", name: "One", order: 0),
            FileRule(id: "two", name: "Two", order: 1),
            FileRule(id: "three", name: "Three", order: 2)
        ]
        XCTAssertEqual(rulesMoving(rules, id: "two", offset: -1).map(\.id), ["two", "one", "three"])
        XCTAssertEqual(rulesMoving(rules, id: "two", offset: 1).map(\.id), ["one", "three", "two"])
        XCTAssertEqual(rulesMoving(rules, id: "one", offset: -1).map(\.id), ["one", "two", "three"])
        XCTAssertEqual(rulesMoving(rules, id: "missing", offset: 1).map(\.order), [0, 1, 2])
    }

    func testQueueEmptyStateLabelsMatchMacQueueContract() {
        XCTAssertEqual(queueEmptyStateText(filter: "all", showHistory: false), "No active queue items.")
        XCTAssertEqual(queueEmptyStateText(filter: "ready", showHistory: false), "No ready files.")
        XCTAssertEqual(queueEmptyStateText(filter: "check", showHistory: false), "No files need review.")
        XCTAssertEqual(queueEmptyStateText(filter: "blocked", showHistory: false), "No blocked files.")
        XCTAssertEqual(queueEmptyStateText(filter: "all", showHistory: true), "No queue history yet.")
    }

    func testQueueGroupAndStatusLabelsMatchMacQueueContract() {
        let pending = RuleAction(
            id: "id",
            workspaceId: "default",
            folderPath: "/tmp",
            filePath: "/tmp/a.pdf",
            originalName: "a.pdf",
            ruleTrace: [],
            status: "pending",
            fileSize: 1,
            fileMtimeMs: 2,
            createdAt: "1",
            updatedAt: "1"
        )
        XCTAssertEqual(ruleActionGroupName(pending), "Unmatched")
        XCTAssertEqual(ruleActionStatusLabel("pending"), "ready")
        XCTAssertEqual(ruleActionStatusLabel("needs_review"), "check")
        XCTAssertEqual(ruleActionStatusLabel("conflict"), "blocked")
        XCTAssertEqual(ruleActionStatusLabel("stale"), "warning")
        XCTAssertEqual(ruleActionStatusLabel("error"), "danger")
        XCTAssertEqual(ruleActionStatusLabel("applied"), "history")
        XCTAssertEqual(ruleActionStatusLabel("skipped"), "history")
        XCTAssertEqual(ruleActionStatusLabel("undone"), "history")
    }

    func testRuleActionTooltipTextIncludesErrorAndTrace() {
        let action = RuleAction(
            id: "id",
            workspaceId: "default",
            folderPath: "/tmp",
            filePath: "/tmp/a.pdf",
            originalName: "a.pdf",
            ruleTrace: [
                RuleTraceItem(ruleId: "docs", ruleName: "Docs", matched: true, uncertain: false, reasons: ["extension matched"]),
                RuleTraceItem(ruleId: "downloads", ruleName: "Downloads", matched: false, uncertain: true, reasons: ["metadata missing"])
            ],
            status: "conflict",
            fileSize: 1,
            fileMtimeMs: 2,
            errorMessage: "Target already exists",
            createdAt: "1",
            updatedAt: "1"
        )

        let text = ruleActionTooltipText(action)
        XCTAssertTrue(text?.contains("Target already exists") == true)
        XCTAssertTrue(text?.contains("Docs - matched: extension matched") == true)
        XCTAssertTrue(text?.contains("Downloads - uncertain: metadata missing") == true)
        XCTAssertNil(ruleActionTooltipText(RuleAction(id: "id", workspaceId: "default", folderPath: "/tmp", filePath: "/tmp/a.pdf", originalName: "a.pdf", ruleTrace: [], status: "pending", fileSize: 1, fileMtimeMs: 2, createdAt: "1", updatedAt: "1")))
    }

    func testRuleTestSummaryTextMatchesRuleTestPanelContract() {
        let action = RuleAction(
            id: "id",
            workspaceId: "default",
            folderPath: "/tmp",
            filePath: "/tmp/a.pdf",
            originalName: "a.pdf",
            targetPath: "/tmp/Docs/a.pdf",
            targetName: "a.pdf",
            ruleId: "docs",
            ruleName: "Docs",
            ruleTrace: [],
            status: "conflict",
            fileSize: 1,
            fileMtimeMs: 2,
            errorMessage: "Target already exists",
            createdAt: "1",
            updatedAt: "1"
        )
        XCTAssertEqual(ruleTestSummaryText(action, rootPath: "/tmp"), "conflict: Docs/a.pdf via Docs - Target already exists")
        XCTAssertEqual(ruleTestSummaryText(RuleAction(id: "id", workspaceId: "default", folderPath: "/tmp", filePath: "/tmp/a.pdf", originalName: "a.pdf", ruleTrace: [], status: "needs_review", fileSize: 1, fileMtimeMs: 2, createdAt: "1", updatedAt: "1"), rootPath: "/tmp"), "needs_review: a.pdf")
    }

    func testQueueActionEnablementMatchesMacFooterContract() {
        var action = RuleAction(id: "id", workspaceId: "default", folderPath: "/tmp", filePath: "/tmp/a.pdf", originalName: "a.pdf", ruleTrace: [], status: "pending", fileSize: 1, fileMtimeMs: 2, createdAt: "1", updatedAt: "1")
        XCTAssertTrue(ruleActionCanRetarget(action))
        XCTAssertTrue(ruleActionCanApply(action))
        XCTAssertFalse(ruleActionCanUndo(action))
        XCTAssertTrue(ruleActionCanSkip(action))

        action.status = "applied"
        XCTAssertFalse(ruleActionCanRetarget(action))
        XCTAssertFalse(ruleActionCanApply(action))
        XCTAssertTrue(ruleActionCanUndo(action))
        XCTAssertFalse(ruleActionCanSkip(action))

        action.status = "skipped"
        XCTAssertFalse(ruleActionCanRetarget(action))
        XCTAssertFalse(ruleActionCanApply(action))
        XCTAssertFalse(ruleActionCanUndo(action))
        XCTAssertFalse(ruleActionCanSkip(action))
    }

    func testSkipOneMatchesMacQueueContract() throws {
        var action = RuleAction(id: "id", workspaceId: "default", folderPath: "/tmp", filePath: "/tmp/a.pdf", originalName: "a.pdf", ruleTrace: [], status: "conflict", fileSize: 1, fileMtimeMs: 2, errorMessage: "Target already exists", createdAt: "1", updatedAt: "1")
        try QueueEngine.skipOne(&action)
        XCTAssertEqual(action.status, "skipped")
        XCTAssertNil(action.errorMessage)
        XCTAssertNotEqual(action.updatedAt, "1")

        XCTAssertThrowsError(try QueueEngine.skipOne(&action))
    }

    func testEvaluateMatchingRuleToPendingTarget() {
        let root = "/watched"
        let row = RuleEngine.evaluateRuleAction(
            id: "id",
            workspaceId: "default",
            folderPath: root,
            filePath: "\(root)/invoice.pdf",
            snapshot: FileSnapshot(size: 1, mtimeMs: 2),
            rules: [
                FileRule(
                    id: "rule-1",
                    name: "Docs",
                    match: RuleMatch(extensionIn: ["pdf"]),
                    action: RuleActionConfig(targetFolder: "Documents")
                )
            ]
        )

        XCTAssertEqual(row.status, "pending")
        XCTAssertEqual(row.targetPath, "/watched/Documents/invoice.pdf")
        XCTAssertEqual(row.ruleName, "Docs")
    }

    func testMissingMetadataBecomesReview() {
        let root = "/watched"
        let row = RuleEngine.evaluateRuleAction(
            id: "id",
            workspaceId: "default",
            folderPath: root,
            filePath: "\(root)/download.bin",
            snapshot: FileSnapshot(size: 1, mtimeMs: 2),
            rules: [
                FileRule(
                    id: "rule-1",
                    name: "Browser downloads",
                    match: RuleMatch(downloadedFromContains: "Chrome"),
                    action: RuleActionConfig(targetFolder: "Downloads")
                )
            ]
        )

        XCTAssertEqual(row.status, "needs_review")
        XCTAssertEqual(row.errorMessage, "downloaded-from metadata unavailable")
        XCTAssertEqual(row.ruleTrace.first?.uncertain, true)
    }

    func testContinueRuleMergesActionFields() {
        let root = "/watched"
        let row = RuleEngine.evaluateRuleAction(
            id: "id",
            workspaceId: "default",
            folderPath: root,
            filePath: "\(root)/Invoice.PDF",
            snapshot: FileSnapshot(size: 1, mtimeMs: 2),
            rules: [
                FileRule(
                    id: "rule-1",
                    name: "Docs",
                    match: RuleMatch(extensionIn: ["pdf"]),
                    action: RuleActionConfig(targetFolder: "Documents"),
                    stopOnMatch: false
                ),
                FileRule(
                    id: "rule-2",
                    name: "Rename",
                    order: 1,
                    match: RuleMatch(extensionIn: ["pdf"]),
                    action: RuleActionConfig(targetNameTemplate: "{basename}-{date}.{ext}")
                )
            ]
        )

        XCTAssertEqual(row.status, "pending")
        XCTAssertEqual(row.ruleName, "Rename")
        XCTAssertEqual(row.ruleTrace.filter(\.matched).count, 2)
        XCTAssertTrue(row.targetPath?.contains("/Documents/Invoice-") == true)
        XCTAssertTrue(row.targetPath?.hasSuffix(".pdf") == true)
    }

    func testStoreRecoversBackupAndKeepsOpaqueJson() async throws {
        let temp = try TempDir()
        let manager = StoreManager(directory: temp.url)
        let store = Store(
            settings: .object(["theme": .string("dark"), "unknownArray": .array([.number(1), .object(["x": .bool(true)])])]),
            workspaceSettings: ["default": ["opaque": .object(["nested": .string("yes")])]]
        )

        try await manager.save(store)
        let storeURL = temp.url.appendingPathComponent("keepdir.json")
        let backupURL = temp.url.appendingPathComponent("keepdir.json.bak")
        try FileManager.default.copyItem(at: storeURL, to: backupURL)
        try Data("{ bad json".utf8).write(to: storeURL)

        let recovered = try await StoreManager(directory: temp.url).load()
        XCTAssertEqual(recovered.settings, store.settings)
        XCTAssertEqual(recovered.workspaceSettings["default"]?["opaque"], .object(["nested": .string("yes")]))
    }

    func testExistingStorePreservesOpaqueJsonWhenPresent() throws {
        guard let appData = ProcessInfo.processInfo.environment["APPDATA"] else {
            return
        }
        let url = URL(fileURLWithPath: appData)
            .appendingPathComponent("com.oshtz.keepdir")
            .appendingPathComponent("keepdir.json")
        guard FileManager.default.fileExists(atPath: url.path) else {
            return
        }

        let original = try JSONDecoder().decode(Store.self, from: Data(contentsOf: url))
        let encoded = try JSONEncoder().encode(original)
        let roundTrip = try JSONDecoder().decode(Store.self, from: encoded)

        XCTAssertEqual(roundTrip.settings, original.settings)
        XCTAssertEqual(roundTrip.workspaceSettings, original.workspaceSettings)
        XCTAssertEqual(roundTrip.watchFolders.keys.sorted(), original.watchFolders.keys.sorted())
        XCTAssertEqual(roundTrip.ruleActions.keys.sorted(), original.ruleActions.keys.sorted())
    }

    func testMetadataParsersMatchSpec() throws {
        let zone = """
        [ZoneTransfer]
        ReferrerUrl=https://referrer.example/download
        HostUrl=https://host.example/file.zip
        AppName=Chrome
        """
        let windows = MetadataReader.parseWindowsZoneIdentifier(zone)
        XCTAssertEqual(windows.sourceUrl, "https://host.example/file.zip")
        XCTAssertEqual(windows.downloadedFrom, "Chrome")

        let plist = try PropertyListSerialization.data(
            fromPropertyList: [" https://example.com/file.zip ", "https://example.com/downloads"],
            format: .binary,
            options: 0
        )
        let mac = MetadataReader.parseMacOSWhereFroms(plist)
        XCTAssertEqual(mac.sourceUrl, "https://example.com/file.zip")
        XCTAssertEqual(mac.downloadedFrom, "https://example.com/file.zip https://example.com/downloads")
    }

    func testRuleAssistantRequestShapesAndParsing() throws {
        XCTAssertThrowsError(try RuleAssistant.ensureProvider("not-a-provider"))
        XCTAssertEqual(RuleAssistant.providerNames, ["openai", "google", "anthropic", "openrouter", "lmstudio", "ollama"])
        XCTAssertEqual(RuleAssistant.defaultEndpoint("openai"), "https://api.openai.com/v1")
        XCTAssertEqual(RuleAssistant.defaultModel("openai"), "gpt-5.4-mini")

        let anthropic = try RuleAssistant.buildDraftRequest(provider: "anthropic", endpoint: "https://api.anthropic.com/", model: "claude", description: "sort pdfs", apiKey: "key")
        XCTAssertEqual(anthropic.url, "https://api.anthropic.com/messages")
        XCTAssertEqual(anthropic.headers["anthropic-version"], "2023-06-01")
        XCTAssertEqual(anthropic.headers["x-api-key"], "key")
        XCTAssertTrue(anthropic.body?.contains("\"max_tokens\":800") == true)

        let google = try RuleAssistant.buildDraftRequest(provider: "google", endpoint: "https://generativelanguage.googleapis.com/v1beta", model: "models/gemini", description: "sort pdfs", apiKey: "key")
        XCTAssertEqual(google.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent")
        XCTAssertEqual(google.headers["x-goog-api-key"], "key")

        let openai = try RuleAssistant.buildDraftRequest(provider: "openai", endpoint: "https://api.openai.com/v1", model: "gpt", description: "sort pdfs", apiKey: "key")
        XCTAssertEqual(openai.url, "https://api.openai.com/v1/chat/completions")
        XCTAssertEqual(openai.headers["Authorization"], "Bearer key")

        let lmStudio = try RuleAssistant.buildDraftRequest(provider: "lmstudio", endpoint: "http://localhost:1234/v1", model: "local-model", description: "sort pdfs", apiKey: "")
        XCTAssertEqual(lmStudio.url, "http://localhost:1234/v1/chat/completions")
        XCTAssertNil(lmStudio.headers["Authorization"])

        let ollamaModels = try RuleAssistant.buildModelsRequest(provider: "ollama", endpoint: "http://localhost:11434/v1/", apiKey: "")
        XCTAssertEqual(ollamaModels.url, "http://localhost:11434/v1/models")
        XCTAssertNil(ollamaModels.headers["Authorization"])

        let googleModels = Data("""
        {
          "models": [
            { "name": "models/gemini-pro", "supportedGenerationMethods": ["generateContent"] },
            { "name": "models/embed", "supportedGenerationMethods": ["embedContent"] }
          ]
        }
        """.utf8)
        XCTAssertEqual(RuleAssistant.extractModelNames(provider: "google", data: googleModels), ["gemini-pro"])

        let openAIModels = Data(#"{ "data": [{ "id": "b" }, { "id": "a" }, { "id": "a" }] }"#.utf8)
        XCTAssertEqual(RuleAssistant.extractModelNames(provider: "openai", data: openAIModels), ["a", "b"])

        let anthropicContent = Data(#"{ "content": [{ "text": "[{\"name\":\"Docs\"}]" }] }"#.utf8)
        XCTAssertEqual(RuleAssistant.extractAssistantContent(provider: "anthropic", data: anthropicContent), "[{\"name\":\"Docs\"}]")
    }

    func testRuleAssistantParsesDraftedRulesAsDisabledRules() throws {
        let rules = try RuleAssistant.parseDraftedRules("""
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
        """, startingOrder: 4)

        let rule = try XCTUnwrap(rules.first)
        XCTAssertEqual(rules.count, 1)
        XCTAssertTrue(rule.id.hasPrefix("rule-"))
        XCTAssertEqual(rule.name, "Docs")
        XCTAssertFalse(rule.enabled)
        XCTAssertEqual(rule.order, 4)
        XCTAssertEqual(rule.match.extensionIn, ["pdf", "jpg"])
        XCTAssertEqual(rule.action.targetFolder, "Documents")
        XCTAssertEqual(rule.action.ask, true)
        XCTAssertEqual(rule.stopOnMatch, false)
    }

    func testRuleAssistantKeychainContract() throws {
        XCTAssertEqual(RuleAssistantKeychain.service, "KeepDir Rule Assistant")
        XCTAssertEqual(try RuleAssistantKeychain.resolveApiKey(provider: "openai", apiKey: "  key  "), "key")
        XCTAssertThrowsError(try RuleAssistantKeychain.getApiKey(provider: "bad-provider"))
    }

    func testPruneDropsOldTerminalHistoryOnly() {
        var store = Store(ruleActions: [
            "default": [
                ruleAction(id: "old", status: "skipped", updatedAt: "1"),
                ruleAction(id: "recent", status: "skipped", updatedAt: "9999999999999"),
                ruleAction(id: "pending", status: "pending", updatedAt: "1")
            ]
        ])

        XCTAssertEqual(QueueEngine.pruneRuleActions(&store), Set(["default"]))
        XCTAssertEqual(store.ruleActions["default"]?.map(\.id), ["recent", "pending"])
    }

    func testScannerQueuesOnlyAfterFileIsStable() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        try Data("a".utf8).write(to: source)
        var store = try storeWithRule(root: temp.url)
        var seen: [String: SeenFile] = [:]

        XCTAssertEqual(Scanner.scanStore(&store, seen: &seen), [])
        XCTAssertEqual(Scanner.scanStore(&store, seen: &seen), Set(["default"]))
        XCTAssertEqual(store.ruleActions["default"]?.count, 1)
        XCTAssertEqual(Scanner.scanStore(&store, seen: &seen), [])
    }

    func testScannerMarksOutOfScopeActiveActionsStale() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        try Data("a".utf8).write(to: source)
        var store = try storeWithRule(root: temp.url)
        var seen: [String: SeenFile] = [:]

        _ = Scanner.scanStore(&store, seen: &seen)
        _ = Scanner.scanStore(&store, seen: &seen)
        try FileManager.default.removeItem(at: source)

        XCTAssertEqual(Scanner.scanStore(&store, seen: &seen), Set(["default"]))
        XCTAssertEqual(store.ruleActions["default"]?.first?.status, "stale")
        XCTAssertEqual(store.ruleActions["default"]?.first?.errorMessage, "File is no longer in the watched scope")
    }

    func testScannerKeepsActionsInScopeThroughSymlinkedTempRoot() throws {
        let root = URL(fileURLWithPath: "/tmp/keepdir-scanner-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let source = root.appendingPathComponent("report-final.pdf")
        try Data("a".utf8).write(to: source)
        let snapshot = try QueueEngine.snapshot(source.path)
        var store = Store(
            watchFolders: [
                "default": [
                    WatchFolder(id: "watch", path: root.path, enabled: true)
                ]
            ],
            ruleActions: [
                "default": [
                    RuleAction(
                        id: "action",
                        workspaceId: "default",
                        folderPath: root.path,
                        filePath: source.path,
                        originalName: source.lastPathComponent,
                        targetPath: root.appendingPathComponent("Invoices/report-final.pdf").path,
                        targetName: "report-final.pdf",
                        ruleId: "rule",
                        ruleName: "Invoices",
                        ruleTrace: [],
                        status: "conflict",
                        fileSize: snapshot.size,
                        fileMtimeMs: snapshot.mtimeMs,
                        errorMessage: "Target already exists",
                        createdAt: "1",
                        updatedAt: "1"
                    )
                ]
            ]
        )
        var seen: [String: SeenFile] = [:]

        XCTAssertEqual(Scanner.scanStore(&store, seen: &seen), [])
        XCTAssertEqual(store.ruleActions["default"]?.first?.status, "conflict")
    }

    func testApplyMovesPendingFileAndUndoMovesBack() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        let target = temp.url.appendingPathComponent("Documents/invoice.pdf")
        try Data("a".utf8).write(to: source)
        var action = try pendingAction(root: temp.url, source: source, target: target)

        try QueueEngine.applyOne(&action)
        XCTAssertEqual(action.status, "applied")
        XCTAssertFalse(FileManager.default.fileExists(atPath: source.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: target.path))

        try QueueEngine.undoOne(&action)
        XCTAssertEqual(action.status, "undone")
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: target.path))
    }

    func testApplyMarksConflictWithoutOverwriting() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        let target = temp.url.appendingPathComponent("Documents/invoice.pdf")
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("a".utf8).write(to: source)
        try Data("existing".utf8).write(to: target)
        var action = try pendingAction(root: temp.url, source: source, target: target)

        XCTAssertThrowsError(try QueueEngine.applyOne(&action))
        XCTAssertEqual(action.status, "conflict")
        XCTAssertEqual(String(data: try Data(contentsOf: target), encoding: .utf8), "existing")
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path))
    }

    func testApplyMarksStaleWhenFileChanged() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        let target = temp.url.appendingPathComponent("Documents/invoice.pdf")
        try Data("a".utf8).write(to: source)
        var action = try pendingAction(root: temp.url, source: source, target: target)
        Thread.sleep(forTimeInterval: 0.01)
        try Data("changed".utf8).write(to: source)

        XCTAssertThrowsError(try QueueEngine.applyOne(&action))
        XCTAssertEqual(action.status, "stale")
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: target.path))
    }

    func testApplyRejectsParentDirTarget() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        let target = temp.url.appendingPathComponent("../outside/invoice.pdf")
        try Data("a".utf8).write(to: source)
        var action = try pendingAction(root: temp.url, source: source, target: target)

        XCTAssertThrowsError(try QueueEngine.applyOne(&action)) { error in
            XCTAssertEqual(String(describing: error), #"message("Target path must stay inside the watched folder")"#)
        }
        XCTAssertEqual(action.status, "error")
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path))
    }

    func testApplyRejectsSymlinkTargetDirectoryWhenAvailable() throws {
        let temp = try TempDir()
        let outside = try TempDir()
        let link = temp.url.appendingPathComponent("Linked")
        do {
            try FileManager.default.createSymbolicLink(at: link, withDestinationURL: outside.url)
        } catch {
            return
        }

        let source = temp.url.appendingPathComponent("invoice.pdf")
        let target = link.appendingPathComponent("invoice.pdf")
        try Data("a".utf8).write(to: source)
        var action = try pendingAction(root: temp.url, source: source, target: target)

        XCTAssertThrowsError(try QueueEngine.applyOne(&action)) { error in
            XCTAssertEqual(String(describing: error), #"message("Target directory resolves through a symlink")"#)
        }
        XCTAssertEqual(action.status, "error")
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path))
    }

    func testRetargetChangesConflictToPendingWhenNameIsFree() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        let target = temp.url.appendingPathComponent("Documents/invoice.pdf")
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("a".utf8).write(to: source)
        try Data("existing".utf8).write(to: target)
        var action = try pendingAction(root: temp.url, source: source, target: target)
        action.status = "conflict"
        action.errorMessage = "Target already exists"

        try QueueEngine.retargetOne(&action, targetName: "invoice-2.pdf")
        XCTAssertEqual(action.status, "pending")
        XCTAssertNil(action.errorMessage)
        XCTAssertEqual(action.targetName, "invoice-2.pdf")
        XCTAssertTrue(action.targetPath?.hasSuffix("invoice-2.pdf") == true)
    }

    func testSuggestedRetargetNameUsesNextFreeConflictName() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        let target = temp.url.appendingPathComponent("Documents/invoice.pdf")
        let second = temp.url.appendingPathComponent("Documents/invoice-2.pdf")
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("a".utf8).write(to: source)
        try Data("existing".utf8).write(to: target)
        try Data("existing".utf8).write(to: second)
        var action = try pendingAction(root: temp.url, source: source, target: target)
        action.status = "conflict"
        action.errorMessage = "Target already exists"

        XCTAssertEqual(QueueEngine.suggestedRetargetName(action), "invoice-3.pdf")
    }

    func testConflictSuggestedRetargetApplyUndoCycle() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        let target = temp.url.appendingPathComponent("Documents/invoice.pdf")
        let retargeted = temp.url.appendingPathComponent("Documents/invoice-2.pdf")
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("new".utf8).write(to: source)
        try Data("existing".utf8).write(to: target)
        var action = try pendingAction(root: temp.url, source: source, target: target)
        action.status = "conflict"
        action.errorMessage = "Target already exists"

        try QueueEngine.retargetOne(&action, targetName: QueueEngine.suggestedRetargetName(action))
        try QueueEngine.applyOne(&action)
        XCTAssertEqual(action.status, "applied")
        XCTAssertEqual(String(data: try Data(contentsOf: retargeted), encoding: .utf8), "new")
        XCTAssertEqual(String(data: try Data(contentsOf: target), encoding: .utf8), "existing")

        try QueueEngine.undoOne(&action)
        XCTAssertEqual(action.status, "undone")
        XCTAssertEqual(String(data: try Data(contentsOf: source), encoding: .utf8), "new")
        XCTAssertFalse(FileManager.default.fileExists(atPath: retargeted.path))
    }

    func testRefreshMatchingRuleActionsReevaluatesExistingFile() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        try Data("a".utf8).write(to: source)
        var store = try storeWithRule(root: temp.url, targetFolder: "Documents")
        var seen: [String: SeenFile] = [:]
        _ = Scanner.scanStore(&store, seen: &seen)
        _ = Scanner.scanStore(&store, seen: &seen)
        XCTAssertTrue(store.ruleActions["default"]?.first?.targetPath?.contains("Documents") == true)

        store.workspaceSettings["default"]?["automationRules"] = try jsonValue([
            FileRule(
                id: "rule-1",
                name: "Docs",
                match: RuleMatch(extensionIn: ["pdf"]),
                action: RuleActionConfig(targetFolder: "Archive")
            )
        ])

        XCTAssertTrue(QueueEngine.refreshMatchingRuleActions(&store, workspaceId: "default") { $0.status == "pending" })
        XCTAssertEqual(store.ruleActions["default"]?.count, 1)
        XCTAssertTrue(store.ruleActions["default"]?.first?.targetPath?.contains("Archive") == true)
    }

    func testRefreshMatchingRuleActionsMarksMissingFileStale() throws {
        let temp = try TempDir()
        let source = temp.url.appendingPathComponent("invoice.pdf")
        try Data("a".utf8).write(to: source)
        var store = try storeWithRule(root: temp.url)
        var seen: [String: SeenFile] = [:]
        _ = Scanner.scanStore(&store, seen: &seen)
        _ = Scanner.scanStore(&store, seen: &seen)
        try FileManager.default.removeItem(at: source)

        XCTAssertTrue(QueueEngine.refreshMatchingRuleActions(&store, workspaceId: "default") { _ in true })
        XCTAssertEqual(store.ruleActions["default"]?.first?.status, "stale")
        XCTAssertEqual(store.ruleActions["default"]?.first?.errorMessage, "File changed since action was generated")
    }

    func ruleAction(id: String, status: String, updatedAt: String) -> RuleAction {
        RuleAction(
            id: id,
            workspaceId: "default",
            folderPath: "/watched",
            filePath: "/watched/\(id).pdf",
            originalName: "\(id).pdf",
            targetPath: nil,
            targetName: nil,
            ruleId: nil,
            ruleName: nil,
            ruleTrace: [],
            status: status,
            fileSize: 1,
            fileMtimeMs: 2,
            errorMessage: nil,
            appliedSourcePath: nil,
            appliedTargetPath: nil,
            createdAt: updatedAt,
            updatedAt: updatedAt
        )
    }

    func pendingAction(root: URL, source: URL, target: URL) throws -> RuleAction {
        let snapshot = try QueueEngine.snapshot(source.path)
        return RuleAction(
            id: "id",
            workspaceId: "default",
            folderPath: root.path,
            filePath: source.path,
            originalName: source.lastPathComponent,
            targetPath: target.path,
            targetName: target.lastPathComponent,
            ruleId: "rule-1",
            ruleName: "Docs",
            ruleTrace: [],
            status: "pending",
            fileSize: snapshot.size,
            fileMtimeMs: snapshot.mtimeMs,
            errorMessage: nil,
            appliedSourcePath: nil,
            appliedTargetPath: nil,
            createdAt: "1",
            updatedAt: "1"
        )
    }

    func storeWithRule(root: URL, targetFolder: String = "Documents") throws -> Store {
        Store(
            workspaceSettings: ["default": ["automationRules": try jsonValue([
                FileRule(
                    id: "rule-1",
                    name: "Docs",
                    match: RuleMatch(extensionIn: ["pdf"]),
                    action: RuleActionConfig(targetFolder: targetFolder)
                )
            ])]],
            watchFolders: ["default": [WatchFolder(id: "watch-1", path: root.path, enabled: true)]]
        )
    }

    func jsonValue<T: Encodable>(_ value: T) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
    }

    func fixtureRoot() -> URL {
        URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("spec/fixtures")
    }

    func expandExpected(_ value: String?) -> String? {
        value?.replacingOccurrences(of: "{today}", with: RuleEngine.todayUtc())
    }
}

final class TempDir {
    let url: URL

    init() throws {
        url = FileManager.default.temporaryDirectory.appendingPathComponent("keepdir-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    deinit {
        try? FileManager.default.removeItem(at: url)
    }
}

struct RuleEvalFixture: Decodable {
    var rules: [FileRule]
    var fileName: String
    var metadata: DownloadMetadata?
    var existingTargets: [String]
    var expected: ExpectedRuleAction
}

struct ExpectedRuleAction: Decodable {
    var status: String
    var targetPathSuffix: String?
    var targetName: String?
    var ruleId: String?
    var ruleName: String?
    var errorMessage: String?
    var trace: [ExpectedTraceItem]
}

struct ExpectedTraceItem: Decodable {
    var ruleId: String
    var matched: Bool
    var uncertain: Bool
    var reasons: [String]
}

struct SanitizeFixture: Decodable {
    var cases: [SanitizeCase]
}

struct SanitizeCase: Decodable {
    var input: String
    var output: String?
    var error: String?
}
