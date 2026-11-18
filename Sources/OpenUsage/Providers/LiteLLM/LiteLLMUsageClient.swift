import Foundation

struct LiteLLMUsageClient: Sendable {
    var http: any HTTPClient

    init(http: any HTTPClient = URLSessionHTTPClient()) {
        self.http = http
    }

    /// `GET /key/info` with no `key` param describes the calling virtual key: spend, budget, reset.
    func fetchKeyInfo(_ auth: LiteLLMAuth) async throws -> HTTPResponse {
        try await send(HTTPRequest(method: "GET", url: auth.baseURL.appendingPathComponent("key/info")), auth)
    }

    /// For keys limited to LLM routes (`/key/info` → 403): a chat completion naming a model that doesn't
    /// exist is rejected before any provider call (`x-litellm-response-cost: 0`), yet LiteLLM still
    /// stamps the key's spend and budget on the response headers. The model name makes the probe
    /// recognizable in the proxy's logs.
    func probeSpendHeaders(_ auth: LiteLLMAuth) async throws -> HTTPResponse {
        try await send(HTTPRequest(
            method: "POST",
            url: auth.baseURL.appendingPathComponent("v1/chat/completions"),
            headers: ["Content-Type": "application/json"],
            body: Data(#"{"model":"openusage-usage-probe","messages":[]}"#.utf8)
        ), auth)
    }

    private func send(_ request: HTTPRequest, _ auth: LiteLLMAuth) async throws -> HTTPResponse {
        var request = request
        request.headers["Authorization"] = "Bearer \(auth.apiKey)"
        request.headers["Accept"] = "application/json"
        request.timeout = 15
        return try await http.send(request)
    }
}

enum LiteLLMUsageError: Error, LocalizedError, Equatable {
    case connectionFailed
    case invalidResponse
    case requestFailed(Int)
    /// The proxy rejected the key as over budget without saying by how much.
    case budgetExceeded

    var errorDescription: String? {
        switch self {
        case .connectionFailed:
            return "Couldn't reach your LiteLLM proxy. Check the host and your connection."
        case .invalidResponse:
            return "LiteLLM usage data unavailable. Check that the host points at a LiteLLM proxy."
        case .requestFailed(let status):
            return "LiteLLM request failed (HTTP \(status))."
        case .budgetExceeded:
            return "This LiteLLM key is over its budget."
        }
    }
}
