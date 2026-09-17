import XCTest
@testable import OpenUsage

/// Fork: `~/.claude-*` config homes become their own Claude cards.
@MainActor
final class ClaudeConfigDirectoryAccountTests: XCTestCase {
    func testDiscoversConfigHomesAsSeparateCards() async throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: home) }
        for name in [".claude-work", ".claude-personal", ".claude-shared"] {
            try FileManager.default.createDirectory(at: home.appendingPathComponent(name), withIntermediateDirectories: true)
        }
        let work = "11111111-1111-1111-1111-111111111111|aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        let personal = "22222222-2222-2222-2222-222222222222|bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
        func state(_ key: String, _ email: String) -> String {
            let parts = key.split(separator: "|")
            return #"{"oauthAccount":{"accountUuid":"\#(parts[0])","organizationUuid":"\#(parts[1])","emailAddress":"\#(email)","organizationName":"Org"}}"#
        }
        let files = FakeFiles([
            home.path + "/.claude-work/.claude.json": state(work, "work@example.com"),
            home.path + "/.claude-personal/.claude.json": state(personal, "me@example.com"),
        ])
        let suite = "ClaudeConfigDirTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let observer = DefaultAccountObserver(
            environment: FakeEnvironment(["CLAUDE_CONFIG_DIR": home.path + "/.claude-personal"]),
            files: files, keychain: FakeKeychain(), homeDirectory: { home }
        )
        let assembly = await ProviderAccountAssembly.make(
            observer: observer, accountsStore: ProviderAccountsStore(defaults: defaults)
        )

        XCTAssertEqual(assembly.claudeCards.count, 2)
        XCTAssertEqual(Set(assembly.claudeCards.map(\.identityKey)), [work, personal])
        XCTAssertEqual(Set(assembly.claudeCards.compactMap(\.swapAccount?.configDirectory)),
                       [home.path + "/.claude-work", home.path + "/.claude-personal"])
        XCTAssertTrue(assembly.claudeCards.allSatisfy { $0.additionalLogDirectories.isEmpty })
    }
}
