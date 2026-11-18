import Foundation

struct LiteLLMAuth: Hashable, Sendable {
    var apiKey: String
    /// The proxy's base URL, normalized (no trailing `/` or `/v1`).
    var baseURL: URL
}

enum LiteLLMAuthError: Error, LocalizedError, Equatable {
    case missingKey
    case missingHost
    case invalidHost
    case invalidKey
    case forbidden
    case saveFailed
    case deleteFailed

    init(_ failure: UserAPIKeyStore.Failure) {
        switch failure {
        case .missingKey: self = .missingKey
        case .saveFailed: self = .saveFailed
        case .deleteFailed: self = .deleteFailed
        }
    }

    var errorDescription: String? {
        switch self {
        case .missingKey:
            return "No LiteLLM API key. Add it in Customize → LiteLLM → API Key, or set LITELLM_API_KEY."
        case .missingHost:
            return "No LiteLLM host. Add your proxy URL in Customize → LiteLLM → API Key, or set LITELLM_API_BASE."
        case .invalidHost:
            return "LiteLLM host isn't a valid http(s) URL, like https://litellm.example.com."
        case .invalidKey:
            return "LiteLLM API key invalid. Check the key with your LiteLLM admin."
        case .forbidden:
            return "This LiteLLM key can't read its usage, and the proxy didn't report its spend."
        case .saveFailed:
            return "Couldn't save the LiteLLM settings."
        case .deleteFailed:
            return "Couldn't remove the saved LiteLLM API key."
        }
    }
}

/// Reads a LiteLLM proxy virtual key plus the proxy's host. LiteLLM is self-hosted, so both are
/// required and both come from the user: the config file (written by the Customize card) or the
/// environment. The host sits beside the key in the same JSON file: `{"apiKey": "…", "host": "…"}`.
struct LiteLLMAuthStore: Sendable {
    static let configPaths = ["~/.config/openusage/litellm.json"]
    static let environmentNames = ["LITELLM_API_KEY", "LITELLM_PROXY_API_KEY"]
    static let hostEnvironmentNames = ["LITELLM_API_BASE", "LITELLM_PROXY_API_BASE", "LITELLM_BASE_URL"]
    static let hostField = "host"

    private let store: UserAPIKeyStore

    init(
        files: TextFileAccessing = LocalTextFileAccessor(),
        environment: EnvironmentReading = ProcessEnvironmentReader()
    ) {
        store = UserAPIKeyStore(
            configPaths: Self.configPaths,
            environmentNames: Self.environmentNames,
            files: files,
            environment: environment,
            makeError: { LiteLLMAuthError($0) }
        )
    }

    /// Key + host, or the reason they aren't usable yet.
    func loadAuth() throws -> LiteLLMAuth {
        guard let key = store.loadKey() else { throw LiteLLMAuthError.missingKey }
        guard let host = currentHost() else { throw LiteLLMAuthError.missingHost }
        guard let url = Self.normalizedHost(host) else { throw LiteLLMAuthError.invalidHost }
        return LiteLLMAuth(apiKey: key, baseURL: url)
    }

    /// The host as configured (config file first, then environment), before normalization.
    func currentHost() -> String? {
        store.configValue(Self.hostField) ?? store.environmentValue(Self.hostEnvironmentNames)
    }

    /// Validate and save the host; an empty value removes the saved host (falling back to the env).
    func saveHost(_ raw: String) throws {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return try store.saveConfigValue(Self.hostField, nil) }
        guard let url = Self.normalizedHost(trimmed) else { throw LiteLLMAuthError.invalidHost }
        try store.saveConfigValue(Self.hostField, url.absoluteString)
    }

    func currentAPIKey() -> String? { store.loadKey() }
    func keyStatus() -> APIKeyStatus { store.keyStatus() }
    func saveAPIKey(_ key: String) throws { try store.saveKey(key) }
    func deleteAPIKey() throws { try store.deleteKey() }

    /// `litellm.corp/` → `https://litellm.corp`; keeps an explicit `http://` (local proxies) and any
    /// path prefix, drops a pasted OpenAI-style `/v1`. `nil` for anything that isn't http(s) with a host.
    static func normalizedHost(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.contains("://") { text = "https://" + text }
        text = text.trimmingTrailingSlashes
        if text.hasSuffix("/v1") { text = String(text.dropLast(3)).trimmingTrailingSlashes }
        guard let components = URLComponents(string: text),
              let scheme = components.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = components.host, !host.isEmpty,
              components.query == nil, components.fragment == nil
        else { return nil }
        return components.url
    }
}
