import Foundation

/// A user-supplied API key already on the machine — an environment variable or a small JSON/plain-text
/// config file — for providers with no companion CLI/app that stashes a credential (OpenRouter, Z.ai, LiteLLM).
/// The full read / status / save / delete behavior lives here so each such provider is a thin wrapper
/// over its own config paths, env-var names, and error messages instead of a line-for-line copy.
///
/// A GUI app launched from Finder/Dock doesn't inherit the interactive shell environment, so
/// `ProcessEnvironmentReader` captures the login shell's environment at launch (see
/// `LoginShellEnvironment`) — an env var exported in a shell profile is honored even in a packaged
/// build; the config file remains the explicit path.
struct UserAPIKeyStore: Sendable {
    /// A save/delete failure the wrapper maps to its provider's own error, preserving the user-facing message.
    enum Failure { case missingKey, saveFailed, deleteFailed }

    let configPaths: [String]
    let environmentNames: [String]
    var files: TextFileAccessing
    var environment: EnvironmentReading
    let makeError: @Sendable (Failure) -> Error

    /// Config file first, environment second: the config file is the path a user edits to rotate or
    /// replace the key, so it wins over a stale env value an old `launchctl setenv` may have left behind.
    func loadKey() -> String? {
        keyFromConfigFile() ?? keyFromEnvironment()
    }

    /// Which combination of sources currently holds a key — drives the four-state per-provider API-key
    /// editor. A saved key plus an environment key is `overrideActive` because config wins.
    func keyStatus() -> APIKeyStatus {
        let hasConfig = keyFromConfigFile() != nil
        let hasEnv = keyFromEnvironment() != nil
        switch (hasConfig, hasEnv) {
        case (true, true): return .overrideActive
        case (true, false): return .saved
        case (false, true): return .fromEnvironment
        default: return .notSet
        }
    }

    /// Persist `key` to the primary config file (as JSON `{"apiKey":"…"}`), which wins over a stale env
    /// var — so this is also the "override" path. Other settings already in the file (LiteLLM's `host`)
    /// are kept. Empty input is rejected as `.missingKey`.
    func saveKey(_ key: String) throws {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw makeError(.missingKey) }
        var object = Self.settingsObject(configPaths[0], files: files)
        Self.keyFields.forEach { object.removeValue(forKey: $0) }
        object["apiKey"] = trimmed
        try write(object, to: configPaths[0], failure: .saveFailed)
    }

    /// Remove the saved key from every config path (not just the primary), so clearing truly clears it —
    /// otherwise a key in an alternate path would resurface. Non-key settings stay; a file left with
    /// nothing else is removed. A missing file is a no-op.
    func deleteKey() throws {
        for path in configPaths where files.exists(path) {
            var object = Self.settingsObject(path, files: files)
            Self.keyFields.forEach { object.removeValue(forKey: $0) }
            try write(object, to: path, failure: .deleteFailed)
        }
    }

    /// A non-key string setting stored beside the key in the primary config file (e.g. LiteLLM's `host`).
    func configValue(_ field: String) -> String? {
        (Self.settingsObject(configPaths[0], files: files)[field] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
    }

    /// Store (or, with `nil`, remove) a non-key setting in the primary config file, keeping the key.
    func saveConfigValue(_ field: String, _ value: String?) throws {
        var object = Self.settingsObject(configPaths[0], files: files)
        if let plainKey = keyFromConfigFile(), object.isEmpty, files.exists(configPaths[0]) {
            object["apiKey"] = plainKey  // a plain-text key file becomes JSON so the key survives
        }
        object[field] = value
        try write(object, to: configPaths[0], failure: .saveFailed)
    }

    /// Fields that hold the key itself, in read precedence order.
    private static let keyFields = ["apiKey", "api_key", "key"]

    /// The JSON object in `path`, or empty when the file is missing, plain text, or not an object.
    private static func settingsObject(_ path: String, files: TextFileAccessing) -> [String: Any] {
        guard files.exists(path), let text = try? files.readText(path), let data = text.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return [:] }
        return object
    }

    /// Write `object` as sorted JSON, or remove the file when nothing is left in it.
    private func write(_ object: [String: Any], to path: String, failure: Failure) throws {
        do {
            if object.isEmpty {
                try files.remove(path)
            } else {
                let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
                try files.writeText(path, String(decoding: data, as: UTF8.self))
            }
        } catch {
            AppLog.error(.auth, "update API key config at \(path) failed: \(error.localizedDescription)")
            throw makeError(failure)
        }
    }

    private func keyFromEnvironment() -> String? {
        for name in environmentNames {
            if let value = environment.value(for: name)?.trimmingCharacters(in: .whitespacesAndNewlines),
               !value.isEmpty {
                return value
            }
        }
        return nil
    }

    private func keyFromConfigFile() -> String? {
        for path in configPaths {
            guard files.exists(path), let text = try? files.readText(path) else { continue }
            if let key = Self.keyFromConfigText(text) {
                return key
            }
        }
        return nil
    }

    /// Accept a JSON object with `apiKey` / `api_key` / `key`, or a plain-text file holding only the key.
    static func keyFromConfigText(_ text: String) -> String? {
        if let data = text.data(using: .utf8),
           let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
            for field in keyFields {
                if let value = (object[field] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !value.isEmpty {
                    return value
                }
            }
            return nil
        }

        // Not JSON: treat as a plain-text key file, ignoring blank lines.
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed.contains("{") ? nil : trimmed
    }
}
