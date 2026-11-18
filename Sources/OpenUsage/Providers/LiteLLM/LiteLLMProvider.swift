import Foundation

@MainActor
final class LiteLLMProvider: ProviderRuntime {
    let provider = Provider(id: "litellm", displayName: "LiteLLM", icon: .providerMark("litellm"))

    let authStore: LiteLLMAuthStore
    let usageClient: LiteLLMUsageClient
    let now: @Sendable () -> Date

    init(
        authStore: LiteLLMAuthStore = LiteLLMAuthStore(),
        usageClient: LiteLLMUsageClient = LiteLLMUsageClient(),
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.authStore = authStore
        self.usageClient = usageClient
        self.now = now
    }

    var widgetDescriptors: [WidgetDescriptor] {
        [
            .boundedDollars(id: "litellm.budget", provider: provider, title: "Budget",
                            metricLabel: "Budget", limit: 100, valueWord: "spent")
                .exportingLimit("budget", unit: "usd"),
            .values(id: "litellm.spend", provider: provider, title: "Spend",
                    metricLabel: "Spend", selection: .kind(.dollars))
        ]
    }

    func hasLocalCredentials() async -> Bool {
        // Same source as `refresh()`: both a key and a valid host are required.
        await loadOffMainActor { [authStore] in try? authStore.loadAuth() } != nil
    }

    func refresh() async -> ProviderSnapshot {
        let auth: LiteLLMAuth
        do {
            auth = try await loadOffMainActor { [authStore] in try authStore.loadAuth() }
        } catch {
            return ProviderSnapshot.error(provider: provider, error: error)
        }

        let response: HTTPResponse
        do {
            response = try await usageClient.fetchKeyInfo(auth)
        } catch {
            return ProviderSnapshot.error(provider: provider, error: LiteLLMUsageError.connectionFailed)
        }
        switch response.statusCode {
        case 200..<300: break
        case 401: return ProviderSnapshot.error(provider: provider, error: LiteLLMAuthError.invalidKey)
        case 403: return await refreshFromHeaders(auth)
        default:
            return ProviderSnapshot.error(provider: provider, error: LiteLLMUsageError.requestFailed(response.statusCode))
        }

        do {
            let mapped = try LiteLLMUsageMapper.map(response.body)
            return ProviderSnapshot.make(provider: provider, plan: mapped.plan, lines: mapped.lines, refreshedAt: now())
        } catch {
            return ProviderSnapshot.error(provider: provider, error: error)
        }
    }

    /// Fallback for keys that may only call LLM routes: read spend/budget off the free probe's headers.
    /// No reset time or alias this way — those live only in `/key/info`.
    private func refreshFromHeaders(_ auth: LiteLLMAuth) async -> ProviderSnapshot {
        guard let response = try? await usageClient.probeSpendHeaders(auth) else {
            return ProviderSnapshot.error(provider: provider, error: LiteLLMUsageError.connectionFailed)
        }
        if response.statusCode == 401 {
            return ProviderSnapshot.error(provider: provider, error: LiteLLMAuthError.invalidKey)
        }
        guard let lines = LiteLLMUsageMapper.mapHeaders(response) else {
            return ProviderSnapshot.error(provider: provider, error: LiteLLMAuthError.forbidden)
        }
        return ProviderSnapshot.make(provider: provider, plan: nil, lines: lines, refreshedAt: now())
    }
}

extension LiteLLMProvider: APIHostManaging {
    var apiKeyStatus: APIKeyStatus { authStore.keyStatus() }
    var apiKeyPlaceholder: String { "sk-…" }
    var hostPlaceholder: String { "https://litellm.example.com" }
    func currentAPIKey() -> String? { authStore.currentAPIKey() }
    func saveAPIKey(_ key: String) throws { try authStore.saveAPIKey(key) }
    func deleteAPIKey() throws { try authStore.deleteAPIKey() }
    func currentHost() -> String? { authStore.currentHost() }
    func saveHost(_ host: String) throws { try authStore.saveHost(host) }
}
