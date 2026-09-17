import Foundation

/// Metadata only. Discover saved slots without running shell aliases or reading any secrets.
struct ClaudeSwapAccount: Equatable, Sendable {
    let root: String
    let slot: String
    let email: String
    let identityKey: String
    let organizationID: String
    var organizationName: String? = nil
    /// Fork: set for a plain `CLAUDE_CONFIG_DIR` home (e.g. `~/.claude-work`) instead of a Swap slot.
    /// Its logs belong to this account by directory, so the card scans only this home.
    var configDirectory: String? = nil

    func displayName(fallbackOrganization: String? = nil) -> String {
        let organization = organizationName ?? fallbackOrganization ?? "Organization \(organizationID.prefix(8))"
        return "Claude: \(organization) (\(email))"
    }

    var sessionDirectory: String {
        if let configDirectory { return configDirectory }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
        let slug = email.precomposedStringWithCanonicalMapping.unicodeScalars.map {
            allowed.contains($0) ? String($0) : "_"
        }.joined()
        return "\(root)/sessions/\(slot)-\(slug)"
    }

    /// Fork: every `~/.claude-*` home whose `.claude.json` names an account and organization, e.g. the
    /// homes behind `alias claude-work='CLAUDE_CONFIG_DIR=~/.claude-work claude'`.
    static func discoverConfigDirectories(files: TextFileAccessing, home: URL) -> [Self] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: home.path)) ?? []
        return names.filter { $0.hasPrefix(".claude-") && $0 != ".claude-swap-backup" }.sorted().compactMap { name in
            let directory = home.appendingPathComponent(name).path
            guard let text = try? files.readTextIfPresent(directory + "/.claude.json"),
                  let state = try? JSONDecoder().decode(DefaultAccountObserver.ClaudeStateFile.self, from: Data(text.utf8)),
                  let account = state.oauthAccount,
                  let identity = DefaultAccountObserver.claudeIdentityKey(account), identity.contains("|"),
                  let organization = identity.split(separator: "|").last
            else { return nil }
            return Self(root: directory, slot: name, email: account.emailAddress ?? name,
                        identityKey: identity, organizationID: String(organization),
                        organizationName: account.organizationName?.nilIfEmpty, configDirectory: directory)
        }
    }

    static func discover(files: TextFileAccessing, home: URL) -> [Self] {
        let root = home.appendingPathComponent(".claude-swap-backup").path
        do {
            guard let text = try files.readTextIfPresent(root + "/sequence.json") else { return [] }
            guard let object = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
                  let accounts = object["accounts"] as? [String: Any]
            else {
                AppLog.error(.config, "Claude Swap account list is malformed; saved accounts could not be discovered")
                return []
            }
            return accounts.keys.sorted { $0.localizedStandardCompare($1) == .orderedAscending }.compactMap { slot in
                guard !slot.isEmpty, slot.allSatisfy({ $0.isASCII && $0.isNumber }),
                      let account = accounts[slot] as? [String: Any],
                      let email = account["email"] as? String, !email.isEmpty,
                      !email.contains("/"), !email.contains("\\"), !email.contains("\0"),
                      let uuid = (account["uuid"] as? String).flatMap(UUID.init(uuidString:)),
                      let org = (account["organizationUuid"] as? String).flatMap(UUID.init(uuidString:))
                else {
                    AppLog.warn(.config, "Claude Swap slot has no usable account and organization identity; skipping it")
                    return nil
                }
                let organization = org.uuidString.lowercased()
                return Self(root: root, slot: slot, email: email,
                            identityKey: "\(uuid.uuidString.lowercased())|\(organization)",
                            organizationID: organization,
                            organizationName: (account["organizationName"] as? String)?
                                .trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty)
            }
        } catch {
            // Do not include JSON or decoder descriptions, which can contain credential material.
            AppLog.error(.config, "Claude Swap account list could not be read or decoded")
            return []
        }
    }
}

extension ClaudeAuthStore {
    /// Vault copies belong to Claude Swap. Read their access tokens, but never rotate or overwrite
    /// them: that would leave Swap's active/session copies holding an invalidated refresh token.
    func loadSwapVaultCredential(_ account: ClaudeSwapAccount) -> ClaudeCredentialState? {
        func candidate(_ text: String) -> ClaudeCredentialState? {
            guard let parsed = Self.parseCredentials(text), var oauth = parsed.claudeAiOauth,
                  oauth.accessToken?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            else { return nil }
            oauth.refreshToken = nil
            return ClaudeCredentialState(oauth: oauth, source: .swapVault, fullData: nil, inferenceOnly: false)
        }

        let path = "\(account.root)/credentials/.creds-\(account.slot)-\(account.email).enc"
        do {
            if let encoded = try files.readTextIfPresent(path) {
                if let data = Data(base64Encoded: encoded.trimmingCharacters(in: .whitespacesAndNewlines)),
                   let text = String(data: data, encoding: .utf8), let state = candidate(text) {
                    return state
                }
                AppLog.warn(LogTag.auth("claude"), "Claude Swap backup file is malformed; trying its Keychain copy")
            }
        } catch {
            AppLog.warn(LogTag.auth("claude"), "Claude Swap backup file could not be read; trying its Keychain copy")
        }
        do {
            guard let text = try keychain.readGenericPassword(
                service: "claude-swap", account: "account-\(account.slot)-\(account.email)"
            ) else { return nil }
            guard let state = candidate(text) else {
                AppLog.warn(LogTag.auth("claude"), "Claude Swap Keychain backup has no usable OAuth credential")
                return nil
            }
            return state
        } catch {
            AppLog.error(LogTag.auth("claude"), "Claude Swap Keychain backup could not be read")
            return nil
        }
    }
}
