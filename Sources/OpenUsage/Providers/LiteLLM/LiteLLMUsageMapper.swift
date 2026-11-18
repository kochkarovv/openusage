import Foundation

/// Maps LiteLLM's `/key/info` payload — `{"key": "…", "info": {"spend", "max_budget", …}}` — into the
/// key's spend and, when the key carries one, its budget meter. LiteLLM budgets are a hard dollar cap
/// on the key (optionally resetting every `budget_duration`), not a subscription.
enum LiteLLMUsageMapper {
    static func map(_ body: Data) throws -> (plan: String?, lines: [MetricLine]) {
        guard let root = ProviderParse.jsonObject(body) else { throw LiteLLMUsageError.invalidResponse }
        let info = root["info"] as? [String: Any] ?? root
        guard let spend = ProviderParse.number(info["spend"]) else { throw LiteLLMUsageError.invalidResponse }
        let alias = (info["key_alias"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (alias?.nilIfEmpty, lines(
            spend: spend,
            budget: ProviderParse.number(info["max_budget"]),
            resetsAt: (info["budget_reset_at"] as? String).flatMap(OpenUsageISO8601.date(from:))
        ))
    }

    /// Spend + budget from the `x-litellm-key-spend` / `x-litellm-key-max-budget` headers of the probe
    /// (see `LiteLLMUsageClient.probeSpendHeaders`). `nil` when the proxy didn't send the spend header.
    static func mapHeaders(_ response: HTTPResponse) -> [MetricLine]? {
        guard let spend = response.header("x-litellm-key-spend").flatMap(Double.init) else { return nil }
        return lines(spend: spend, budget: response.header("x-litellm-key-max-budget").flatMap(Double.init), resetsAt: nil)
    }

    private static func lines(spend: Double, budget: Double?, resetsAt: Date?) -> [MetricLine] {
        let spend = max(0, spend)
        var lines: [MetricLine] = []
        // A key without a budget (`null` / `None`) is uncapped: no meter, just the spend row.
        if let budget, budget > 0 {
            lines.append(.progress(label: "Budget", used: spend, limit: budget, format: .dollars, resetsAt: resetsAt))
        }
        lines.append(.values(label: "Spend", values: [MetricValue(number: spend, kind: .dollars)]))
        return lines
    }
}
